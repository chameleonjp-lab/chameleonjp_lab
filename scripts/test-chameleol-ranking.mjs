import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const file = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const gameUrl = 'https://chameleonjp-lab.github.io/chameleol/';
const release = {env: 'production', rankingApi: 'https://verified.example.test/functions/v1/kamereoru'};
const row = (i, rank = i) => ({position:i, rank, buildings:50, average:8000, name:'A' + i});

test('Hall of Fame titles are unique 1–300 and have identical visual ranks', async () => {
  const {getHofRankMeta, HOF_TITLES} = await import('../chameleol-hof.js');
  const source = await file('docs/chameleol-hof-1-300-title-proposals.md');
  const rows = [...source.matchAll(/^\|\s*(\d+)号\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(match => [Number(match[1]), match[2].trim()]);
  assert.equal(rows.length, 300);
  assert.equal(HOF_TITLES.length, 300);
  assert.equal(new Set(HOF_TITLES).size, 300);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i][0], i + 1);
    assert.equal(HOF_TITLES[i], rows[i][1], 'Title must match the adopted source document');
    assert.deepEqual(getHofRankMeta(i + 1), {
      title: rows[i][1], gem:'emerald', tier:'standard', badge:'',
    });
  }
  for (const ordinal of [0,301,302]) {
    assert.deepEqual(getHofRankMeta(ordinal), {
      title:'50棟完全踏破・殿堂入り怪盗', gem:'emerald', tier:'standard', badge:'',
    });
  }
});

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


test('ranking participant count adds regular participants and Hall of Fame members without pagination', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const requests = [];
  const reader = createReader(async raw => {
    const url = new URL(raw);
    requests.push(url.href);
    if (url.href === gameUrl + 'release.json') return Response.json(release);
    assert.equal(url.href, release.rankingApi + '/ranking?limit=1');
    return Response.json({ok:true, version:24, nameCount:3630, restarted:false, rows:[], nextAfter:null});
  });
  assert.equal(await reader.rankingParticipantCount(13), 3643);
  assert.deepEqual(requests, [gameUrl + 'release.json', release.rankingApi + '/ranking?limit=1']);
});

test('ranking participant count rejects absent or invalid metadata and oversized totals', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  for (const nameCount of [undefined, null, '7', -1, 0.5, Number.MAX_SAFE_INTEGER]) {
    const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json')
      ? release : {ok:true,nameCount}));
    await assert.rejects(reader.rankingParticipantCount(1), /無効/);
  }
  const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json')
    ? release : {ok:true,nameCount:3}));
  await assert.rejects(reader.rankingParticipantCount(-1), /無効/);
  await assert.rejects(reader.rankingParticipantCount('1'), /無効/);
  assert.equal(await reader.rankingParticipantCount(0), 3);
  assert.equal(await reader.rankingParticipantCount(2), 5);
});

test('detail ranking retrieves all 205 players in 100-name pages; game preview stays top 30', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const requests = [];
  const names = Array.from({length:205}, (_,i)=>row(i+1));
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl+'release.json') return Response.json(release);
    assert.equal(url.pathname, '/functions/v1/kamereoru/ranking');
    requests.push(url.searchParams.toString());
    const after = Number(url.searchParams.get('after') || 0);
    const limit = Number(url.searchParams.get('limit'));
    assert.ok(limit === 30 || limit === 100);
    const selected = names.slice(after, after+limit);
    return Response.json({ok:true,version:21,restarted:false,rows:selected,
      nextAfter:after+limit < names.length ? after+limit : null});
  });
  const first = await reader.rankingPage();
  const second = await reader.rankingPage(first);
  const third = await reader.rankingPage(second);
  assert.deepEqual([first.rows.length,second.rows.length,third.rows.length], [100,100,5]);
  assert.deepEqual([first.rows[0].rank,second.rows[0].rank,third.rows.at(-1).rank],[1,101,205]);
  assert.equal(third.nextAfter, null);
  assert.deepEqual(requests, [
    'limit=100', 'limit=100&version=21&after=100', 'limit=100&version=21&after=200',
  ]);
  assert.equal((await reader.ranking()).rows.length,30);
  assert.deepEqual(requests.slice(-2), ['limit=30', 'limit=30&version=21&after=30']);
});

test('detail ranking rejects oversized pages beyond the 100-name server contract', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json') ? release :
    {ok:true,version:11,restarted:false,rows:Array.from({length:101},(_,i)=>row(i+1)),nextAfter:null}));
  await assert.rejects(reader.rankingPage(), /形式/);
});

test('detail ranking refreshes when the pinned version expires', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const pages = [
    {version:4,restarted:false,rows:[row(1)],nextAfter:1},
    {version:5,restarted:true,rows:[{...row(1),name:'新しい順位表'}],nextAfter:1},
    {version:5,restarted:false,rows:[row(2)],nextAfter:null},
  ];
  const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json')
    ? release : {ok:true,...pages.shift()}));
  const first = await reader.rankingPage();
  const restarted = await reader.rankingPage(first);
  assert.equal(restarted.restarted,true);
  assert.equal(restarted.rows[0].name,'新しい順位表');
  const next = await reader.rankingPage(restarted);
  assert.equal(next.rows[0].position,2);
  assert.equal(next.nextAfter,null);
});

test('detail ranking rejects cursor inconsistencies to prevent duplicate players', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json')
    ? release : {ok:true,version:1,restarted:false,rows:[row(1)],nextAfter:2}));
  await assert.rejects(reader.rankingPage(), /続き位置/);
});

test('Hall of Fame validates best percentage, retained ordinal and refreshed version', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  let percent = 9235;
  let version = 'a'.repeat(32);
  const hits = [];
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl+'release.json') return Response.json(release);
    assert.equal(url.pathname, '/functions/v1/kamereoru/hall-of-fame');
    hits.push(url.searchParams.toString());
    const requestOldVersion = url.searchParams.has('version') &&
      url.searchParams.get('version') !== version;
    return Response.json({ok:true,version,restarted:requestOldVersion,
      rows: requestOldVersion || !url.searchParams.has('after')
        ? [{ordinal:1,name:'完走者',average:percent}]
        : [],
      nextAfter:requestOldVersion || !url.searchParams.has('after') ? 1 : null});
  });
  const first = await reader.hallOfFame();
  assert.deepEqual(first.rows,[{ordinal:1,name:'完走者',average:9235}]);
  percent = 9655;
  version = 'b'.repeat(32);
  const updated = await reader.hallOfFame(first);
  assert.equal(updated.restarted,true);
  assert.deepEqual(updated.rows,[{ordinal:1,name:'完走者',average:9655}]);
  assert.deepEqual(hits,['','version='+ 'a'.repeat(32) +'&after=1']);
});

test('Hall of Fame rejects missing and malformed matching percentages', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const reader = createReader(async raw => Response.json(String(raw).endsWith('release.json')
    ? release : {ok:true,version:'a'.repeat(32),rows:[{ordinal:1,name:'A'}],nextAfter:null,restarted:false}));
  await assert.rejects(reader.hallOfFame(),/形式/);
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

const {timeAttackMode, timeAttackRows, timeAttackPageResponse} = await import('./fixtures/chameleol-time-attack.mjs');

test('all-colors Time Attack reads only the 20-building board and accepts the 10-second floor', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const row = { ...timeAttackRows[0], family: 'all', titleId: 'ta.title.01', elapsedCs: 1000 };
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') {
      return Response.json({...release,timeAttack:{available:true,rulesVersion:'kamereoru-time-attack-rules-v3'}});
    }
    assert.equal(url.searchParams.get('course'),'all');
    if (url.pathname.endsWith('/time-attack-stats')) {
      return Response.json({modeId:timeAttackMode,totalPlays:1,participantCount:1});
    }
    return Response.json({...timeAttackPageResponse([row],url.searchParams),course:'all'});
  });
  assert.deepEqual(await reader.timeAttackSettings(),{timeAttackAvailable:true,allColorsAvailable:true});
  assert.equal((await reader.timeAttackStats('all')).totalPlays,1);
  assert.deepEqual((await reader.timeAttackPage(null,'all')).rows,[row]);
});

test('Time Attack reads 205 records and preserves the tie at the page boundary', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const hits = [];
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') {
      return Response.json({...release, timeAttack:{available:true, enabled:false}});
    }
    hits.push(url.pathname + url.search);
    if (url.pathname.endsWith('/time-attack-stats')) {
      return Response.json({modeId:timeAttackMode, totalPlays:330, participantCount:205});
    }
    assert.ok(url.pathname.endsWith('/time-attack-ranking'));
    return Response.json(timeAttackPageResponse(timeAttackRows, url.searchParams));
  });
  assert.equal(await reader.timeAttackAvailable(), true);
  assert.deepEqual(await reader.timeAttackStats(), {modeId:timeAttackMode, totalPlays:330, participantCount:205});
  const first = await reader.timeAttackPage();
  const second = await reader.timeAttackPage(first);
  const third = await reader.timeAttackPage(second);
  assert.deepEqual([first, second, third].map(page => page.rows.length), [100, 100, 5]);
  assert.equal(first.rows.at(-1).rank, 100);
  assert.equal(second.rows[0].rank, 100);
  assert.equal(second.rows[1].rank, 102);
  assert.equal(third.rows.at(-1).titleId, null);
  assert.equal(third.nextAfter, null);
  assert.deepEqual(hits.map(hit => hit.split('/').at(-1)), [
    'time-attack-stats',
    'time-attack-ranking?limit=100',
    'time-attack-ranking?limit=100&version=3&after=100',
    'time-attack-ranking?limit=100&version=3&after=200',
  ]);
});

test('Time Attack replaces expired ranking pages and resets the cursor on a source change', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  let source = 'https://old.example.test/functions/v1/kamereoru';
  let version = 3;
  const hits = [];
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') {
      return Response.json({env:'production',rankingApi:source,timeAttack:{available:true}});
    }
    hits.push(url.href);
    return Response.json(timeAttackPageResponse(timeAttackRows, url.searchParams, version));
  });
  const first = await reader.timeAttackPage();
  version++;
  const expired = await reader.timeAttackPage(first);
  assert.equal(expired.restarted, true);
  assert.equal(expired.version, 4);
  assert.equal(expired.rows[0].position, 1);
  source = 'https://new.example.test/functions/v1/kamereoru';
  const changed = await reader.timeAttackPage(expired);
  assert.equal(changed.restarted, true);
  assert.equal(changed.rows[0].position, 1);
  assert.equal(hits.at(-1), source + '/time-attack-ranking?limit=100');
});

test('Time Attack checks availability and rejects responses from the ordinary mode', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  let timeAttack = {available:false,enabled:true};
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') return Response.json({...release, timeAttack});
    assert.equal(timeAttack.available, true, 'the disabled endpoint must never be read');
    return Response.json({...timeAttackPageResponse([], url.searchParams, 0), modeId:'main',
      totalPlays:1, participantCount:0});
  });
  assert.equal(await reader.timeAttackAvailable(), false);
  await assert.rejects(reader.timeAttackPage(), /準備中/);
  await assert.rejects(reader.timeAttackStats(), /準備中/);
  timeAttack = {available:true,enabled:false};
  await assert.rejects(reader.timeAttackPage(), /形式/);
  await assert.rejects(reader.timeAttackStats(), /無効/);
});

test('Time Attack rejects a forged cursor, inconsistent ranks and incorrect title boundaries', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  let updatePage = page => page;
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') {
      return Response.json({...release, timeAttack:{available:true}});
    }
    return Response.json(updatePage(timeAttackPageResponse(timeAttackRows, url.searchParams)));
  });
  await assert.rejects(reader.timeAttackPage({version:0, nextAfter:1, nameCount:2, base:'https://x.test'}), /続き位置/);
  updatePage = page => ({...page, nextAfter:99});
  await assert.rejects(reader.timeAttackPage(), /続き位置/);
  updatePage = page => ({...page, rows:[{...page.rows[0], titleId:'ta.title.02'}, ...page.rows.slice(1)]});
  await assert.rejects(reader.timeAttackPage(), /称号/);
  updatePage = page => ({...page, rows:[page.rows[0], {...page.rows[1], rank:2}, ...page.rows.slice(2)]});
  await assert.rejects(reader.timeAttackPage(), /並び/);
});

test('Time Attack treats a verified empty list and zero counts as ordinary results', async () => {
  const {createReader} = await import('../chameleol-ranking.js');
  const reader = createReader(async raw => {
    const url = new URL(raw);
    if (url.href === gameUrl + 'release.json') {
      return Response.json({...release, timeAttack:{available:true}});
    }
    if (url.pathname.endsWith('/time-attack-stats')) {
      return Response.json({ok:true, modeId:timeAttackMode, totalPlays:0, participantCount:0});
    }
    return Response.json(timeAttackPageResponse([], url.searchParams, 0));
  });
  assert.deepEqual((await reader.timeAttackPage()).rows, []);
  assert.equal((await reader.timeAttackStats()).participantCount, 0);
});
