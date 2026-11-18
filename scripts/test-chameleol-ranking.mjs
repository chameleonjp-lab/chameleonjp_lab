import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const file = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const gameUrl = 'https://chameleonjp-lab.github.io/chameleol/';
const release = {env: 'production', rankingApi: 'https://verified.example.test/functions/v1/kamereoru'};
const row = (i, rank = i) => ({position:i, rank, buildings:50, average:8000, name:'A' + i});

test('public.games registration matches the catalog, is repeatable, and preserves other rows', async () => {
  const catalog = JSON.parse(await file('catalog/games.json')).games;
  const entry = catalog.find(x => x.game_slug === 'chameleol');
  assert.equal(entry?.game_url, gameUrl);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE public.games (
      game_slug text primary key, title text, game_url text, description text, share_text text,
      display_order integer, release_date date, top_ranking_type text, score_order text,
      score_unit text, score_scale int, score_decimals int, score_label text, first_score_label text,
      best_score_label text, is_active boolean, submission_mode text, score_min integer, score_max integer
    );
    CREATE UNIQUE INDEX games_active_display_order_uidx ON games(display_order)
      WHERE is_active IS TRUE AND display_order IS NOT NULL;
    INSERT INTO games(game_slug,title,display_order,is_active) VALUES ('other','既存',1,true)`);
    const sql = await file('docs/chameleonjp-lab/sql/chameleol-register.sql');
    for (let i=0; i<2; i++) await db.exec(sql);
    const {rows} = await db.query('select *, release_date::text as release_date from games order by display_order');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, '既存');
    assert.deepEqual(rows[1], entry);
    await db.exec("update public.games set display_order = 70, title = '古い表記' where game_slug = 'chameleol'");
    await db.exec(sql);
    const refreshed = await db.query("select display_order, title from public.games where game_slug = 'chameleol'");
    assert.deepEqual(refreshed.rows, [{display_order: 70, title: 'カメレオる'}]);
    await db.exec(`UPDATE public.games SET display_order = 60, is_active = false WHERE game_slug = 'chameleol';
      UPDATE public.games SET display_order = 60 WHERE game_slug = 'other'`);
    await db.exec(sql);
    assert.deepEqual((await db.query('select game_slug, display_order, is_active from games order by display_order')).rows, [
      {game_slug: 'other', display_order: 60, is_active: true},
      {game_slug: 'chameleol', display_order: 61, is_active: true},
    ]);
  } finally { await db.close(); }
});

test('reads official stats and all ties at rank 30 with pinned version', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const requests = [];
  const reader = createReader(async url => {
    url = new URL(url);
    requests.push(url);
    let data;
    if (url.href === gameUrl+'release.json') data = release;
    else if (url.href === release.rankingApi+'/stats') data = {ok:true,totalPlays:42,clearerCount:32};
    else {
      assert.equal(url.pathname,'/functions/v1/kamereoru/ranking');
      if (!url.searchParams.has('after')) data = {rows:Array.from({length:30},(_,i)=>row(i+1)),nextAfter:30};
      else {
        assert.equal(url.searchParams.get('after'),'30');
        assert.equal(url.searchParams.get('version'),'12');
        data = {rows:[row(31,30),row(32,30)],nextAfter:null};
      }
      Object.assign(data,{ok:true,version:12,restarted:false});
    }
    return Response.json(data);
  });
  assert.deepEqual(await reader.stats(),{totalPlayCount:42,clearerCount:32});
  const table = await reader.ranking();
  assert.equal(table.version,12);
  assert.equal(table.rows.length,32);
  assert.deepEqual(table.rows.slice(-3).map(x=>x.rank),[30,30,30]);
  assert.equal(requests.filter(x=>x.pathname.endsWith('release.json')).length,2);
});

test('a standalone or verification release is retriable and supplies no data', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  let attempts = 0;
  const reader = createReader(async url => {
    if (String(url).endsWith('release.json')) {
      attempts++;
      return Response.json(attempts === 1 ? {...release,env:'verification'} : release);
    }
    return Response.json({ok:true,totalPlays:0,clearerCount:0});
  });
  await assert.rejects(reader.stats());
  assert.deepEqual(await reader.stats(),{totalPlayCount:0,clearerCount:0});
});

test('a retired version replaces old rows and a stuck cursor fails for retry', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const pages = [
    { version: 4, rows: [row(1)], nextAfter: 1 },
    { version: 5, restarted: true, rows: [{...row(1), name: '更新後'}], nextAfter: 1 },
    { version: 5, rows: [row(2)], nextAfter: null },
    { version: 5, rows: [row(1)], nextAfter: 1 },
    { version: 5, rows: [], nextAfter: 1 },
  ];
  const reader = createReader(async url => Response.json(String(url).endsWith('release.json')
    ? release : { ok: true, ...pages.shift() }));
  assert.deepEqual((await reader.ranking()).rows.map(r => r.name), ['更新後', 'A2']);
  await assert.rejects(reader.ranking(), /続き位置/);
});

test('retry on the same page reads the new production address and never mixes rank pages from two sources',async()=>{
  const {createReader}=await import('../chameleol-ranking.js');
  let current='https://old.example.test', switched=false;
  const calls=[];
  const reader=createReader(async raw=>{
    const u=new URL(raw);
    if(u.href===gameUrl+'release.json')return Response.json({env:'production',rankingApi:current});
    calls.push(u.origin);
    if(switched && u.origin!==current)return new Response('',{status:503});
    return Response.json({ok:true,totalPlays:switched?7:3,clearerCount:1});
  });
  assert.equal((await reader.stats()).totalPlayCount,3);
  current='https://new.example.test';switched=true;
  try {await reader.stats();}catch{}
  assert.equal((await reader.stats()).totalPlayCount,7);
  assert.equal(calls.at(-1),current);
});

test('an uninterrupted stream of retired ranking versions returns control to the retry button',async()=>{
  const {createReader}=await import('../chameleol-ranking.js');
  let calls=0;
  const reader=createReader(async url=>{
    if(String(url).endsWith('release.json'))return Response.json(release);
    if(++calls===7) throw Error('test circuit breaker');
    return Response.json({ok:true,version:calls,rows:[row(1)],restarted:calls>1,nextAfter:1});
  });
  await assert.rejects(reader.ranking(),/更新/);
  assert.ok(calls<7);
});

test('one table keeps the first source for its continuation while the next refresh follows the new release',async()=>{
  const {createReader}=await import('../chameleol-ranking.js');
  const old='https://old.example.test', next='https://new.example.test';
  let source=old;
  const hits=[];
  const reader=createReader(async raw=>{
    const url=new URL(raw);
    if(url.href===gameUrl+'release.json')return Response.json({env:'production',rankingApi:source});
    hits.push(url.origin);
    const more=url.searchParams.has('after');
    if(url.origin===old && !more)source=next;
    return Response.json({ok:true,version:2,rows:[row(more?2:1)],nextAfter:!more&&url.origin===old?1:null});
  });
  assert.equal((await reader.ranking()).rows.length,2);
  assert.equal((await reader.ranking()).rows.length,1);
  assert.deepEqual(hits,[old,old,next]);
});
