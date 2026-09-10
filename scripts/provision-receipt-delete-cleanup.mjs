// Operator-only: reuse authenticated Supabase CLI. Never print/persist credentials.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const cli='/opt/homebrew/bin/supabase';
function run(args,input) { return execFileSync(cli,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}); }
const key=randomBytes(32).toString('hex');
try {
  run(['secrets','set','--project-ref','qqfntftbughorckugceu','--env-file','/dev/stdin'],`RECEIPT_DELETE_CLEANUP_SECRET=${key}\n`);
  run(['db','query','--linked','--file','/dev/stdin'],`do $$ declare existing_id uuid; begin
    select id into existing_id from vault.secrets where name='receipt_delete_cleanup_secret';
    if existing_id is null then perform vault.create_secret('${key}','receipt_delete_cleanup_secret','Restricted receipt Storage cleanup worker');
    else perform vault.update_secret(existing_id,'${key}'); end if;
  end $$;`);
  console.log('Restricted cleanup credential configured in Edge secrets and Vault; value not logged.');
} catch { console.error('Cleanup credential setup failed. No secret output retained.'); process.exitCode=1; }
