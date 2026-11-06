import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';

// Published-contract synthetic tests only; no current production-schema parity claim.
// CI-only isolated PostgreSQL service; never accept a hosted database URL.
assert.equal(process.env.CI,'true','Use the existing disposable CI job');
const container=process.env.RECEIPT_TEST_CONTAINER;
assert.match(container??'',/^[a-f0-9]{12,64}$/,'RECEIPT_TEST_CONTAINER must be the isolated CI service container id');
const args=['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d','postgres'];
const quote=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const rpc=(id,name='concurrent',game='negative',score=7,version='fixture-v1')=>
  `select row_to_json(r)::text from public.submit_score_once_shared_v1(${quote(id)}::uuid,${quote(name)},${quote(game)},${quote(score)}::integer,${quote(version)}) r;`;
function sql(source,success=true){
  const r=spawnSync('docker',args,{input:source,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
  assert.ifError(r.error);
  if(success)assert.equal(r.status,0,r.stderr);
  else assert.notEqual(r.status,0,'query unexpectedly succeeded');
  return success?r.stdout.trim():r.stderr;
}
const json=q=>JSON.parse(sql(q));
// Only tables declared by the pinned PUBLIC synthetic fixture and migration.
// Snapshot synthetic row contents/counts, not nontransactional sequence counters.
const contractTables=['public.games','public.players','public.game_scores','public.score_runs','public.game_play_events','private.common_score_receipts_v1'];
const snapshot=()=>sql('select jsonb_build_array('+contractTables.map(table=>`(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table} t)`).join(',')+');');
function connection(label){
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});
  child.stdin.write(`set application_name=${quote(label)};\n`);
  return {child,done,write:s=>child.stdin.write(s+'\n'),finish:s=>child.stdin.end(s+'\n'),output:()=>out};
}
async function until(check,description){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){if(check())return;await delay(50);}
  throw new Error('timeout waiting for '+description);
}
async function contested({samePayload=true,rollback=false}={}){
  const id=randomUUID(),label='receipt-'+id;
  const before=Number(sql("select coalesce(sum(play_count),0) from public.game_scores;"));
  const a=connection(label+'-a'),b=connection(label+'-b');
  try{
    a.write('begin; '+rpc(id,'concurrent','negative',7,label)+'\n\\echo FIRST_DONE');
    await until(()=>a.output().includes('FIRST_DONE'),'first transaction result');
    b.finish(rpc(id,samePayload?'concurrent':'changed','negative',7,label));
    // Observe an actual independent backend blocked on the advisory lock.
    await until(()=>sql(`select exists(select 1 from pg_stat_activity where application_name=${quote(label+'-b')} and wait_event_type='Lock' and wait_event='advisory');`)==='t','second backend advisory lock');
    const pids=json(`select json_agg(pid) from pg_stat_activity where application_name in (${quote(label+'-a')},${quote(label+'-b')});`);
    assert.equal(pids.length,2);assert.equal(new Set(pids).size,2,'independent backend PIDs required');
    a.finish(rollback?'rollback;':'commit;');
    const ar=await a.done,br=await b.done;
    assert.equal(ar.code,0,ar.err);
    if(!samePayload&&!rollback){assert.notEqual(br.code,0);assert.match(br.err,/PT409/);}
    else{
      assert.equal(br.code,0,br.err);
      const row=JSON.parse(br.out.trim());
      assert.equal(row.was_duplicate,!rollback);
      if(!rollback)assert.deepEqual(row,{...JSON.parse(ar.out.split('\n').find(x=>x.startsWith('{'))),was_duplicate:true});
    }
    assert.equal(sql(`select count(*) from private.common_score_receipts_v1 where submission_id=${quote(id)};`),'1');
    assert.equal(sql(`select count(*) from public.score_runs where client_version=${quote(label)};`),'1','exactly one underlying score run');
    assert.equal(Number(sql("select coalesce(sum(play_count),0) from public.game_scores;")),before+1,'exactly one play-count increment');
  }finally{
    for(const c of [a,b]){if(c.child.exitCode===null&&!c.child.stdin.writableEnded)c.child.stdin.end('rollback;\n');}
    const closed=Promise.allSettled([a.done,b.done]);
    if(await Promise.race([closed.then(()=>true),delay(2000).then(()=>false)])===false){
      sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name in (${quote(label+'-a')},${quote(label+'-b')});`);
      await Promise.race([closed,delay(2000).then(()=>{throw new Error('test connections failed to close');})]);
    }
  }
}
test('isolated PostgreSQL: real competing connections, rollback, payload and privilege boundaries', {timeout:120000}, async t=>{
  const fixture=await readFile(new URL('./fixtures/common-score-receipt.sql',import.meta.url),'utf8');
  const migration=await readFile(new URL('../docs/chameleonjp-lab/sql/common-score-receipt-v1.sql',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(fixture).digest('hex'),'f0cfcde61998026bb5e304d8414b34b5165ac52f9189eed7db3663b4bbcf891c','review public fixture changes separately');
  assert.equal(createHash('sha256').update(migration).digest('hex'),'c315fbeb7f10ade05737cdd69f0b9d90dd59c2bf8552f0992365e02d1cbcb949','review migration changes separately');
  t.diagnostic('Isolated PostgreSQL version: '+sql('show server_version;'));
  sql(fixture);
  const baseline=sql("select row_to_json(s) from public.game_scores s where normalized_name='old';");
  const oldFunctions=sql("select oid::regprocedure::text,pg_get_functiondef(oid),coalesce(proacl::text,'NULL') from pg_proc where oid in ('public.submit_score(text,text,integer,text)'::regprocedure,'public.submit_score_with_metadata(text,text,integer,text,jsonb)'::regprocedure) order by oid::regprocedure::text;");
  sql(migration);
  await t.test('same UUID in independent connections commits exactly one receipt and returns the exact prior result',()=>contested());
  await t.test('same UUID with another payload is rejected after waiting for the winning transaction',()=>contested({samePayload:false}));
  await t.test('a waiting retry succeeds once after its predecessor rolls back',()=>contested({rollback:true}));
  await t.test('invalid inputs and protected game paths cannot create score rows or receipts',()=>{
    const before=snapshot();
    for(const [id,name,game,score,version] of [
      [null,'x','negative',1,'v'],['not-uuid','x','negative',1,'v'],
      [randomUUID(),null,'negative',1,'v'],[randomUUID(),'','negative',1,'v'],
      [randomUUID(),'x'.repeat(21),'negative',1,'v'],[randomUUID(),'x',null,1,'v'],
      [randomUUID(),'x','inactive',1,'v'],[randomUUID(),'x','verified',1,'v'],
      [randomUUID(),'x','takkeu',1,'v'],[randomUUID(),'x',' TAKKEU ',1,'v'],[randomUUID(),'x','sabasaba_normal',1,'v'],
      [randomUUID(),'x','sabasaba_endless',1,'v'],[randomUUID(),'x','negative',null,'v'],
      [randomUUID(),'x','negative',100000001,'v'],[randomUUID(),'x','negative',-100000001,'v'],
      [randomUUID(),'x','negative','1.5','v'],[randomUUID(),'x','negative','2147483648','v']
    ])sql('set role anon; '+rpc(id,name,game,score,version),false);
    assert.equal(snapshot(),before);
  });
  await t.test('inclusive score limits and Unicode names keep the existing acceptance contract',()=>{
    for(const [name,score] of [['lower-bound',-100000000],['upper-bound',100000000],['花'.repeat(20),0]]){
      const row=JSON.parse(sql('set role anon; '+rpc(randomUUID(),name,'negative',score,'boundary')));
      assert.equal(row.accepted,true);assert.equal(row.result_first_score,score);
    }
  });
  await t.test('browser roles cannot access receipt data or reopen metadata, while normal submissions remain callable',()=>{
    assert.equal(sql("select relrowsecurity from pg_class where oid='private.common_score_receipts_v1'::regclass;"),'t');
    assert.equal(sql("select count(*) from pg_policies where schemaname='private' and tablename='common_score_receipts_v1';"),'0');
    assert.equal(sql("select to_regprocedure('public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb)') is null;"),'t');
    for(const role of ['anon','authenticated']){
      for(const query of ['select * from private.common_score_receipts_v1;', 'delete from private.common_score_receipts_v1;',
        "update private.common_score_receipts_v1 set response_payload='{}';",
        `insert into private.common_score_receipts_v1 values(${quote(randomUUID())},'{}','{}',now());`,
        "select * from public.submit_score_with_metadata('blocked','negative',1,'v','{}');"]){
        assert.match(sql('set role '+role+'; '+query,false),/42501/);
      }
      const row=JSON.parse(sql('set role '+role+'; '+rpc(randomUUID(),'role-'+role)));
      assert.equal(row.accepted,true);
    }
  });

  await t.test('published normal wrapper refuses protected routes for the intended reason',()=>{
    const before=snapshot();
    for(const game of ['takkeu',' TAKKEU ','sabasaba_normal','sabasaba_endless','verified']){
      const error=sql('set role anon; '+rpc(randomUUID(),'protected-contract',game,1,'public-fixture'),false);
      assert.match(error,/42501/);
      assert.ok(error.includes(game.trim().toLowerCase()==='takkeu'?'takkeu requires submit_score_idempotent_v1':'verified run required'),error);
    }
    assert.equal(snapshot(),before);
  });
  await t.test('receipt insert failure preserves ordinary and provisional-event row contents',()=>{
    // These four game columns and the Sainome branch are in the published fixture.
    sql("insert into public.games(game_slug,is_active,submission_mode,score_order) values('sainome_300_seconds',true,'shared','desc');");
    const ordinaryId=randomUUID(),eventId=randomUUID(),eventName='public-fail-event';
    // Synthetic failure seam only; retain it until disposable container teardown.
    sql(`alter table private.common_score_receipts_v1 add constraint synthetic_receipt_failure check (submission_id not in (${quote(ordinaryId)}::uuid,${quote(eventId)}::uuid));`);
    sql(`insert into public.game_play_events(game_slug,normalized_name,display_name,result_type,score,ranking_score,created_at) values('sainome_300_seconds',${quote(eventName)},${quote(eventName)},'play',0,null,clock_timestamp());`);
    const before=snapshot();
    for(const [id,name,game] of [[ordinaryId,'public-fail-ordinary','negative'],[eventId,eventName,'sainome_300_seconds']]){
      const error=sql('set role anon; '+rpc(id,name,game,100,'public-fixture-failure'),false);
      assert.match(error,/23514/);assert.match(error,/synthetic_receipt_failure/);
      assert.equal(snapshot(),before,'failed receipt must not commit player/score/event/receipt row changes');
    }
  });
  await t.test('published provisional-event path succeeds once and replays its receipt',()=>{
    const id=randomUUID(),name='public-success-event';
    sql(`insert into public.game_play_events(game_slug,normalized_name,display_name,result_type,score,ranking_score,created_at) values('sainome_300_seconds',${quote(name)},${quote(name)},'play',0,null,clock_timestamp());`);
    const first=JSON.parse(sql('set role anon; '+rpc(id,name,'sainome_300_seconds',100,'public-fixture-event')));
    const again=JSON.parse(sql('set role anon; '+rpc(id,name,'sainome_300_seconds',100,'public-fixture-event')));
    assert.equal(first.accepted,true);assert.deepEqual(again,{...first,was_duplicate:true});
    assert.equal(sql(`select count(*) from public.score_runs where normalized_name=${quote(name)};`),'1');
    assert.equal(sql(`select result_type||':'||ranking_score from public.game_play_events where normalized_name=${quote(name)};`),'clear:100');
  });

  assert.equal(sql("select row_to_json(s) from public.game_scores s where normalized_name='old';"),baseline);
  assert.equal(sql("select oid::regprocedure::text,pg_get_functiondef(oid),coalesce(proacl::text,'NULL') from pg_proc where oid in ('public.submit_score(text,text,integer,text)'::regprocedure,'public.submit_score_with_metadata(text,text,integer,text,jsonb)'::regprocedure) order by oid::regprocedure::text;"),oldFunctions);
  t.diagnostic('Published synthetic contract only, not live-schema compatibility. Only the disposable CI service was used. Advisory waits were observed in independent PostgreSQL backends; no hosted database or production score was used.');
});
