import {consolidateEvents} from './events';
import {Story, UserState} from './types';
export const MAX_LATEST_AGE_MS = 7*86400000;
const HOUR=3600000;
export function ageMilliseconds(date:string|undefined, now=Date.now()):number { const ms=Date.parse(date||''); return Number.isFinite(ms)?now-ms:Infinity; }
export function isRecent(s:Story,now=Date.now()):boolean {
  if(s.kind!=='latest'||!/^https:\/\//i.test(s.source.url))return false;
  const age=ageMilliseconds(s.publishedAt,now);
  return age>=0&&age<=MAX_LATEST_AGE_MS;
}
export function canonicalURL(input:string):string {
  try {const u=new URL(input);if(u.protocol!=='https:')return '';u.hash='';u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');
    for(const key of [...u.searchParams.keys()]) if(/^(utm_|fbclid|gclid|mc_|ref$|s$|cmpid$|output$)/i.test(key))u.searchParams.delete(key);
    if(/^\/(?:|news|world|home|articles|category|topics|rss|feed)\/?$/i.test(u.pathname))return '';
    return u.toString();
  }catch{return ''}
}
export function tokens(title:string):Set<string>{ return new Set(title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/).filter(t=>t.length>2&&!['the','and','for','with','what','how','why','today','says','after','from','about','this','that','into','over'].includes(t))); }
export function similarity(a:string,b:string):number {const A=tokens(a),B=tokens(b); if(!A.size||!B.size)return 0;let overlap=0;for(const t of A)if(B.has(t))overlap++;return overlap/(A.size+B.size-overlap);}
function sourceQuality(s:Story):number {return Math.max(0,Math.min(1,s.source.quality??.65))}
export function latestScore(s:Story,now=Date.now(),read?:Record<string,number>,viewed?:Record<string,number>):number {
 const age=ageMilliseconds(s.publishedAt,now);
 const worth=(Math.max(1,Math.min(5,s.worth))-1)/4;
 const fresh=Math.max(0,Math.min(1,1-age/MAX_LATEST_AGE_MS));
 const corroboration=Math.min(2,s.corroboration??s.alsoReportedBy?.length??0)/2;
 const novelty=read?.[s.id]?0:viewed?.[s.id]?.5:1;
 return .55*worth+.25*fresh+.10*corroboration+.05*sourceQuality(s)+.05*novelty;
}
export function mergeCoverage(input:Story[],now=Date.now()):Story[]{
 // Imported on demand to avoid imposing the server's extraction dependency
 // on the browser bundle. Both this module and events.ts are pure functions.
 if(input.length&&input.every(s=>Array.isArray(s.eventMembers)&&s.eventMembers.length))return input.filter(s=>isRecent(s,now));
 return consolidateEvents(input,now);
}
export function rankLatest(stories:Story[],state?:Partial<UserState>,now=Date.now()):Story[]{
 const grouped=mergeCoverage(stories,now),read=state?.read||{},viewed=state?.viewed||{};
 return grouped.sort((a,b)=>{
  const ar=read[a.id]||0,br=read[b.id]||0;
  if(Boolean(ar)!==Boolean(br))return ar?1:-1;
  if(ar&&br)return ar-br;
  return latestScore(b,now,read,viewed)-latestScore(a,now,read,viewed);
 }).slice(0,25);
}
function hashed(seed:string):number {let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return (h>>>0)/4294967296;}
export function rankGeneral(all:Story[],state:Partial<UserState>,visit:number,now=Date.now()):Story[]{
 const read=state.read||{},known=state.known||{},hidden=state.hidden||{},last=new Set(state.lastGeneral||[]);
 const clean=all.filter(s=>s.kind==='general'&&!known[s.id]&&!hidden[s.id]);
 const tiers=[clean.filter(s=>!read[s.id]&&!last.has(s.id)),clean.filter(s=>!read[s.id]&&last.has(s.id)),clean.filter(s=>!!read[s.id])];
 const order=(a:Story,b:Story)=>b.worth+.6*hashed(b.id+':'+visit) - (a.worth+.6*hashed(a.id+':'+visit));
 const selection=tiers.flatMap(t=>t.sort(order)).slice(0,25);
 return selection.sort((a,b)=>{
   const ar=read[a.id]||0,br=read[b.id]||0;
   if(Boolean(ar)!==Boolean(br))return ar?1:-1;
   if(ar&&br)return ar-br;
   return 0;
 });
}
