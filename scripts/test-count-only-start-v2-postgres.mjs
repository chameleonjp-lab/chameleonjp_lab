/** Private isolated fixture harness; it never accepts a connection string or existing cluster. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {accessSync, constants, mkdtempSync, mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';

const fixture=fileURLToPath(new URL('./fixtures/count-only-start-v2.sql', import.meta.url));
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333', D='44444444-4444-4444-8444-444444444444';
const E='55555555-5555-4555-8555-555555555555', F='66666666-6666-4666-8666-666666666666';
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
 // pg_ctl passes its server options through a shell, so use only plain path characters.
 if(!/^\/[A-Za-z0-9_./-]+$/.test(socket))throw new Error('invalid fixture socket path');
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
  return {psql,cleanup,connect:()=>fixtureClient(spawn(join(bin,'psql'),args(db),{env:pgEnv,stdio:['pipe','pipe','pipe']}))};
 }catch(e){ cleanup();throw e; }
}
// Interactive psql sessions keep an explicit transaction alive between queries.
function fixtureClient(p) {
 const marker='count-fixture-query-end';
 let pending, exited=false, stderr='';
 const lines=createInterface({input:p.stdout});
 function settle(err,result) {
  if(!pending)return;
  const {timer,resolve,reject}=pending;
  pending=undefined;
  clearTimeout(timer);
  if(err)reject(err);else resolve(result);
 }
 function rejectClosed(err){
  settle(err instanceof Error?err:new Error('isolated psql closed: '+stderr));
 }
 const closed=new Promise(resolve=>p.once('close',()=>{
  exited=true;
  rejectClosed();
  lines.close();
  resolve();
 }));
 p.on('error',rejectClosed);
 p.stdin.on('error',rejectClosed);
 p.stderr.setEncoding('utf8').on('data',s=>{stderr=(stderr+s).slice(-4096);});
 lines.on('line',line=>{
  if(!pending)return;
  if(line===marker)settle(null,pending.rows.join('\n'));
  else pending.rows.push(line);
 });
 return {
  query(sql,timeoutMs=8000){
   assert.ok(!exited&&!pending,'one pending query per live fixture client');
   const reply=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
     settle(new Error('isolated psql query timed out'));
     p.kill('SIGKILL');
    },timeoutMs);
    pending={resolve,reject,timer,rows:[]};
    p.stdin.write(sql+"\nSELECT '"+marker+"';\n");
   });
   // The blocked query can fail while the observer is still polling.
   void reply.catch(()=>{});
   return reply;
  },
  async close(){
   if(!exited)p.kill('SIGKILL');
   const stopped=await Promise.race([closed.then(()=>true),delay(2000,false,{ref:false})]);
   assert.equal(stopped,true,'fixture psql child did not close');
  },
 };
}

async function awaitWitness(observer,waiterPid,holderPid,lockType) {
 assert.match(waiterPid,/^[1-9]\d*$/);
 assert.match(holderPid,/^[1-9]\d*$/);
 assert.notEqual(waiterPid,holderPid);
 assert.ok(lockType===''||lockType===" AND locktype='advisory'");
 const limit=performance.now()+4000;
 do {
  const remaining=Math.max(1,Math.ceil(limit-performance.now()));
  const witness=await observer.query(
   `SELECT ${holderPid} = ANY(pg_catalog.pg_blocking_pids(${waiterPid}))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks WHERE pid=${waiterPid} AND NOT granted${lockType});`,
   remaining);
  if(witness==='t')return;
  await delay(25);
 } while(performance.now()<limit);
 assert.fail('required backend lock was never witnessed');
}

async function checkOrderedRace(x,{first,second,firstResult,secondResult,advisory=false}) {
 const clients=[];
 function connect(){const client=x.connect();clients.push(client);return client;}
 try{
  const holder=connect(), waiter=connect(), observer=connect();
  const setup="SET statement_timeout='12s';\nSET lock_timeout='10s';\nSET idle_in_transaction_session_timeout='15s';\nSELECT pg_catalog.pg_backend_pid();";
  const [holderPid,waiterPid]=await Promise.all([holder.query(setup),waiter.query(setup)]);
  const read=value=>value===''?'':JSON.parse(value);
  assert.deepEqual(read(await holder.query('BEGIN;\n'+first)),firstResult);
  const pending=waiter.query('BEGIN;\n'+second+'\nCOMMIT;');
  await awaitWitness(observer,waiterPid,holderPid,advisory?" AND locktype='advisory'":'');
  assert.equal(await holder.query('COMMIT;'),'');
  assert.deepEqual(read(await pending),secondResult);
 }finally{
  await Promise.all(clients.map(c=>c.close()));
 }
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
 assert.match(harness,/SELECT .*pg_catalog\.pg_blocking_pids/);
 assert.match(harness,/locktype='advisory'/);
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
  // JSONB text canonicalizes member order and includes spaces. Compare fixture
  // results as parsed JSON, while writes without rows still return empty text.
  const expected=(status,startId,mode='fixture_normal')=>startId?{mode,status,startId,version:'test-1'}:{status};
  await checkOrderedRace(x,{
   first:call(basePayload(B)),second:call(basePayload(B)),
   firstResult:expected('accepted',B),secondResult:expected('duplicate',B),advisory:true,
  });
  await checkOrderedRace(x,{
   first:call(basePayload(C)),second:call(basePayload(C,'fixture_hard')),
   firstResult:expected('accepted',C),secondResult:expected('conflict'),advisory:true,
  });
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
  const gate=(enabled)=>`UPDATE ${schema}.gate SET enabled=${enabled} WHERE mode='fixture_normal' AND release_version='test-1';`;
  // Start holds its gate share before admin disable; the committed row survives.
  await checkOrderedRace(x,{
   first:call(basePayload(E)),second:gate(false),
   firstResult:expected('accepted',E),secondResult:'',
  });
  assert.deepEqual(parse(x.psql(call(basePayload(E)))),expected('duplicate',E));
  assert.deepEqual(parse(x.psql(call(basePayload(F)))),expected('disabled'));
  x.psql(gate(true));
  // Admin disable holds the gate first; the waiting start must recheck it.
  await checkOrderedRace(x,{
   first:gate(false),second:call(basePayload(F)),
   firstResult:'',secondResult:expected('disabled'),
  });
  assert.deepEqual(parse(x.psql(call(basePayload(A)))),expected('duplicate',A));
  assert.equal(x.psql(`SELECT start_id::text FROM ${schema}.ledger WHERE start_id IN ('${E}','${F}');`),E);
  assert.equal(x.psql(`SELECT count(*) FROM ${schema}.ledger;`),'5');
 }finally{x.cleanup();}
});
