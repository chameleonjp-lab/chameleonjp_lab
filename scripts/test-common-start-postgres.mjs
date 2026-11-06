import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';

// Synthetic fixture only. This is not a migration, production ACL installer or HTTP test.
export function validateRoute(env, argv) {
  assert.equal(env.CI, 'true', 'CI=true required');
  assert.match(env.START_TEST_CONTAINER ?? '', /^[a-f0-9]{64}$/, 'dedicated full service container ID required');
  assert.deepEqual(argv, [], 'no connection arguments accepted');
  for (const key of Object.keys(env))
    assert.ok(!/^(PG|DOCKER)|DSN|DATABASE_URL/i.test(key), 'connection override prohibited: '+key);
  return env.START_TEST_CONTAINER;
}
async function fixtures() {
  const pins=[['common-start-ledger.sql','c3e3502161360d06e3eee7671bf3b645f4cceb92387b37022b2681c213cfaaa5'],['common-start-wrappers.sql','9fb42147f6f1c0a1145e800b75558c07c985885eceb31c7ec387d887cbdf7609']];
  return Promise.all(pins.map(async ([name, hash])=>{
    const bytes=await readFile(new URL('./fixtures/'+name,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'frozen fixture drift: '+name);
    return bytes.toString('utf8');
  }));
}
const q=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const schema='common_start_candidate_v1';
const tables=['allowed_release','start_ledger','mode_era'];
const privateFns=['reject_ledger_mutation()','record_start(jsonb)','start_stats(text)'];
const wrappers=['record_game_start_v1(jsonb)','game_start_stats_v1(text)'];
const event=(extra={})=>({startId:randomUUID(),participantId:randomUUID(),gameSlug:'fixture_a',clientVersion:'fixture-v1',...extra});
const call=(e, direct=false)=>`select ${direct?schema+'.record_start':'public.record_game_start_v1'}(${q(JSON.stringify(e))}::jsonb);`;
const accepted=(e,duplicate=false)=>({accepted:true,duplicate,event:e});
const rejected=reason=>({accepted:false,reason});

// Keep the entire identifier below PostgreSQL's 63-byte application_name limit.
export function sessionLabel(runToken, suffix) {
  const label='start-'+runToken+'-'+suffix+'-'+randomUUID().replaceAll('-','').slice(0,16);
  assert.match(label,/^[a-z0-9-]+$/,'ASCII application_name required');
  assert.ok(Buffer.byteLength(label,'utf8')<=63,'application_name exceeds 63 bytes');
  return label;
}
export function sessionIdentity(output, expectedLabel) {
  const end=output.indexOf('\n');
  if(end<0)return undefined; // A partial first line is not a complete backend identity.
  const identity=JSON.parse(output.slice(0,end));
  assert.equal(identity.sessionName,expectedLabel,'backend application_name mismatch');
  assert.ok(Number.isInteger(identity.sessionPid)&&identity.sessionPid>0,'invalid backend PID');
  return identity.sessionPid;
}

async function runtime(container, sources) {
  // env -i also clears container-side libpq and psql environment; every route is fixed.
  const args=['exec','-i',container,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','start_fixture'];
  const childEnv={PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};
  const runToken=randomUUID().replaceAll('-','').slice(0,16);
  const runId='start-'+runToken;
  const prefix=label=>`set application_name=${q(label)}; set statement_timeout='12s'; set lock_timeout='8s'; set idle_in_transaction_session_timeout='20s';\n`;
  function sql(source, state) {
    const r=spawnSync('docker',args,{env:childEnv,input:prefix(runId+'-query')+source,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    assert.ifError(r.error);
    if(state){assert.notEqual(r.status,0);assert.match(r.stderr,new RegExp('ERROR:  '+state+':'));return r.stderr;}
    assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  }
  const json=s=>JSON.parse(sql(s));
  const snapshot=()=>sql('select jsonb_build_array('+tables.map(t=>`(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from ${schema}.${t} r)`).join(',')+');');
  function session(suffix) {
    const label=sessionLabel(runToken,suffix);
    const child=spawn('docker',args,{env:childEnv,stdio:['pipe','pipe','pipe']});
    let out='',err='';
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
    const cap=1024*1024;
    child.stdout.on('data',d=>{out+=d;if(out.length>cap)child.kill();});
    child.stderr.on('data',d=>{err+=d;if(err.length>cap)child.kill();});
    child.stdin.on('error',()=>{});
    child.stdin.write(prefix(label)+"select json_build_object('sessionPid',pg_backend_pid(),'sessionName',current_setting('application_name'));\n");
    return {label,child,done,output:()=>out,write:s=>child.stdin.write(s+'\n'),end:s=>child.stdin.end(s+'\n'),pid:()=>sessionIdentity(out,label)};
  }
  async function until(check, label) {
    const end=Date.now()+10000;
    while(Date.now()<end){if(check())return;await delay(50);}
    throw Error('Timed out: '+label);
  }
  async function waitLock(a,b,kind) {
    await until(()=>{const ap=a.pid(),bp=b.pid();return ap!==undefined&&bp!==undefined;},'complete backend identities');
    await until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name=${q(b.label)} and wait_event_type='Lock' ${kind?`and wait_event=${q(kind)}`:''});`)==='t','real contender lock');
    assert.ok(Number.isInteger(a.pid())&&a.pid()>0);assert.ok(Number.isInteger(b.pid())&&b.pid()>0);assert.notEqual(a.pid(),b.pid());
    assert.equal(sql(`select count(*) from pg_stat_activity where (pid=${a.pid()} and application_name=${q(a.label)}) or (pid=${b.pid()} and application_name=${q(b.label)});`),'2');
  }
  async function close(connections) {
    for(const c of connections)if(c.child.exitCode===null&&!c.child.stdin.writableEnded)c.end('rollback;');
    const all=Promise.allSettled(connections.map(c=>c.done));
    if(await Promise.race([all.then(()=>true),delay(1500).then(()=>false)]))return;
    // Exact runner label AND recorded PID only. Never terminate by prefix or all database users.
    for(const c of connections)if(Number.isInteger(c.pid())&&c.pid()>0)
      sql(`select pg_terminate_backend(pid) from pg_stat_activity where pid=${c.pid()} and application_name=${q(c.label)};`);
    assert.equal(await Promise.race([all.then(()=>true),delay(2000).then(()=>false)]),true,'owned sessions closed');
  }
  const response=r=>r.out.split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)).find(value=>Object.hasOwn(value,'accepted'));
  const success=r=>assert.equal(r.code,0,r.err);
  async function contest(change={},rollback=false) {
    const e=event(),other={...e,...change},a=session('winner'),b=session('contender');
    try {
      a.write('begin; '+call(e)+'\n\\echo READY');
      await until(()=>a.output().includes('READY'),'first insert');
      b.end(call(other));await waitLock(a,b,'advisory');
      a.end(rollback?'rollback;':'commit;');
      const [ar,br]=await Promise.all([a.done,b.done]);success(ar);success(br);
      assert.deepEqual(response(ar),accepted(e));
      assert.deepEqual(response(br),rollback?accepted(other):Object.keys(change).length?rejected('payload_conflict'):accepted(e,true));
      assert.deepEqual(json(`select jsonb_build_object('startId',start_id,'participantId',participant_id,'gameSlug',game_slug,'clientVersion',client_version) from ${schema}.start_ledger where start_id=${q(e.startId)};`),rollback?other:e);
      assert.equal(sql(`select count(*) from ${schema}.start_ledger where start_id=${q(e.startId)};`),'1');
    } finally {await close([a,b]);}
  }
  await test('START synthetic PostgreSQL17 contract', {timeout:210000}, async t=>{
    assert.equal(sql("select current_database()='start_fixture' and current_setting('server_version_num')::int/10000=17;"),'t');
    t.diagnostic('PostgreSQL '+sql('show server_version;'));
    assert.equal(sql(`select count(*) from pg_namespace where nspname in (${q(schema)},'start_shadow');`),'0');
    assert.equal(sql("select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','start_fixture_owner');"),'0');
    assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_game_start_v1','game_start_stats_v1');"),'0');
    sql(['anon','authenticated','service_role','start_fixture_owner'].map(r=>`create role ${r} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`).join('\n'));
    for(const source of sources)sql(source);
    sql(`insert into ${schema}.allowed_release values ('fixture_a','fixture-v1',true,'2000-01-01Z'),('fixture_b','fixture-v1',true,'2000-01-01Z'),('fixture_a','fixture-v2',true,'2000-01-01Z'),('future_open','fixture-v1',true,'2999-01-01Z'),('future_era','fixture-v1',true,'2000-01-01Z'); insert into ${schema}.mode_era values ('fixture_a','2000-01-01Z','browser-start-v1'),('fixture_b','2000-01-01Z','browser-start-v1'),('future_open','2000-01-01Z','browser-start-v1'),('future_era','2999-01-01Z','browser-start-v1');`);
    await t.test('initial browser and service wrapper ACLs deny before grants',()=>{
      for(const role of ['anon','authenticated','service_role'])for(const query of [call(event()),"select public.game_start_stats_v1('fixture_a');",`select * from ${schema}.start_ledger;`,call(event(),true)])sql(`set role ${role}; `+query,'42501');
    });
    await t.test('same ID independent backends wait then exact duplicate',()=>contest());
    for(const change of [{participantId:randomUUID()},{gameSlug:'fixture_b'},{clientVersion:'fixture-v2'}])
      await t.test('conflicting '+Object.keys(change)[0]+' waits and preserves winner',()=>contest(change));
    await t.test('predecessor rollback makes waiting contender first acceptance',()=>contest({participantId:randomUUID()},true));
    await t.test('lost ACK after commit retries unchanged UUID without increment',async()=>{
      const e=event(),a=session('lost-ack');
      try {a.end('begin; '+call(e)+' commit;');success(await a.done); /* deliberately do not settle using response(a) */
        const before=snapshot();assert.deepEqual(json(call(e)),accepted(e,true));assert.equal(snapshot(),before);
      }finally{await close([a]);}
    });
    for(const recordFirst of [true,false])await t.test('allowlist disable order '+(recordFirst?'record-first':'disable-first'),async()=>{
      const slug=recordFirst?'order_record':'order_disable',e=event({gameSlug:slug});
      sql(`insert into ${schema}.allowed_release values (${q(slug)},'fixture-v1',true,'2000-01-01Z'); insert into ${schema}.mode_era values (${q(slug)},'2000-01-01Z','browser-start-v1');`);
      const disable=`update ${schema}.allowed_release set enabled=false where game_slug=${q(slug)};`,a=session('order-a'),b=session('order-b');
      try {
        a.write('begin; '+(recordFirst?call(e):disable)+'\n\\echo READY');await until(()=>a.output().includes('READY'),'first lock');
        b.end(recordFirst?disable:call(e));await waitLock(a,b);a.end('commit;');
        const [ar,br]=await Promise.all([a.done,b.done]);success(ar);success(br);
        assert.deepEqual(response(recordFirst?ar:br),recordFirst?accepted(e):rejected('release_unavailable'));
        const before=snapshot();assert.deepEqual(json(call(e)),recordFirst?accepted(e,true):rejected('release_unavailable'));assert.equal(snapshot(),before);
        assert.equal(sql(`select count(*) from ${schema}.start_ledger where start_id=${q(e.startId)};`),recordFirst?'1':'0');
      }finally{await close([a,b]);}
    });
    await t.test('RR and SERIALIZABLE reject with 40001; READ COMMITTED accepts',()=>{
      for(const isolation of ['repeatable read','serializable']){const e=event(),before=snapshot();assert.match(sql(`begin isolation level ${isolation}; `+call(e),'40001'),/read_committed_required/);assert.equal(snapshot(),before);assert.deepEqual(json('begin isolation level read committed; '+call(e)+' commit;'),accepted(e));}
    });
    for(const cancel of [false,true])await t.test(cancel?'cancel then same-event retry':'lock timeout then same-event retry',async()=>{
      const e=event(),a=session('hold'),b=session('abort');
      try {
        a.write('begin; '+call(e)+'\n\\echo READY');await until(()=>a.output().includes('READY'),'held row');
        b.end((cancel?'':"set lock_timeout='1500ms'; ")+call(e));await waitLock(a,b,'advisory');
        if(cancel)assert.equal(sql(`select pg_cancel_backend(pid) from pg_stat_activity where pid=${b.pid()} and application_name=${q(b.label)};`),'t');
        const br=await b.done;assert.notEqual(br.code,0);assert.match(br.err,new RegExp('ERROR:  '+(cancel?'57014':'55P03')+':'));
        a.end('commit;');success(await a.done);const before=snapshot();assert.deepEqual(json(call(e)),accepted(e,true));assert.equal(snapshot(),before);
      }finally{await close([a,b]);}
    });
    await t.test('exact malformed, era, release and normalized jsonb size boundaries',()=>{
      const base=event(),before=snapshot();
      const invalid=[null,[],{}, {...base,startId:'invalid'},{...base,participantId:42},{...base,name:'x'},{...base,score:7},{...base,clientVersion:' '},{...base,gameSlug:42}];
      for(const e of invalid){assert.deepEqual(json(call(e,true)),rejected('invalid_payload'));const reason=e&& !Array.isArray(e)&&!['fixture_a'].includes(String(e.gameSlug))?'era_unavailable':'invalid_payload';assert.deepEqual(json(call(e)),rejected(reason));}
      for(const [extra,reason] of [[{gameSlug:'unknown'},'era_unavailable'],[{clientVersion:'unknown'},'release_unavailable'],[{gameSlug:'future_open'},'release_unavailable'],[{gameSlug:'future_era'},'era_unavailable']])assert.deepEqual(json(call({...base,...extra})),rejected(reason));
      // jsonb::text canonical byte limit, not HTTP body protection. Padding is invalid shape at all three sizes.
      for(const size of [1023,1024,1025]){
        const expression=`jsonb_build_object('padding',repeat('x',${size}-15))`;
        assert.equal(sql(`select octet_length((${expression})::text);`),String(size));
        assert.deepEqual(json(`select public.record_game_start_v1(${expression});`),rejected(size>1024?'invalid_payload':'era_unavailable'));
      }
      assert.equal(snapshot(),before);
    });
    await t.test('mode, participant, inclusive cutoff and exact UTC microseconds',()=>{
      const cutoff='2020-01-02T03:04:05.123456Z',p=randomUUID(),other=randomUUID();
      sql(`insert into ${schema}.allowed_release values ('counts_a','fixture-v1',true,'2000-01-01Z'),('counts_b','fixture-v1',true,'2000-01-01Z'); insert into ${schema}.mode_era values ('counts_a',${q(cutoff)},'browser-start-v1'),('counts_b',${q(cutoff)},'browser-start-v1');`);
      for(const [slug,pid,time] of [['counts_a',p,'2020-01-02T03:04:05.123455Z'],['counts_a',p,cutoff],['counts_a',p,'2020-01-02T03:04:05.123457Z'],['counts_a',other,'2020-01-03Z'],['counts_b',p,cutoff]])sql(`insert into ${schema}.start_ledger values (${q(randomUUID())},${q(pid)},${q(slug)},'fixture-v1',${q(time)});`);
      for(const zone of ['UTC','Asia/Tokyo','America/New_York']){
        const row=json(`set timezone=${q(zone)}; select jsonb_build_object('stats',public.game_start_stats_v1('counts_a'),'expected',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));`);
        assert.deepEqual(row.stats,{available:true,gameSlug:'counts_a',era:'browser-start-v1',cutoffAt:cutoff,asOf:row.expected,starts:'3',participantBrowsers:'2',historicalIncluded:false,timeBasis:'server_receipt'});
        assert.match(row.stats.asOf,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
      }
      const b=json("select public.game_start_stats_v1('counts_b');");assert.equal(b.starts,'1');assert.equal(b.participantBrowsers,'1');
      assert.deepEqual(json(`select row_to_json(s) from ${schema}.start_stats('counts_a') s;`),{play_count:4,participant_count:2});
      for(const [mode,reason] of [[null,'invalid_mode'],['UPPER','invalid_mode'],['unknown','era_unavailable'],['future_era','era_unavailable']])assert.deepEqual(json(`select public.game_start_stats_v1(${q(mode)});`),{available:false,reason});
    });
    await t.test('append-only triggers reject UPDATE DELETE TRUNCATE without changes',()=>{
      const before=snapshot();for(const table of ['start_ledger','mode_era'])for(const action of [`update ${schema}.${table} set game_slug=game_slug`,`delete from ${schema}.${table}`,`truncate ${schema}.${table}`])assert.match(sql(action+';','55000'),/start_ledger_is_append_only/);assert.equal(snapshot(),before);
    });
    await t.test('empty search path resists shadows and full synthetic owner transfer preserves ACL boundary',()=>{
      const allFns=[...privateFns.map(f=>schema+'.'+f),...wrappers.map(f=>'public.'+f)];
      assert.equal(sql(`select count(*) from pg_proc where oid in (${allFns.map(f=>q(f)+'::regprocedure').join(',')}) and proconfig @> array['search_path=""'];`),'5');
      sql(`create schema start_shadow; create table start_shadow.start_ledger(dummy text); create function start_shadow.record_start(jsonb) returns jsonb language sql as $$select '{"shadow":true}'::jsonb$$;`);
      const e=event();assert.deepEqual(json("set search_path=start_shadow,public; "+call(e)),accepted(e));
      sql(`grant create on schema public to start_fixture_owner; alter schema ${schema} owner to start_fixture_owner; `+tables.map(n=>`alter table ${schema}.${n} owner to start_fixture_owner;`).join(' ')+allFns.map(f=>`alter function ${f} owner to start_fixture_owner;`).join(' ')+` revoke create on schema public from start_fixture_owner;`);
      assert.equal(sql("select has_schema_privilege('start_fixture_owner','public','CREATE');"),'f');
      assert.equal(sql("select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','start_fixture_owner') and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls and not rolinherit;"),'4');
      assert.equal(sql("select count(*) from pg_auth_members where member in (select oid from pg_roles where rolname in ('anon','authenticated','service_role','start_fixture_owner')) or roleid=(select oid from pg_roles where rolname='start_fixture_owner');"),'0');
      assert.equal(sql(`select nspowner='start_fixture_owner'::regrole from pg_namespace where nspname=${q(schema)};`),'t');
      assert.equal(sql(`select count(*) from pg_class where oid in (${tables.map(n=>q(schema+'.'+n)+'::regclass').join(',')}) and relowner='start_fixture_owner'::regrole and relrowsecurity and not relforcerowsecurity;`),'3');
      assert.equal(sql(`select count(*) from pg_proc where oid in (${allFns.map(f=>q(f)+'::regprocedure').join(',')}) and proowner='start_fixture_owner'::regrole;`),'5');
      assert.equal(sql(`select count(*) from pg_policies where schemaname=${q(schema)};`),'0');
      assert.equal(sql("select count(*) from pg_default_acl where defaclrole='start_fixture_owner'::regrole;"),'0');
      sql('grant usage on schema public to anon, authenticated; grant execute on function public.record_game_start_v1(jsonb), public.game_start_stats_v1(text) to anon, authenticated;');
      for(const role of ['anon','authenticated','service_role']){
        assert.equal(sql(`select has_schema_privilege(${q(role)},${q(schema)},'USAGE');`),'f');
        for(const table of tables)assert.equal(sql(`select has_table_privilege(${q(role)},${q(schema+'.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`),'f');
        for(const fn of privateFns)assert.equal(sql(`select has_function_privilege(${q(role)},${q(schema+'.'+fn)},'EXECUTE');`),'f');
        sql(`set session authorization ${role}; set role start_fixture_owner;`,'42501');
        sql(`set role ${role}; select * from ${schema}.start_ledger;`,'42501');
        sql(`set role ${role}; `+call(event(),true),'42501');
        if(role==='service_role'){for(const query of [call(event()),"select public.game_start_stats_v1('fixture_a');"])sql(`set role ${role}; `+query,'42501');}
        else {const input=event();assert.deepEqual(json(`set role ${role}; `+call(input)),accepted(input));assert.equal(json(`set role ${role}; select public.game_start_stats_v1('fixture_a');`).available,true);}
      }
      t.diagnostic('Synthetic superuser-administered ownership transfer only. Owner bypasses table RLS; no claim of real deployer/default ACL parity.');
    });
    t.diagnostic('No HTTP, PostgREST, production, IndexedDB, load or release verification. Sessions close normally or exact owned PID cleanup; disposable service teardown is handled by the CI job.');
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3 && process.argv[2]==='--validate-only'){
    await fixtures();console.log('PASS frozen source hashes; SQL runtime NOT RUN; subprocess calls: 0');
  }else{
    const container=validateRoute(process.env,process.argv.slice(2));
    const sources=await fixtures();await runtime(container,sources);
  }
}
