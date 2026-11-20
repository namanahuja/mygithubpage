import {Story, FeedConfig, SourceLink} from '../shared/types';
import {canonicalURL, similarity, isRecent, mergeCoverage, rankLatest} from '../shared/ranking';
import {classify, worthFallback, whyReadFallback} from '../shared/classify';
import {DEFAULT_FEEDS,TIERS,schedules} from './config';
import {enrichArticle,extractiveBrief} from './articles';
import {consolidateEvents} from '../shared/events';
declare const require:any;declare const process:any;
const fs=require('node:fs'), path=require('node:path');
export type FeedStatus={id:string;name:string;tier:string;enabled:boolean;lastRun?:string;nextDue?:string;error?:string;items:number;etag?:string;modified?:string};
type Stored={articleCache?: Record<string,{at:number;story:Story}>;eventIds?:Record<string,string>;eventGroups?:Story[];stories:Story[];feedStatus:Record<string,FeedStatus>;lastGood:Record<string,Story[]>;generalDiscoveries:Story[];linksChecked?:string;generatedAt?:string};
const EMPTY:Stored={stories:[],feedStatus:{},lastGood:{},generalDiscoveries:[],articleCache:{},eventIds:{},eventGroups:[]};
export function decodeXML(value:string):string{return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,k)=>{const s=String(k).toLowerCase();if(s.startsWith('#')){const v=s.startsWith('#x')?parseInt(s.slice(2),16):parseInt(s.slice(1),10);return v>=0&&v<=0x10ffff?String.fromCodePoint(v):''}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as any)[s]||all})}
export function stripMarkup(s:string):string{return decodeXML(s).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
export function xmlValue(item:string,tag:string):string{const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=item.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,'i'));return m?stripMarkup(m[1]):''}
export function parseDate(value:string):number {const ms=Date.parse(value||'');return Number.isFinite(ms)?ms:NaN}
export function isArticleURL(input:string):boolean {const u=canonicalURL(input);if(!u)return false;const p=new URL(u).pathname;return p.length>8&&!/^\/(news|topics|rss|feed|tag|section|category|news-release|latest|world|business|technology|science|politics|sports)(\/)?$/i.test(p);}
export function parseRSS(xml:string,feed:FeedConfig,now=Date.now()):Story[]{
 const parts=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)||[];
 const stories:Story[]=[];
 for(const body of parts.slice(0,70)){
  const title=xmlValue(body,'title');let url=xmlValue(body,'link');
  if(!url){const m=body.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i);url=m?.[1]||''}
  url=canonicalURL(url);
  const rawDate=['pubDate','dc:date','published','updated','atom:published','atom:updated'].map(k=>xmlValue(body,k)).find(Boolean)||'';
  const timestamp=parseDate(rawDate);
  if(!Number.isFinite(timestamp)||timestamp>now||now-timestamp>7*86400000||!isArticleURL(url))continue;
  const candidates=['content:encoded','description','summary','atom:summary'].map(k=>xmlValue(body,k)).filter(Boolean);
  const rawSummary=candidates.sort((a,b)=>b.length-a.length)[0]||'';
  let summary=rawSummary.replace(/^(read more|click here)\s*:?\s*/i,'').trim();
  // A headline is not a summary. Preserve source fidelity, even when it limits the available pool.
  if(!title||summary.split(/\s+/).filter(Boolean).length<12||summary.length<75||/subscribe to|sign up for our newsletter/i.test(summary.slice(0,90)))continue;
  const words=summary.split(/\s+/);
  const sourceText=summary;
  const selected=extractiveBrief(title,sourceText,100);
  if(selected)summary=selected.summary;else if(words.length>100)summary=words.slice(0,100).join(' ')+'…';
  if(/^google trends/i.test(feed.name))continue;
  const category=classify(title,summary,feed.category),worth=worthFallback(title,summary,feed.quality);
  const id='latest-'+require('node:crypto').createHash('sha256').update(url).digest('hex').slice(0,18);
  stories.push({id,contentStatus:'excerpt-only',kind:'latest',title,category,summary,source:{name:feed.name,url,quality:feed.quality},alsoReportedBy:[],
    publishedAt:new Date(timestamp).toISOString(),worth,whyRead:selected?.why?.slice(0,180)||whyReadFallback(category,title,summary),
    background:selected?.background||'The publisher feed contains no additional source-supported context.',
    whyItMatters:selected?.why||'The publisher excerpt does not provide enough evidence to establish wider implications.',
    relatedFacts:selected?.facts||[],relatedIds:[],uncertainty:'Single-publisher excerpt. Claims have not been independently verified. For the full account, consult the linked publisher.',
    readingMinutes:Math.max(1,Math.ceil(words.length/230)),provenance:'publisher excerpt',corroboration:0});
 }
 return stories;
}
/** Optional publisher-text-only summarization. Disabled unless both env vars are supplied. */
export async function summarizePublisherText(story:Story,fetcher:any=fetch,env:any=process.env):Promise<Story>{
 const key=env.LLM_API_KEY,model=env.SUMMARY_MODEL;
 if(!key||!model)return story;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const sourceText=[story.summary,story.background,...(story.sourceNotes||[]).map(s=>s.name+': '+s.summary)].join('\n\n').slice(0,12000);
  const input=`Write a faithful, informative news explainer grounded ONLY in the quoted publisher text. Do not infer causes or significance, invent facts or cite unrelated material. Avoid unrelated introductory anecdotes. Distinguish contested claims by named outlet. Give a concise independent 60-100-word summary if supported; do not pad. Background 90-220 words only if source material supports it. whyItMatters 1-2 specific sentences only if evidenced. whyRead one specific informative sentence, no generic phrases. uncertainty notes what cannot be verified. Output JSON {summary,background,whyItMatters,whyRead,uncertainty}. HEADLINE: ${story.title}. SOURCE TEXT: ${sourceText}`;
  const response=await fetcher('https://api.openai.com/v1/chat/completions',{
   method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a careful news editor. Report only what the supplied text says. Attribute single-source claims. Never invent corroboration, dates, names or context. JSON only.'},{role:'user',content:input}]})
  });
  if(!response.ok)throw Error('Summarization service unavailable');
  const json=await response.json(),output=JSON.parse(json.choices?.[0]?.message?.content||'{}');
  const valid=(x:any,max=3000)=>typeof x==='string'&&x.trim().length>=25&&x.length<max;
  if(!valid(output.summary,1400))return story;
  return {...story,summary:output.summary.trim(),
   background:valid(output.background)?output.background.trim():story.background,
   whyItMatters:valid(output.whyItMatters,800)?output.whyItMatters.trim():story.whyItMatters,
   whyRead:valid(output.whyRead,350)?output.whyRead.trim():story.whyRead,
   uncertainty:valid(output.uncertainty,900)?output.uncertainty.trim():story.uncertainty,
   contentStatus:'synthesized',provenance:story.sourceNotes?.length>1?'AI synthesis of publisher text':'AI summary of publisher text'};
 }catch{return story}finally{clearTimeout(timer)}
}
export function sourceLabels(stories:Story[]):number {return new Set(stories.map(s=>s.source.name)).size}
export async function linkCheck(url:string,fetcher:any=fetch):Promise<boolean>{
 const doFetch=async(method:string)=>{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5000);try{return await fetcher(url,{method,signal:ctrl.signal,redirect:'follow',headers:{'User-Agent':'ElsewhereDiscovery/6.0 (source link verification)'}})}finally{clearTimeout(timer)}};
 try{let res=await doFetch('HEAD');if(res.status===405||res.status===501)res=await doFetch('GET');return (res.status>=200&&res.status<400)||[401,402,403].includes(res.status)}catch{return false}
}
export async function wikipediaFeed(fetcher:any=fetch,date=new Date()):Promise<Story[]>{
 const Y=date.getUTCFullYear(),M=String(date.getUTCMonth()+1).padStart(2,'0'),D=String(date.getUTCDate()).padStart(2,'0');
 const url=`https://en.wikipedia.org/api/rest_v1/feed/featured/${Y}/${M}/${D}`;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{const r=await fetcher(url,{signal:ctrl.signal,headers:{'User-Agent':'ElsewhereDiscovery/6.0 (knowledge discovery)',Accept:'application/json'}});if(!r.ok)throw Error('Wikimedia HTTP '+r.status);const json=await r.json();
 const candidates=[json.tfa,...(json.onthisday||[]).flatMap((x:any)=>x.pages?.slice(0,1)||[])].filter(Boolean);
 return candidates.slice(0,7).map((entry:any,i:number)=>{
  const title=entry.titles?.normalized||entry.title||'';
  const rawUrl=entry.content_urls?.desktop?.page||`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ','_'))}`;
  const sourceURL=canonicalURL(rawUrl)||rawUrl;
  const extract=stripMarkup(entry.extract||'');
  if(!title||extract.split(/\s+/).length<15)return null;
  const summary=extract.split(/\s+/).slice(0,100).join(' ');
  return {id:'wiki-'+Y+M+D+'-'+i,kind:'general',title,category:'History',summary,source:{name:'Wikipedia featured content',url:sourceURL,quality:.72},worth:3,whyRead:'A curated Wikipedia selection you may not have encountered before.',
    background:extract,whyItMatters:'This item was selected by the Wikimedia featured-content service.',relatedFacts:[],relatedIds:[],
    uncertainty:'Wikimedia excerpt: check linked article and its references for context.',alsoReportedBy:[],provenance:'Wikimedia excerpt',readingMinutes:2} as Story;
 }).filter(Boolean) as Story[];
 }finally{clearTimeout(timer)}
}
export class Pipeline {
 state:Stored;
 feeds:FeedConfig[];
 schedule:Record<string,number>;
 env:any;
 dataDir:string;
 file:string;
 busy=new Set<string>();
 timer:any;
 enrichmentScheduled=false;
 enrichmentInProgress=false;
 fetcher:any;
 constructor(opts:{dataDir?:string;feeds?:FeedConfig[];env?:Record<string,string>;fetcher?:any}={}){
  this.dataDir=opts.dataDir||process.env.DATA_DIR||path.join(process.cwd(),'runtime-data');
  this.file=path.join(this.dataDir,'pipeline.json');
  this.env={...process.env,...(opts.env||{})};
  this.schedule=schedules(this.env);
  this.feeds=opts.feeds||DEFAULT_FEEDS;
  this.fetcher=opts.fetcher||fetch;
  this.state=this.load();
 }
 load():Stored{try{return {...EMPTY,...JSON.parse(fs.readFileSync(this.file,'utf8'))}}catch{return {...EMPTY,stories:[],feedStatus:{},lastGood:{},generalDiscoveries:[]}}}
 persist():void{fs.mkdirSync(this.dataDir,{recursive:true});const tmp=this.file+'.'+process.pid+'.'+require('node:crypto').randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.state));fs.renameSync(tmp,this.file)}
 async fetchSource(feed:FeedConfig,now=Date.now()):Promise<{feed:FeedConfig;items:Story[];error?:string}> {
  const previous=this.state.feedStatus[feed.id]||{} as any;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
   const headers:any={'User-Agent':'ElsewhereDiscovery/6.0 (+https://github.com/namanahuja/mygithubpage)','Accept':'application/rss+xml, application/atom+xml, text/xml, application/xml'};
   if(previous.etag)headers['If-None-Match']=previous.etag;
   if(previous.modified)headers['If-Modified-Since']=previous.modified;
   const r=await this.fetcher(feed.url,{signal:controller.signal,redirect:'follow',headers});
   if(r.status===304)return {feed,items:this.state.lastGood[feed.id]||[]};
   if(!r.ok)throw Error('HTTP '+r.status);
   const body=await r.text();if(body.length>1500000)throw Error('Feed exceeds size limit');
   let items=parseRSS(body,feed,now);
   if(!items.length)throw Error('No qualifying dated articles');
   // Read permitted article bodies, not generic RSS teasers. Extracted source text
   // is never stored; only short evidence-based briefs are persisted.
   if(this.env.ARTICLE_EXTRACTION!=='off'){
    const limit=Math.max(0,Math.min(5,Number(this.env.ARTICLE_FETCH_LIMIT??3)||0));
    // A cold free-tier server must publish headline/date/source records promptly;
    // full-text extraction is attempted once a first copy has been published.
    const limitNow=this.state.stories.length?limit:0;
    const enrichments=await Promise.all(items.slice(0,limitNow).map(async(original)=>{
      const cached=this.state.articleCache?.[original.source.url];
      if(cached&&now-cached.at<12*3600000)return cached.story;
      const enriched=await enrichArticle(original,feed,this.fetcher);
      this.state.articleCache ||= {};
      if(enriched.contentStatus==='article-extracted')this.state.articleCache[original.source.url]={at:now,story:enriched};
      return enriched;
    }));
    items=[...enrichments,...items.slice(limitNow)];
   }
   // Optional server-side AI: do not make paid model calls without credentials.
   if(this.env.LLM_API_KEY && this.env.SUMMARY_MODEL && this.env.SUMMARIZE_SINGLE==='on'){
     const enriched=await Promise.all(items.slice(0,3).map(x=>summarizePublisherText(x,this.fetcher,this.env)));
     items=[...enriched,...items.slice(3)];
   }
   const etag=r.headers?.get?.('etag');const modified=r.headers?.get?.('last-modified');
   this.state.feedStatus[feed.id]={...previous,id:feed.id,name:feed.name,tier:feed.tier,items:items.length,enabled:true,lastRun:new Date(now).toISOString(),nextDue:new Date(now+this.schedule[feed.tier]*60000).toISOString(),...(etag?{etag}:{}),...(modified?{modified}:{}),error:undefined};
   return {feed,items};
  }catch(e){return {feed,items:this.state.lastGood[feed.id]||[],error:String((e as Error).message||e)}}finally{clearTimeout(timer)}
 }
 async ingest(tier:string,now=Date.now()):Promise<void>{
  if(this.busy.has(tier))return;
  this.busy.add(tier);
  try{
   if(tier==='general'){
    try{this.state.generalDiscoveries=await wikipediaFeed(this.fetcher,new Date(now));this.state.feedStatus.general={id:'general',name:'Wikimedia featured',tier,items:this.state.generalDiscoveries.length,enabled:true,lastRun:new Date(now).toISOString(),nextDue:new Date(now+this.schedule.general*60000).toISOString()}}catch(e){this.state.feedStatus.general={id:'general',name:'Wikimedia featured',tier,items:this.state.generalDiscoveries.length,enabled:true,lastRun:new Date(now).toISOString(),nextDue:new Date(now+this.schedule.general*60000).toISOString(),error:String(e)}}
   } else if(tier==='links'){
    const library=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','general.json'),'utf8')) as Story[];
    const results=await Promise.all(library.map(s=>linkCheck(s.source.url,this.fetcher)));
    const count=results.filter(Boolean).length;
    // If absolutely nothing responds, do not retire any source.
    this.state.linksChecked=new Date(now).toISOString();this.state.feedStatus.links={id:'links',name:'General source links',tier,items:count,enabled:true,lastRun:new Date(now).toISOString(),nextDue:new Date(now+this.schedule.links*60000).toISOString(),error:count===0?'Network likely offline; no links removed':undefined};
   }else{
    const eligible=this.feeds.filter(f=>f.enabled&&f.tier===tier);
    const results=await Promise.allSettled(eligible.map(f=>this.fetchSource(f,now)));
    for(const item of results){if(item.status!=='fulfilled')continue;const {feed,items,error}=item.value;
     if(!error)this.state.lastGood[feed.id]=items;
     const old=this.state.feedStatus[feed.id]||{} as FeedStatus;
     this.state.feedStatus[feed.id]={...old,id:feed.id,name:feed.name,tier,enabled:true,items:items.length,lastRun:new Date(now).toISOString(),nextDue:new Date(now+this.schedule[tier]*60000).toISOString(),error};
    }
    this.state.stories=Object.values(this.state.lastGood).flat().filter(s=>isRecent(s,now));
    await this.rebuildEvents(now);
   }
   this.state.generatedAt=new Date(now).toISOString();this.persist();
   // Publish the initial feed immediately, then enrich leading summaries without
   // delaying the first response on Render's sleeping/free instances.
   if(this.timer&&tier!=='general'&&tier!=='links'&&this.state.stories.length&&!this.enrichmentScheduled){
     this.enrichmentScheduled=true;
     const pending=setTimeout(()=>void this.enrichSnapshot(),4500);(pending as any).unref?.();
   }
   if(tier!=='general'&&tier!=='links'){
     const statuses=this.feeds.filter(f=>f.tier===tier).map(f=>this.state.feedStatus[f.id]).filter(Boolean);
     console.log('[Elsewhere] ingest',tier,'sources',statuses.length,'working',statuses.filter(s=>!s.error&&s.items).length,
       'totalLatest',this.latest(now).length,'errors',statuses.filter(s=>s.error).map(s=>s.name+': '+String(s.error).slice(0,90)).slice(0,8).join(' | '));
   }
  }finally{this.busy.delete(tier)}
 }
 async enrichSnapshot():Promise<void>{
   if(this.enrichmentInProgress)return;
   this.enrichmentInProgress=true;
   try{
     const now=Date.now();
     const promoted=new Set(this.latest(now).slice(0,18).map(s=>s.source.url));
     const candidates=Object.values(this.state.lastGood).flat().filter(s=>promoted.has(s.source.url)&&s.contentStatus==='excerpt-only').slice(0,12);
     let count=0;
     for(let i=0;i<candidates.length;i+=3){
       const batch=await Promise.all(candidates.slice(i,i+3).map(async story=>{
         const feed=this.feeds.find(f=>f.name===story.source.name);
         if(!feed)return null;
         try{const next=await enrichArticle(story,feed,this.fetcher);return next.contentStatus==='article-extracted'?next:null}catch{return null}
       }));
       for(const item of batch){if(!item)continue;
         for(const articles of Object.values(this.state.lastGood)){
           const idx=articles.findIndex(s=>s.source.url===item.source.url);
           if(idx>=0){articles[idx]=item;count++;break}
         }
         this.state.articleCache ||= {};
         this.state.articleCache[item.source.url]={at:now,story:item};
       }
     }
     if(count){this.state.stories=Object.values(this.state.lastGood).flat().filter(s=>isRecent(s));await this.rebuildEvents();this.persist()}
     console.log('[Elsewhere] background article enrichment',count,'of',candidates.length,'lead reports');
   }catch(e){console.log('[Elsewhere] background article enrichment failed',String(e).slice(0,120))}
   finally{this.enrichmentInProgress=false}
 }
 async rebuildEvents(now=Date.now()):Promise<void>{
   const groups=consolidateEvents(this.state.stories,now);
   const old=this.state.eventIds||{};
   const ids:Record<string,string>={};
   for(const group of groups){
     const members=group.eventMembers||[];
     // Reuse an existing event identity if another publisher has joined.
     const stable=members.map(id=>old[id]).find(Boolean)||group.id;
     group.id=stable;
     for(const id of members)ids[id]=stable;
   }
   this.state.eventIds={...old,...ids};
   // Synthesize merged coverage in source-attributed form. LLM enhancement is
   // opt-in, bounded to a handful of multi-source events per ingestion.
   if(this.env.LLM_API_KEY && this.env.SUMMARY_MODEL && this.env.SUMMARIZE_EVENTS==='on'){
    const choices=groups.filter(s=>(s.sourceNotes?.length||0)>1).slice(0,4);
    for(const event of choices){
      const result=await summarizePublisherText(event,this.fetcher,this.env);
      if(result!==event)Object.assign(event,result);
    }
   }
   this.state.eventGroups=groups;
   if(this.state.articleCache && Object.keys(this.state.articleCache).length>450){
     this.state.articleCache=Object.fromEntries(Object.entries(this.state.articleCache).sort((a,b)=>b[1].at-a[1].at).slice(0,400));
   }
 }
 async tick(now=Date.now()):Promise<void>{
  const tiers=Object.keys(this.schedule).filter(t=>t!=='links'||process.env.LINK_CHECK==='on');
  for(const tier of tiers){const t=this.state.feedStatus[tier]?.lastRun;
   const runs=this.feeds.filter(f=>f.enabled&&f.tier===tier).map(f=>this.state.feedStatus[f.id]?.lastRun).filter(Boolean);
   const last=tier==='general'||tier==='links'?t:(runs.length?runs.sort().at(0):undefined);
   if(!last||now-Date.parse(last)>=this.schedule[tier]*60000)void this.ingest(tier,now);
  }
 }
 start():void{if(process.env.SCHEDULER==='off')return;void this.tick();this.timer=setInterval(()=>void this.tick(),45000);this.timer.unref?.()}
 stop():void{if(this.timer)clearInterval(this.timer)}
 latest(now=Date.now()):Story[]{
  const list=this.state.eventGroups?.length?this.state.eventGroups:consolidateEvents(this.state.stories,now);
  return rankLatest(list,undefined,now);
 }
 status(){return Object.entries(this.schedule).map(([tier,intervalMinutes])=>{
  const all=this.feeds.filter(f=>f.tier===tier&&f.enabled),statuses=all.map(f=>this.state.feedStatus[f.id]).filter(Boolean);
  const last=all.length?statuses.map(s=>s.lastRun).filter(Boolean).sort().at(-1):this.state.feedStatus[tier]?.lastRun;
  return {tier,intervalMinutes,lastRun:last||null,nextDue:last?new Date(Date.parse(last)+intervalMinutes*60000).toISOString():null,errors:statuses.filter(s=>s.error).map(s=>({source:s.name,error:s.error})),running:this.busy.has(tier)};
 })}
}
