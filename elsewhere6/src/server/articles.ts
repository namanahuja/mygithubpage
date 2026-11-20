/** Publisher-content extraction and concise, evidence-bounded article briefs.
 * No paywall bypass, no copying of full text into the public cache, no model key needed.
 */
import {Story,FeedConfig} from '../shared/types';
import {decodeXML,stripMarkup} from './pipeline';
import {tokens} from '../shared/ranking';
declare const process:any;

const USER_AGENT='ElsewhereDiscovery/7.0 (+https://github.com/namanahuja/mygithubpage; article summaries)';
const ROBOTS_TTL=6*3600000;
const ROBOTS_CACHE=new Map<string,{at:number;rules:string;ok:boolean}>();
const NOISE=/^(advertisement|advertising|sign up|subscribe|newsletter|share this|read more|related article|all rights reserved|this article is more than|skip to|follow us|watch live|cookie|we use cookies|support our journalism|listen to|image:|photograph:)/i;
const PAYWALL=/(subscribe to (continue|read|unlock)|subscriber-only content|premium subscribers only|paywall|article is for subscribers)/i;
const BLOCK_HOST=/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.example\.(?:com|org|net)|(?:\d{1,3}\.){3}\d{1,3}|\[.*\])$/i;

export function safeArticleHost(url:string):boolean {
  try {const u=new URL(url);return u.protocol==='https:'&&!BLOCK_HOST.test(u.hostname)&&!!u.hostname.includes('.')&&!u.username&&!u.password;}
  catch{return false}
}
function constrained(raw:string):string {
  let text=decodeXML(raw).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
  return text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function validParagraph(text:string):boolean {return text.length>=54&&!NOISE.test(text)&&!PAYWALL.test(text)}
function chunks(content:string):string[]{
 const matches=[...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
 return matches.map(x=>constrained(x[1])).filter(validParagraph).slice(0,70);
}
function jsonLdArticle(body:string):string {
 for (const m of body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try {const root=JSON.parse(m[1]);const queue=Array.isArray(root)?root:[root];for(let i=0;i<queue.length&&i<35;i++){
    const obj=queue[i];if(!obj||typeof obj!=='object')continue;
    if(Array.isArray(obj['@graph']))queue.push(...obj['@graph']);
    if(/(?:NewsArticle|Article|ReportageNewsArticle)/i.test(String(obj['@type']))&&typeof obj.articleBody==='string'&&obj.articleBody.length>160)return constrained(obj.articleBody);
  }}catch{/* Publisher JSON-LD is optional. */}
 }
 return '';
}
export function extractArticleText(body:string):string {
  if(!body||PAYWALL.test(body.slice(0,8000)))return '';
  const ld=jsonLdArticle(body);if(ld.length>200)return ld.slice(0,16000);
  const article=body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||
    body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'';
  const paragraphs=chunks(article||body);
  const text=paragraphs.join('\n\n');
  return text.length>=220?text.slice(0,16000):'';
}
/** Conservative robots interpretation: unavailable robots => no HTML extraction. */
export function robotsAllowed(robots:string,path:string,userAgent='ElsewhereDiscovery'):boolean {
  const lines=robots.split(/\r?\n/);let group:string[]=[];const rules:{agents:string[];directives:{type:string;path:string}[]}[]=[];
  let directives:{type:string;path:string}[]=[];
  const push=()=>{if(group.length)rules.push({agents:group,directives});group=[];directives=[]};
  for(let line of lines){line=line.split('#')[0].trim();if(!line)continue;const idx=line.indexOf(':');if(idx<0)continue;
    const k=line.slice(0,idx).trim().toLowerCase(),v=line.slice(idx+1).trim();
    if(k==='user-agent') {if(directives.length)push();group.push(v.toLowerCase());}
    else if((k==='disallow'||k==='allow')&&group.length)directives.push({type:k,path:v});
  }push();
  const agent=userAgent.toLowerCase();let matching=rules.filter(g=>g.agents.some(a=>a!== '*'&&agent.includes(a)));
  if(!matching.length)matching=rules.filter(g=>g.agents.includes('*'));
  const applicable=matching.flatMap(g=>g.directives).filter(r=>r.path&&r.path!=='#');
  const matched=applicable.filter(r=>{
    const expr=r.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'.*').replace(/\\\$/,'$');
    try{return new RegExp('^'+expr).test(path)}catch{return false}
  }).sort((a,b)=>b.path.length-a.path.length||(a.type==='allow'?-1:1));
  return !matched.length||matched[0].type==='allow';
}
async function guardedFetch(url:string,fetcher:any,timeout=7000):Promise<any>{
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{return await fetcher(url,{signal:ctrl.signal,redirect:'error',headers:{'User-Agent':USER_AGENT,'Accept':'text/html,text/plain,application/json'}})}
 finally{clearTimeout(timer)}
}
async function limitedText(res:any,max=850000):Promise<string>{
 const length=Number(res.headers?.get?.('content-length')||0);if(length>max)throw Error('Article too large');
 if(res.body?.getReader){const reader=res.body.getReader(),chunks:any[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw Error('Article too large')}chunks.push(value)}
  return new TextDecoder().decode(Uint8Array.from(chunks.flatMap(x=>Array.from(x))));
 }
 const text=await res.text();if(text.length>max)throw Error('Article too large');return text;
}
export async function permittedArticleText(url:string,fetcher:any=fetch):Promise<string>{
 if(!safeArticleHost(url))return '';
 const article=new URL(url),origin=article.origin;
 let rules=ROBOTS_CACHE.get(origin);
 if(!rules||Date.now()-rules.at>ROBOTS_TTL){
  try {const r=await guardedFetch(origin+'/robots.txt',fetcher,4500);
   rules={at:Date.now(),ok:r.ok&&r.status!==404,rules:r.ok?(await limitedText(r,200000)):''};
  }catch{rules={at:Date.now(),ok:false,rules:''}}ROBOTS_CACHE.set(origin,rules);
 }
 if(!rules.ok||!robotsAllowed(rules.rules,article.pathname+article.search))return '';
 try {const response=await guardedFetch(url,fetcher,8000);
  if(!response.ok||!String(response.headers?.get?.('content-type')||'text/html').includes('html'))return '';
  return extractArticleText(await limitedText(response));
 }catch{return ''}
}
const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length;
export function articleSentences(text:string):string[] {
 const paragraphs=text.split(/\n\n+/).filter(Boolean);const sentences:string[]=[];
 for(const paragraph of paragraphs){for(const candidate of paragraph.split(/(?<=[.!?])\s+(?=[“"'A-Z0-9])/)){
  const s=candidate.trim();if(s.length>=35&&s.length<=480&&!NOISE.test(s)&&!PAYWALL.test(s))sentences.push(s);
 }}return sentences.slice(0,100);
}
const signal=/\b(announced|said|confirmed|reported|found|discovered|launched|opened|died|killed|injured|won|lost|approved|rejected|voted|published|began|ended|will|could|has|have|is|are|was|were|due to|because|according to|percent|million|billion|first|record)\b/i;
export function extractiveBrief(title:string,body:string,limit=105):{summary:string;background:string;why:string;facts:string[]}|null {
 const sentences=articleSentences(body),titleWords=tokens(title);
 if(sentences.length<2)return null;
 const scored=sentences.map((s,i)=>{
  const ss=tokens(s);let intersection=0;for(const t of titleWords)if(ss.has(t))intersection++;
  const match=intersection/Math.max(1,titleWords.size);
  return {s,i,match,score:match*5+(signal.test(s)?1:0)+Math.max(0,1-i*.06)};
 });
 const anchor=scored.find(x=>x.match>=.2)?.i??0;
 const relevant=scored.filter(x=>x.i>=anchor&&(x.match>=.15||(x.i>anchor&&x.i<=anchor+6))); 
 if(!relevant.length)return null;
 const chosen=[...relevant].sort((a,b)=>b.score-a.score).slice(0,7).sort((a,b)=>a.i-b.i);
 // Prefer the lead event, not unrelated contextual lead-ins.
 const focus=chosen.some(x=>x.match>=.2)?chosen.filter(x=>x.match>=.16):chosen;
 let sum:string[]=[];let length=0;
 for(const x of focus){const n=words(x.s);if(n<6||length+n>limit)continue;sum.push(x.s);length+=n;if(length>=50)break;}
 if(!sum.length)return null;
 const seen=new Set(sum);const background=scored.filter(x=>x.i>=anchor&&!seen.has(x.s)&&(x.match>=.12||(x.i<=anchor+5))).slice(0,5).map(x=>x.s);
 const contextual=[...background,...sum].find(s=>/\b(because|which|would|could|means|impact|risk|affect|previously|historic|milestone|represented|significant|concern|new audience|enables|reach)\b/i.test(s))||background[0]||'';
 return {summary:sum.join(' '),background:background.join('\n\n').slice(0,2100),why:contextual||'',facts:background.slice(0,2)};
}
export async function enrichArticle(story:Story,feed:FeedConfig,fetcher:any=fetch):Promise<Story>{
 const text=await permittedArticleText(story.source.url,fetcher);
 if(!text)return {...story,contentStatus:'excerpt-only'};
 const brief=extractiveBrief(story.title,text);
 if(!brief)return {...story,contentStatus:'excerpt-only'};
 return {...story,summary:brief.summary,background:brief.background||'Further context was unavailable in the accessible article text.',
  whyItMatters:brief.why||'The accessible text does not establish broader implications beyond the reported event.',
  whyRead:brief.why?brief.why.slice(0,180):story.whyRead,
  relatedFacts:brief.facts,contentStatus:'article-extracted',provenance:'article-derived extract',
  uncertainty:'Selected factual passages from the publicly available article body. This is not a complete independently verified account; source text may change.',
  readingMinutes:Math.max(1,Math.ceil((words(brief.summary)+words(brief.background))/210))};
}
