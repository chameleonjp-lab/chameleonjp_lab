/** Private isolated fixture harness; it never accepts a connection string or existing cluster. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSync, constants, mkdtempSync, mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn, spawnSync} from 'node:child_process';

const fixture=fileURLToPath(new URL('./fixtures/count-only-start-v2.sql', import.meta.url));
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333', D='44444444-4444-4444-8444-444444444444';
const login='fixture_owner', db='lab_count_fixture_v2', schema='lab_count_v2_fixture';
const fn=schema+'.record_start';
const basePayload=(id,mode='fixture_normal',version='test-1',kind='normal-start')=>({startId:id, mode, version, kind});
const call=(payload)=>`SELECT ${fn}('${JSON.stringify(payload)}'::jsonb)::text;`;
const allowedBin=['/usr/lib/postgresql/18/bin','/usr/lib/postgresql/17/bin','/usr/lib/postgresql/16/bin','/usr/lib/postgresql/15/bin','/usr/local/bin','/usr/bin'];
function findPg(){
 for(const dir of allowedBin)try{for(const f of ['initdb','pg_ctl','psql'])accessSync(join(dir,f),constants.X_OK);return dir;}catch{}
}
const bin=findPg(), isRoot=process.getuid?.()===0;
const pgOptIn=process.env.LAB_RUN_ISOLATED_COUNT_V2_PG==='1';
const pgEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)&&!['DATABASE_URL','SUPABASE_DB_URL','LD_PRELOAD','LD_LIBRARY_PATH'].includes(k)));
Object.assign(pgEnv,{LC_ALL:'C',TZ:'UTC'});
function checked(cmd,args,extra={}) {
 const out=spawnSync(join(bin,cmd),args,{env:pgEnv,encoding:'utf8',timeout:15_000,...extra});
 if(out.error||out.status!==0)throw new Error(`${cmd} failed: ${out.error?.message??out.status} ${out.stderr||''}`);
 return out.stdout.trim();
}
function newCluster(){
 const root=mkdtempSync(join(tmpdir(),'count-v2-pg-')), socket=join(root,'socket'), data=join(root,'data');
 mkdirSync(socket,{mode:0o700});
 let started=false;
 const args=(name)=>['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p','54491','-U',login,'-d',name];
 const psql=(input,name=db)=>checked('psql',args(name),{input});
 function cleanup(){
  if(started)checked('pg_ctl',['-D',data,'-w','-t','10','-m','immediate','stop']);
  // Retain this isolated cluster directory for review. Never recursively remove it.
 }
 try{
  checked('initdb',['-D',data,'--username='+login,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--no-locale']);
  // The socket is in a private 0700 directory; empty listen_addresses disables TCP.
  checked('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-w','-t','10','-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c port=54491`,'start']);
  started=true;
  psql('CREATE DATABASE '+db+';', 'postgres');
  return {psql,cleanup,parallel:input=>new Promise((resolve,reject)=>{
   const p=spawn(join(bin,'psql'),args(db),{env:pgEnv,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
   const timer=setTimeout(()=>p.kill(),12000);
   p.stdout.setEncoding('utf8').on('data',s=>{stdout+=s});
   p.stderr.setEncoding('utf8').on('data',s=>{stderr+=s});
   p.on('error',e=>{clearTimeout(timer);reject(e)});
   p.stdin.on('error',e=>{clearTimeout(timer);reject(e)});
   p.on('close',s=>{clearTimeout(timer);s===0?resolve(stdout.trim()):reject(new Error('isolated psql failed: '+stderr));});
   p.stdin.end(input);
  })};
 }catch(e){ cleanup();throw e; }
}
const sql=()=>readFileSync(fixture,'utf8');
const ready='CREATE TEMP TABLE lab_count_fixture_v2_marker (token text); INSERT INTO lab_count_fixture_v2_marker VALUES (\'private-synthetic-only\');\n';
const parse=s=>JSON.parse(s);
test('fixture source is structurally bounded and local harness names no production endpoint',()=>{
 const s=sql(), harness=readFileSync(fileURLToPath(import.meta.url),'utf8');
 assert.match(s,/^-- LOCAL FIXTURE ONLY/);
 assert.match(s,/^BEGIN;[\s\S]*COMMIT;\s*$/m);
 assert.match(s,/pg_catalog\.current_database\(\)[\s\S]*lab_count_fixture_v2_marker[\s\S]*CREATE SCHEMA lab_count_v2_fixture;/);
 assert.match(s,/SECURITY INVOKER[\s\S]*SET search_path = ''/);
 assert.match(s,/REVOKE ALL ON FUNCTION lab_count_v2_fixture\.record_start\(jsonb\) FROM PUBLIC;/);
 assert.match(s,/start_id uuid PRIMARY KEY/);
 assert.match(s,/ON CONFLICT \(start_id\) DO NOTHING/);
 assert.match(s,/FOR SHARE;/);
 assert.match(s,/ELSE 'conflict'/);
 assert.doesNotMatch(s,/\b(?:CREATE OR REPLACE|SECURITY DEFINER|public\.|private\.|supabase|player_count|ranking|display_name|participant_id|score)\b/i);
 assert.doesNotMatch(s,/^\s*(?:DROP|TRUNCATE|GRANT)\s/m);
 assert.match(s,/ledger_append_only BEFORE DELETE OR UPDATE OR TRUNCATE/);
 assert.doesNotMatch(harness,/https?:\/\//i);
});
test('private PostgreSQL: marker/transaction guards, duplicate replay and concurrent ID fencing, privacy and freeze', {skip:!pgOptIn?'opt-in only: LAB_RUN_ISOLATED_COUNT_V2_PG=1':!bin?'existing PostgreSQL binaries unavailable':isRoot?'initdb refuses root':false}, async()=>{
 const x=newCluster();
 try{
  assert.equal(x.psql("SHOW listen_addresses;"),'');
  assert.equal(x.psql("SHOW default_transaction_isolation;"),'read committed');
  assert.throws(()=>x.psql(sql()),/fixture marker absent/);
  assert.equal(x.psql("SELECT to_regnamespace('lab_count_v2_fixture') IS NULL;"),'t');
  x.psql(ready+sql());
  assert.throws(()=>x.psql(ready+sql()),/already exists/);
  x.psql(`INSERT INTO ${schema}.gate(mode,release_version,cohort,enabled) VALUES ('fixture_normal','test-1','era_a',true),('fixture_hard','test-1','era_a',true);`);
  assert.equal(parse(x.psql(call(basePayload(A)))).status,'accepted');
  assert.deepEqual(parse(x.psql(call(basePayload(A)))),{status:'duplicate',startId:A,mode:'fixture_normal',version:'test-1'});
  assert.deepEqual(parse(x.psql(call(basePayload(A,'fixture_hard')))),{status:'conflict'});
  for(const p of [basePayload(B,'unknown'),basePayload(B,'fixture_normal','old-1')])
   assert.deepEqual(parse(x.psql(call(p))),{status:'disabled'});
  for(const p of [basePayload(B,'fixture_normal','test-1','practice'),basePayload(B,'fixture_normal','test-1','result'),{...basePayload(B),displayName:'synthetic-name'},{...basePayload(B),participantId:'not-stored'}, {...basePayload(B),score:100}])
   assert.deepEqual(parse(x.psql(call(p))),{status:'invalid'});
  const duplicate=await Promise.all([x.parallel(call(basePayload(B))),x.parallel(call(basePayload(B)))]);
  assert.deepEqual(duplicate.map(s=>parse(s).status).sort(),['accepted','duplicate']);
  const mismatch=await Promise.all([x.parallel(call(basePayload(C))),x.parallel(call(basePayload(C,'fixture_hard')))]);
  assert.deepEqual(mismatch.map(s=>parse(s).status).sort(),['accepted','conflict']);
  assert.equal(parse(x.psql('BEGIN;'+call(basePayload(D))+'ROLLBACK;')).status,'accepted');
  assert.equal(x.psql(`SELECT count(*) FROM ${schema}.ledger WHERE start_id='${D}';`),'0');
  assert.equal(parse(x.psql(call(basePayload(D)))).status,'accepted');
  assert.equal(x.psql(`SELECT count(*) FROM ${schema}.ledger;`),'4');
  assert.equal(x.psql(`SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='ledger';`),'start_id,mode,release_version,cohort');
  assert.equal(x.psql(`SELECT NOT EXISTS(SELECT 1 FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a WHERE p.oid='${fn}(jsonb)'::regprocedure AND a.grantee=0);`),'t');
  x.psql('CREATE ROLE fixture_unprivileged NOLOGIN;');
  assert.throws(()=>x.psql('SET ROLE fixture_unprivileged;'+call(basePayload(A))),/permission denied for schema/);
  assert.throws(()=>x.psql(`SET ROLE fixture_unprivileged;SELECT count(*) FROM ${schema}.ledger;`),/permission denied for schema/);
  assert.throws(()=>x.psql(`UPDATE ${schema}.gate SET cohort='era_b';`),/gate identity is immutable/);
  assert.throws(()=>x.psql(`DELETE FROM ${schema}.ledger;`),/ledger is append-only/);
  assert.throws(()=>x.psql(`TRUNCATE TABLE ${schema}.ledger;`),/ledger is append-only/);
  x.psql(`UPDATE ${schema}.gate SET enabled=false;`);
  assert.equal(parse(x.psql(call(basePayload(A)))).status,'duplicate');
  assert.equal(parse(x.psql(call(basePayload('55555555-5555-4555-8555-555555555555')))).status,'disabled');
  assert.equal(x.psql(`SELECT count(*) FROM ${schema}.ledger;`),'4');
 }finally{x.cleanup();}
});
