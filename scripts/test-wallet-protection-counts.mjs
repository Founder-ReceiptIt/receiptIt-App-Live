import assert from 'node:assert/strict';
import { getWalletProtection } from '../src/lib/walletProtection.ts';
const now = Date.parse('2026-09-10T12:00:00Z');
const base = {id:'one',userId:'a',status:'parsed',documentType:'receipt',warrantyDate:'2027-09-10',returnDate:'2026-10-10'};
const ids = (rows, owner='a', time=now) => {const p=getWalletProtection(rows,owner,time);return [[...p.warranty],[...p.returns]];};
assert.deepEqual(ids([base]),[['one'],['one']]);
assert.deepEqual(ids([base,base]),[['one'],['one']]);
assert.deepEqual(ids([base,{...base,id:'two'}]),[['one','two'],['one','two']]);
assert.deepEqual(ids([{...base,warrantyDate:'2020-01-01',returnDate:'2020-01-01'}]),[[],[]]);
assert.deepEqual(ids([{...base,warrantyDate:'invalid',returnDate:'invalid'}]),[[],[]]);
assert.deepEqual(ids([{...base,warrantyDate:undefined,returnDate:undefined}]),[[],[]]);
for(const status of ['failed','rejected','needs_review','processing','duplicate','needs_input'])assert.deepEqual(ids([{...base,status}]),[[],[]]);
assert.deepEqual(ids([{...base,documentType:'non_purchase_document'}]),[[],[]]);
assert.deepEqual(ids([{...base,errorReason:'unresolved'}]),[[],[]]);
const both=[base,{...base,id:'other-user',userId:'b'}];
assert.deepEqual(ids(both,'a'),[['one'],['one']]);
assert.deepEqual(ids(both,'b'),[['other-user'],['other-user']]);
assert.equal(getWalletProtection(both,undefined,now).warranty.size,0);
assert.deepEqual(ids([]),[[],[]]); // deletion
assert.deepEqual(ids([{...base,returnDate:'2020-01-01'}]),[['one'],[]]); // correction
assert.deepEqual(ids([base],'a',Date.parse('2028-01-01')),[[],[]]); // elapsed time alone
const today=new Date(now);today.setHours(0,0,0,0);
const nextDay=new Date(today);nextDay.setDate(nextDay.getDate()+1);
const boundary={...base,warrantyDate:new Date(now+1000).toISOString(),returnDate:today.toISOString()};
assert.deepEqual(ids([boundary]),[['one'],['one']]);
assert.deepEqual(ids([boundary],'a',now+1001),[[],['one']]);
assert.deepEqual(ids([boundary],'a',nextDay.getTime()),[[],[]]);
console.log('PASS: single/multiple/both, duplicate IDs, invalid/missing/expired dates, status exclusions, updates/deletion, owner switches, warranty instant and return calendar-day expiry');
