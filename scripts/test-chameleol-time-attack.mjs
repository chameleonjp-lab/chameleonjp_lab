import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createReader} from '../chameleol-ranking.js';

const url='https://chameleonjp-lab.github.io/chameleol/release.json';
const api='https://api.example.test/functions/v1/kamereoru';
const release={env:'production',rankingApi:api,timeAttack:{available:true,enabled:false}};
const row=(i,rank=i)=>({position:i,rank,name:'ユーザー'+i,elapsedCs:4500+i,
 family:i%3===0?'red':i%3===1?'green':'blue',titleId:'ta.title.03'});
test('TA stats use a separate endpoint and never count main-mode plays',async()=>{
 const reads=[];
 const reader=createReader(async raw=>{
  reads.push(String(raw));
  if(String(raw)===url)return Response.json(release);
  assert.equal(String(raw),api+'/time-attack-stats');
  return Response.json({ok:true,modeId:'chameleol_time_attack',totalPlays:22,participantCount:5});
 });
 assert.deepEqual(await reader.timeAttackStats(),{totalPlays:22,participantCount:5});
 assert.equal(reads.length,2);
 assert.ok(reads.every(x=>!x.endsWith('/stats')));
});
test('TA pages 205 registered names, preserves equal ranks, and retains source',async()=>{
 const calls=[];
 const reader=createReader(async raw=>{
  const u=new URL(raw);
  if(u.href===url)return Response.json(release);
  calls.push(u);
  assert.equal(u.pathname,'/functions/v1/kamereoru/time-attack-ranking');
  const after=Number(u.searchParams.get('after')||0),limit=Number(u.searchParams.get('limit'));
  const rows=Array.from({length:Math.min(205-after,limit)},(_,i)=>{
   const n=after+i+1;return row(n,n===101?100:n);
  });
  return Response.json({ok:true,modeId:'chameleol_time_attack',version:9,
    rows,nameCount:205,restarted:false,nextAfter:after+limit<205?after+limit:null});
 });
 const a=await reader.timeAttackPage(),b=await reader.timeAttackPage(a),c=await reader.timeAttackPage(b);
 assert.deepEqual([a.rows.length,b.rows.length,c.rows.length],[100,100,5]);
 assert.equal(b.rows[0].rank,100);
 assert.equal(c.nextAfter,null);
 assert.deepEqual(calls.map(x=>x.search),['?limit=100','?limit=100&version=9&after=100','?limit=100&version=9&after=200']);
});
test('TA invalid source or invalid response is rejected',async()=>{
 const invalidRelease=createReader(async ()=>Response.json({...release,timeAttack:{available:false}}));
 await assert.rejects(invalidRelease.timeAttackPage(),/準備中/);
 const invalidTime=createReader(async raw=>Response.json(String(raw)===url?release:
   {ok:true,modeId:'chameleol_time_attack',version:1,restarted:false,nameCount:1,
    rows:[{...row(1),elapsedCs:123}],nextAfter:null}));
 await assert.rejects(invalidTime.timeAttackPage(),/値/);
 const invalidMode=createReader(async raw=>Response.json(String(raw)===url?release:
   {ok:true,modeId:'chameleol',version:1,restarted:false,nameCount:0,rows:[],nextAfter:null}));
 await assert.rejects(invalidMode.timeAttackPage(),/形式/);
});
test('TA translation lookup recognizes all 58 title IDs, 15 languages, and safe names',async()=>{
 const source=await readFile(new URL('../i18n/chameleol-time-attack.js',import.meta.url),'utf8');
 const context={window:{LabI18nRows:[]}};vm.runInNewContext(source,context);
 const service=context.window.ChameleolTimeAttack;
 assert.equal(context.window.LabI18nRows.length,23);
 for(const row of context.window.LabI18nRows)assert.equal(row.length,15);
 for(let i=1;i<=58;i++){
  const id='ta.title.'+String(i).padStart(2,'0');
  assert.notEqual(service.title(id,'ja'),'30棟完走');
  assert.notEqual(service.title(id,'en'),'30 buildings completed');
 }
 assert.equal(service.title('ta.title.59','ja'),'30棟完走');
 assert.equal(service.family('green','ko'),'초록 계열');
});
