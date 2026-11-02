import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
const load=p=>readFile(new URL(p,import.meta.url),'utf8');
const fixture=await load('./fixtures/common-score-receipt.sql');
const migration=await load('../docs/chameleonjp-lab/sql/common-score-receipt-v1.sql');
test('legacy receipt preserves rules, exact response, prior records and failure atomicity',async t=>{
  const db=new PGlite();
  const submit=(id,name='花子',game='negative',score=-7,version='fixture-v1')=>db.query(
    'select * from public.submit_score_once_shared_v1($1::uuid,$2,$3,$4::integer,$5)',[id,name,game,score,version]);
  const counts=async()=> (await db.query(`select (select count(*)::integer from public.score_runs) as runs,
    (select count(*)::integer from private.common_score_receipts_v1) as receipts`)).rows[0];
  try {
    await db.exec(fixture);
    const before=(await db.query('select pg_catalog.to_jsonb(s) as value from public.game_scores s')).rows;
    const original=(await db.query(`select pg_catalog.pg_get_functiondef('public.submit_score(text,text,integer,text)'::regprocedure) as value`)).rows;
    const metadataSignature='public.submit_score_with_metadata(text,text,integer,text,jsonb)';
    const metadataState=async()=> (await db.query(`select pg_get_functiondef('${metadataSignature}'::regprocedure) as definition,
      proacl::text as acl from pg_proc where oid='${metadataSignature}'::regprocedure`)).rows;
    const metadataBefore=await metadataState();
    await db.exec(migration);
    assert.deepEqual((await db.query('select pg_catalog.to_jsonb(s) as value from public.game_scores s')).rows,before);
    assert.deepEqual((await db.query(`select pg_catalog.pg_get_functiondef('public.submit_score(text,text,integer,text)'::regprocedure) as value`)).rows,original);
    assert.deepEqual(await metadataState(),metadataBefore,'existing metadata definition and ACL must remain unchanged');
    assert.equal((await db.query("select to_regprocedure('public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb)') is null as absent")).rows[0].absent,true,'no new metadata entrypoint may be installed');
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query("select * from public.submit_score_with_metadata('blocked','negative',1,'test','{}'::jsonb)"),e=>e.code==='42501');
      await db.exec('reset role');
    }
    await db.exec('set role anon');
    const id=randomUUID(), first=(await submit(id)).rows[0];
    assert.equal(first.result_best_score,-7);assert.equal(first.was_duplicate,false);
    const next=(await submit(randomUUID(),'花子','negative',-5)).rows[0];
    assert.equal(next.result_best_score,-5);assert.equal(next.result_play_count,2);
    assert.deepEqual((await submit(id)).rows[0],{...first,was_duplicate:true});
    for(const args of [[id,'別の人','negative',-7],[id,'花子','negative',-6],[id,'花子','ascending',-7],[id,'花子','negative',-7,'other-version']]){
      await assert.rejects(submit(...args),e=>e.code==='PT409');
    }
    await assert.rejects(db.query('select * from private.common_score_receipts_v1'),/permission denied/);
    await db.exec('reset role');assert.deepEqual(await counts(),{runs:2,receipts:2});
    await db.exec('set role authenticated');
    const ascending=await submit(randomUUID(),'同名','ascending',1000);
    assert.equal(ascending.rows[0].result_best_score,1000);
    assert.equal((await submit(randomUUID(),'同名','ascending',900)).rows[0].result_best_score,900);
    for(const args of [[randomUUID(),'','negative',1],[randomUUID(),'x','verified',1],[randomUUID(),'x','takkeu',1],[randomUUID(),'x','inactive',1],[randomUUID(),'x','negative',100000001],[null,'x','negative',1],[randomUUID(),null,'negative',1],[randomUUID(),'x',null,1],[randomUUID(),'x','negative',null]]){
      await assert.rejects(submit(...args));
    }
    await db.exec('reset role');assert.deepEqual(await counts(),{runs:4,receipts:4});
    await db.exec('begin');await submit(randomUUID(),'rollback','negative',1);await db.exec('rollback');
    assert.deepEqual(await counts(),{runs:4,receipts:4});
    // A later failure creating the receipt must also roll back the legacy score.
    await db.exec(`create function private.reject_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture disk failure'; end$$;
      create trigger reject_receipt before insert on private.common_score_receipts_v1 for each row execute function private.reject_receipt();`);
    const failedId=randomUUID();
    await assert.rejects(submit(failedId,'receipt-failure','negative',5),/fixture disk failure/);
    assert.deepEqual(await counts(),{runs:4,receipts:4});
    await db.exec('drop trigger reject_receipt on private.common_score_receipts_v1');
    await db.exec(migration);assert.deepEqual(await counts(),{runs:4,receipts:4});
    assert.equal((await submit(failedId,'receipt-failure','negative',5)).rows[0].was_duplicate,false);
    assert.equal((await submit(failedId,'receipt-failure','negative',5)).rows[0].was_duplicate,true);
    const parallelId=randomUUID();
    const responses=await Promise.all(Array.from({length:12},()=>submit(parallelId,'one-play','negative',3)));
    assert.equal(responses.filter(x=>!x.rows[0].was_duplicate).length,1);
    assert.deepEqual(await counts(),{runs:6,receipts:6});
    assert.deepEqual(await metadataState(),metadataBefore);
    assert.deepEqual((await db.query("select pg_catalog.to_jsonb(s) as value from public.game_scores s where normalized_name='old'")).rows,before);
    t.diagnostic('PGlite uses a single PostgreSQL connection: 12 queued calls verified; separate-connection lock contention is not claimed. No hosted DB used.');
  } finally {await db.close();}
});

test('an already installed metadata wrapper stops migration without replacing or revoking it',async()=>{
  const db=new PGlite();
  try{
    await db.exec(fixture);
    await db.exec(`create function public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb)
      returns boolean language sql as $$select true$$;
      revoke all on function public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb) from public;
      grant execute on function public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb) to authenticated;`);
    const snapshot=async()=> (await db.query(`select pg_get_functiondef(oid) as definition, proacl::text as acl
      from pg_proc where oid='public.submit_score_with_metadata_once_shared_v1(uuid,text,text,integer,text,jsonb)'::regprocedure`)).rows;
    const before=await snapshot();
    await assert.rejects(db.exec(migration),/metadata receipt wrapper already exists/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(),before);
    assert.equal((await db.query("select to_regclass('private.common_score_receipts_v1') is null as absent")).rows[0].absent,true);
  }finally{await db.close();}
});
