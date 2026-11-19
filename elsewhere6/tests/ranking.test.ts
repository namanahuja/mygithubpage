declare const require:any;const test=require('node:test'),assert=require('node:assert/strict');
import {rankLatest,rankGeneral,isRecent,similarity,mergeCoverage,canonicalURL,latestScore} from '../src/shared/ranking';
import {Story} from '../src/shared/types';
import {CATEGORIES} from '../src/shared/classify';
const NOW=Date.parse('2026-11-19T20:00:00Z');
function item(i:number,kind:'general'|'latest'='latest',days=0,worth=4):Story{return {id:'s-'+i,kind,title:`Discovery${i} Phenomenon${i} Insight${i}`,summary:'A useful article explaining a current development with source-supported information and context.',category:CATEGORIES[i%CATEGORIES.length],source:{name:'Publisher '+i,url:`https://publisher.example.com/story-${i}-2026`,quality:.9},alsoReportedBy:[],publishedAt:kind==='latest'?new Date(NOW-days*86400000).toISOString():undefined,worth,whyRead:'A worthwhile discovery.',background:'Context',whyItMatters:'Importance',relatedFacts:[],relatedIds:[],uncertainty:'Not corroborated',readingMinutes:2,provenance:'publisher excerpt'}}
test('Latest caps 25 and excludes undated, future-dated, older-than-seven-days',()=>{
 const items=Array.from({length:45},(_,i)=>item(i));items.push({...item(99),publishedAt:undefined},{...item(98),publishedAt:new Date(NOW+1000).toISOString()},item(97,'latest',8));
 const out=rankLatest(items,undefined,NOW);assert.equal(out.length,25);assert(out.every(s=>isRecent(s,NOW)));
});
test('Latest worth has more influence than freshness and no category quotas',()=>{
 const high=item(50,'latest',6,5),low=item(51,'latest',0,1);high.category=low.category='Science';
 assert(latestScore(high,NOW)>latestScore(low,NOW));
 const r=rankLatest(Array.from({length:25},(_,i)=>{const s=item(i);s.category='Science';return s}),undefined,NOW);assert.equal(r.length,25);
});
test('Latest moves read below unread in reading order',()=>{
 const items=[item(0),item(1),item(2),item(3)];const out=rankLatest(items,{read:{'s-0':10,'s-2':20}},NOW);
 assert.deepEqual(out.slice(-2).map(s=>s.id),['s-0','s-2']);
});
test('Merged duplicate coverage preserves alternate outlet citation',()=>{
 const a=item(1),b=item(2);b.title=a.title;b.source={name:'Different reporter',url:'https://different.example.org/report-123',quality:.8};
 const merged=mergeCoverage([a,b],NOW);assert.equal(merged.length,1);assert.equal(merged[0].alsoReportedBy.length,1);
});
test('canonical URL strips tracking and rejects section homepages',()=>{
 assert.equal(canonicalURL('https://www.example.com/story?a=3&utm_source=twitter#section'),'https://example.com/story?a=3');
 assert.equal(canonicalURL('https://example.com/news/'),'');
});
test('title similarity threshold handles near duplicates',()=>{
 assert(similarity('Science discovers strange ocean beneath Europa','New: Science discovers strange ocean beneath Europa')>=.5);
});
test('General exactly 25, no last-visit repeat when alternatives exist',()=>{
 const a=Array.from({length:75},(_,i)=>item(i,'general'));
 const last=a.slice(0,25).map(s=>s.id);const out=rankGeneral(a,{lastGeneral:last},7,NOW);
 assert.equal(out.length,25);assert(out.every(s=>!last.includes(s.id)));
});
test('General stays identical for same visit and inputs',()=>{
 const a=Array.from({length:80},(_,i)=>item(i,'general'));
 assert.deepEqual(rankGeneral(a,{read:{},lastGeneral:[]},4),rankGeneral(a,{read:{},lastGeneral:[]},4));
});
test('General ranks unread before read; read sorted by time',()=>{
 const a=Array.from({length:26},(_,i)=>item(i,'general'));
 const read=Object.fromEntries(a.slice(0,25).map((s,i)=>[s.id,500-i]));
 const out=rankGeneral(a,{read,lastGeneral:[]},1);
 assert.equal(out[0].id,'s-25');assert.equal(out[1].id,'s-24');
});
test('General ordering ignores interests and likes by design',()=>{
 const a=Array.from({length:40},(_,i)=>item(i,'general'));
 const r=rankGeneral(a,{},7);
 const other=rankGeneral(a,{...({interests:['Sports'],likes:['s-1']} as any)},7);
 assert.deepEqual(r.map(s=>s.id),other.map(s=>s.id));
});
test('General pool spans all required 23 categories',()=>assert.equal(CATEGORIES.length,23));
