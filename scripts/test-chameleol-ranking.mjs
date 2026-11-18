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
      display_order integer unique, release_date date, top_ranking_type text, score_order text,
      score_unit text, score_scale int, score_decimals int, score_label text, first_score_label text,
      best_score_label text, is_active boolean, submission_mode text, score_min integer, score_max integer
    ); INSERT INTO games(game_slug,title,display_order) VALUES ('other','既存',1)`);
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
  assert.equal(requests.filter(x=>x.pathname.endsWith('release.json')).length,1);
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
