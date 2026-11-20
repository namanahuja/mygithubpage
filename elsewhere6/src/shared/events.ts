/** Event identity and multi-source consolidation. The default synthesis is
 * evidence-conservative: distinct source notes remain attributed to outlets.
 */
import {Story,SourceLink} from './types';
import {similarity,tokens,isRecent,latestScore} from './ranking';

type EventTerm={name:string;variants:string[]};
const EVENTS:EventTerm[]=[
 {name:'election',variants:['elected','election','elects','votes','voted','polls','wins','won','victory','defeats']},
 {name:'launch',variants:['launch','launched','unveils','unveiled','debut','premieres','released','release']},
 {name:'approval',variants:['approves','approved','authorizes','authorized','greenlights']},
 {name:'ban',variants:['bans','banned','blocks','block','suspends','suspended','prohibits']},
 {name:'strike',variants:['strikes','strike','attacks','attacked','bombs','bombed','hits']},
 {name:'death',variants:['dies','died','death','killed','fatal','dead']},
 {name:'discovery',variants:['discovers','discovered','finds','found','reveals','detected']},
 {name:'court',variants:['court','lawsuit','ruling','judge','trial','verdict']},
 {name:'resignation',variants:['resigns','resigned','quits','steps down']},
 {name:'agreement',variants:['agreement','deal','treaty','ceasefire','negotiation','agrees']},
 {name:'warning',variants:['warns','warning','warned','forecast','alert','urges']},
 {name:'flood',variants:['floods','flooding','flooded','evacuations','evacuated']},
 {name:'fire',variants:['fire','wildfire','burning','blaze']},
];
const COMMON=new Set(['news','world','today','latest','new','update','report','people','country','city','officials','global','breaking','major','says','could','would','after','with','amid','from','this','that','first','more','over','year','years','its','about','the','and','for','have','has','was','were','are','will']);
function anchors(s:string):Set<string>{return new Set([...tokens(s)].filter(t=>t.length>=4&&!COMMON.has(t)))}
function events(title:string):Set<string>{const t=anchors(title);return new Set(EVENTS.filter(v=>v.variants.some(w=>t.has(w))).map(v=>v.name));}
function proper(title:string):Set<string>{
 const groups=title.match(/(?:\b[A-Z][a-zÀ-ÿ0-9]+\s+){1,3}[A-Z][a-zÀ-ÿ0-9]+|\b[A-Z]{2,}\b/g)||[];
 return new Set(groups.map(x=>x.toLowerCase().replace(/^the\s+/,'')));
}
function intersection<T>(a:Set<T>,b:Set<T>):number {let v=0;for(const x of a)if(b.has(x))v++;return v;}
export function sameEvent(a:Story,b:Story,now=Date.now()):boolean{
 if(!isRecent(a,now)||!isRecent(b,now))return false;
 const at=Date.parse(a.publishedAt||''),bt=Date.parse(b.publishedAt||'');if(Math.abs(at-bt)>48*3600000)return false;
 if(a.source.url===b.source.url)return true;
 const score=similarity(a.title,b.title),ea=events(a.title),eb=events(b.title);
 if(ea.size&&eb.size&&!intersection(ea,eb)&&score<.68)return false;
 if(score>=.59)return true;
 const aa=anchors(a.title),bb=anchors(b.title),pp=proper(a.title),qq=proper(b.title);
 const shared=intersection(aa,bb),commonProper=intersection(pp,qq);
 // A shared named entity AND compatible event type avoids conflating
 // unrelated developments about the same person or company.
 if(commonProper&&shared>=2&&score>=.29&&(!ea.size||!eb.size||intersection(ea,eb)>0))return true;
 // Transposed sentences often have fewer shared proper-name phrases.
 return score>=.43&&shared>=3&&(!ea.size||!eb.size||intersection(ea,eb)>0);
}
function uniqueSources(group:Story[]):SourceLink[]{
 const map=new Map<string,SourceLink>();for(const s of group)map.set(s.source.name+'|'+s.source.url,s.source);return [...map.values()];
}
function cleaned(s:string):string{return s.replace(/\s+/g,' ').trim()}
export function consolidateEvents(input:Story[],now=Date.now()):Story[]{
 const sorted=input.filter(s=>isRecent(s,now)).sort((a,b)=>Date.parse(a.publishedAt||'')-Date.parse(b.publishedAt||'')||a.source.url.localeCompare(b.source.url));
 const groups:Story[][]=[];
 for(const s of sorted){const group=groups.find(g=>g.some(other=>sameEvent(s,other,now)));
  if(group)group.push(s);else groups.push([s]);}
 return groups.map(group=>{
  // One event keeps its oldest coverage as a stable ID anchor. The best
  // accessible article is the representative, not necessarily the oldest.
  const ranked=[...group].sort((a,b)=>{
    const aBody=a.contentStatus==='article-extracted'?1:0,bBody=b.contentStatus==='article-extracted'?1:0;
    return bBody-aBody || latestScore(b,now)-latestScore(a,now);
  });
  const best=ranked[0];const distinct=uniqueSources(group);
  const extra=ranked.filter(x=>x.source.url!==best.source.url).filter((x,i,arr)=>arr.findIndex(z=>z.source.name===x.source.name)===i).slice(0,7);
  const notes=[{name:best.source.name,url:best.source.url,summary:cleaned(best.summary)},...extra.map(x=>({name:x.source.name,url:x.source.url,summary:cleaned(x.summary)}))];
  const anchor=group[0];
  const updatedAt=group.map(s=>s.publishedAt||'').sort().at(-1);
  const sourceNames=new Set(distinct.map(s=>s.name));
  const synopsis=best.summary;
  // Do not blend unverified extra claims into unattributed prose.
  const context=[best.background||'',...(extra.slice(0,3).map(x=>`${x.source.name} reports: ${x.summary}`))].filter(Boolean).join('\n\n');
  return {...best,id:anchor.id,publishedAt:updatedAt,updatedAt,
   summary:synopsis,background:context,
   alsoReportedBy:distinct.filter(x=>x.url!==best.source.url),
   sourceNotes:notes,eventMembers:group.map(s=>s.id),
   corroboration:Math.min(2,Math.max(0,sourceNames.size-1)),
   uncertainty:sourceNames.size>1?`Coverage from ${sourceNames.size} named publishers is grouped by event. Their accounts have not been independently cross-checked; differences are shown with publisher attribution.`:best.uncertainty};
 });
}
