declare const process:any;
declare const require:any;const test=require('node:test'),assert=require('node:assert/strict');
import {parseRSS,linkCheck,wikipediaFeed,Pipeline} from '../src/server/pipeline';
import {DEFAULT_FEEDS,schedules} from '../src/server/config';
import {isRecent} from '../src/shared/ranking';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const NOW=Date.parse('2026-11-19T20:00:00Z');
const feed=DEFAULT_FEEDS[0];
function rss(stories:{title:string;date:string;link?:string;description?:string}[]){return '<rss><channel>'+stories.map(s=>`<item><title>${s.title}</title><link>${s.link||'https://example.org/articles/'+encodeURIComponent(s.title)}</link><pubDate>${s.date}</pubDate><description><![CDATA[${s.description||'This is a useful reported development with multiple paragraphs of clear factual background, important implications, and information that can be used to understand a real story.'}]]></description></item>`).join('')+'</channel></rss>'}
function date(offset=0){return new Date(NOW-offset*86400000).toUTCString()}
test('RSS normalization includes canonical source dates and rejects expired/future/undated/sections',()=>{
 const result=parseRSS(rss([{title:'Valid current story',date:date(),link:'https://example.org/article/a?utm_source=x'}, {title:'Very old event',date:date(8)},{title:'Future event',date:date(-2)},{title:'Undated event',date:''},{title:'Section link',date:date(),link:'https://example.org/news'}]),feed,NOW);
 assert.equal(result.length,1);assert.equal(result[0].publishedAt,new Date(NOW).toISOString());assert.equal(result[0].source.url,'https://example.org/article/a');
});
test('RSS skips headline-only content',()=>assert.equal(parseRSS(rss([{title:'Short item',date:date(),description:'Open the source.'}]),feed,NOW).length,0));
test('RSS parses Atom entries',()=>{
 const atom=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Major science result</title><link href="https://example.com/news/scientific-result"/><published>${new Date(NOW).toISOString()}</published><summary>A substantive article description explaining a scientific result and why this matters to a general reader who follows research and new discoveries.</summary></entry></feed>`;
 assert.equal(parseRSS(atom,feed,NOW).length,1);
});
test('link checker treats restricted 403 as reachable and retries HEAD 405 with GET',async()=>{
 let count=0;const fetcher=async (_url:string,opts:any)=>{count++;return {status:opts.method==='HEAD'?405:403}};
 assert.equal(await linkCheck('https://example.org/article',fetcher),true);assert.equal(count,2);
});
test('Wikimedia featured feed parser supplies sourced discoveries',async()=>{
 const stub=async()=>({ok:true,json:async()=>({tfa:{title:'The moon',extract:'The Moon is the only natural satellite of Earth and has been visited by astronauts. Its apparent motions influence many calendars and cultural traditions.'}})});
 const out=await wikipediaFeed(stub,new Date(NOW));assert.equal(out.length,1);assert.match(out[0].source.url,/wikipedia/);
});
test('schedule intervals default and override',()=>{
 assert.equal(schedules({}).breaking,15);assert.equal(schedules({REFRESH_POP_MINUTES:'19'}).pop,19);
 assert.equal(schedules({SCHEDULE_JSON:'{"general":90}'}).general,90);
});
test('pipeline keeps failures isolated and marks stale on all-source first run',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'elsewhere-tst-'));
 const fetcher=async()=>{throw Error('network down')};
 const pipe=new Pipeline({feeds:[feed],dataDir:temp,fetcher});
 await pipe.ingest('breaking',NOW);
 assert.equal(pipe.latest(NOW).length,0);assert.equal(pipe.state.feedStatus[feed.id].error,'network down');
 assert.equal(pipe.state.stories.length,0);
});
test('pipeline persists valid results atomically and reuses lastGood on source failure',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'elsewhere-persist-'));
 let up=true;const fetcher=async()=>up?{ok:true,status:200,headers:{get:()=>null},text:async()=>rss([{title:'Current and useful news',date:date()}])}:Promise.reject(Error('publisher down'));
 const pipe=new Pipeline({feeds:[feed],dataDir:temp,fetcher});
 await pipe.ingest('breaking',NOW);assert.equal(pipe.state.stories.length,1);
 up=false;await pipe.ingest('breaking',NOW+60000);assert.equal(pipe.latest(NOW+60000).length,1);
 const restored=new Pipeline({feeds:[feed],dataDir:temp,fetcher});assert.equal(restored.latest(NOW+60000).length,1);
});
test('scheduler never runs the same tier twice concurrently',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'elsewhere-lock-'));let calls=0;
 const slow=async()=>{calls++;await new Promise(r=>setTimeout(r,40));throw Error('failed')};
 const p=new Pipeline({feeds:[feed],dataDir:temp,fetcher:slow});
 await Promise.all([p.ingest('breaking',NOW),p.ingest('breaking',NOW)]);assert.equal(calls,1);
});
test('content library meets 150+ / 23 categories / summary-detail shape',()=>{
 const lib=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data/general.json'),'utf8'));
 assert(lib.length>=150);assert.equal(new Set(lib.map((s:any)=>s.category)).size,23);
 for(const s of lib){const n=s.summary.trim().split(/\s+/).length,d=s.background.trim().split(/\s+/).length;assert(n>=50&&n<=100,`${s.id}: summary ${n}`);assert(d>=200&&d<=500,`${s.id}:detail ${d}`);assert(/^https:\/\//.test(s.source.url));assert(s.worth>=1&&s.worth<=5)}
});
