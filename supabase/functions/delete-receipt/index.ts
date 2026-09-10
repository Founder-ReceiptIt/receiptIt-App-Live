import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, isTrustedOrigin, isRateLimitAllowed } from "../_shared/security.ts";

const respond = (req: Request, body: Record<string, unknown>, status=200) => new Response(JSON.stringify(body), {
  status, headers:{...corsHeadersFor(req),"Content-Type":"application/json"},
});

// A failed cleanup remains durable and is retried by the scheduled worker.
async function cleanup(admin: SupabaseClient, userId?: string) {
  let query=admin.from("receipt_storage_cleanup").select("*").order("created_at").limit(100);
  if(userId) query=query.eq("user_id",userId);
  const {data:jobs,error}=await query;
  if(error) throw new Error("cleanup_queue_unavailable");
  let pending=0;
  for(const job of jobs||[]) {
    let code:string|null=null;
    if(!["receipts","proof-packs"].includes(job.bucket_id) || !job.storage_path.startsWith(`${job.user_id}/`) || job.storage_path.split("/").includes("..")) {
      code="unsafe_cleanup_path";
    } else {
      const {data:inUse,error:lookupError}=await admin.rpc("receipt_cleanup_path_in_use",{p_bucket:job.bucket_id,p_path:job.storage_path});
      if(lookupError) code="reference_check_failed";
      else if(!inUse) {
        const {error:removeError}=await admin.storage.from(job.bucket_id).remove([job.storage_path]);
        if(removeError) code="storage_cleanup_failed";
      }
    }
    if(code) {
      pending++;
      await admin.from("receipt_storage_cleanup").update({attempts:job.attempts+1,last_error:code}).eq("id",job.id);
      console.warn("[delete-receipt] Cleanup pending",{code,cleanupId:job.id});
    } else {
      const {error:ackError}=await admin.from("receipt_storage_cleanup").delete().eq("id",job.id);
      if(ackError) pending++;
    }
  }
  let remainingQuery=admin.from("receipt_storage_cleanup").select("id",{count:"exact",head:true});
  if(userId) remainingQuery=remainingQuery.eq("user_id",userId);
  const {count,error:countError}=await remainingQuery;
  if(countError) throw new Error("cleanup_count_unavailable");
  return Math.max(pending,count||0);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeadersFor(req)});
  if(req.method!=="POST") return respond(req,{error:"Method not allowed"},405);
  if(!isTrustedOrigin(req)) return respond(req,{error:"Request origin is not allowed"},403);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!key||!anon) return respond(req,{error:"Deletion is temporarily unavailable"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const workerSecret=Deno.env.get("RECEIPT_DELETE_CLEANUP_SECRET");
  const workerAuthorised=Boolean(workerSecret && req.headers.get("x-receipt-cleanup-key")===workerSecret);
  if(workerAuthorised) {
    // The job credential can only drain DB-created cleanup tasks. It cannot
    // select a receipt for deletion or provide arbitrary Storage paths.
    try { return respond(req,{success:true,pending:await cleanup(admin)}); }
    catch { return respond(req,{error:"Cleanup unavailable"},503); }
  }
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();
  if(!token) return respond(req,{error:"Authentication required"},401);
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError||!auth.user) return respond(req,{error:"Authentication required"},401);
  if(!await isRateLimitAllowed(url,key,"receipt_delete",auth.user.id,100,3600)) return respond(req,{error:"Please try again later"},429);
  let receiptId:unknown;
  try { receiptId=(await req.json()).receiptId; } catch { return respond(req,{error:"Invalid request"},400); }
  if(typeof receiptId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId)) return respond(req,{error:"Invalid receipt"},400);
  const owned=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  // Use the owner's JWT/RLS, not the administrative connection, for deletion.
  // Queue inserts, child cleanup and FK unlinking are in this single transaction.
  const {error:deleteError}=await owned.from("receipts").delete().eq("id",receiptId).eq("user_id",auth.user.id);
  if(deleteError) {
    console.warn("[delete-receipt] Database deletion failed",{code:deleteError.code});
    return respond(req,{error:"We couldn’t delete this receipt. Please try again."},409);
  }
  try { return respond(req,{success:true,cleanupPending:(await cleanup(admin,auth.user.id))>0}); }
  catch { return respond(req,{success:true,cleanupPending:true}); }
});
