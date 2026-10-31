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
    await db.exec(migration);
    assert.deepEqual((await db.query('select pg_catalog.to_jsonb(s) as value from public.game_scores s')).rows,before);
    assert.deepEqual((await db.query(`select pg_catalog.pg_get_functiondef('public.submit_score(text,text,integer,text)'::regprocedure) as value`)).rows,original);
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
    await assert.rejects(submit(randomUUID(),'receipt-failure','negative',5),/fixture disk failure/);
    assert.deepEqual(await counts(),{runs:4,receipts:4});
    await db.exec('drop trigger reject_receipt on private.common_score_receipts_v1');
    await db.exec(migration);assert.deepEqual(await counts(),{runs:4,receipts:4});
    const parallelId=randomUUID();
    const responses=await Promise.all(Array.from({length:12},()=>submit(parallelId,'one-play','negative',3)));
    assert.equal(responses.filter(x=>!x.rows[0].was_duplicate).length,1);
    assert.deepEqual(await counts(),{runs:5,receipts:5});
    t.diagnostic('PGlite uses a single PostgreSQL connection: 12 queued calls verified; separate-connection lock contention is not claimed. No hosted DB used.');
  } finally {await db.close();}
});
