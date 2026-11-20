declare const require:any;declare const process:any;
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
import {extractArticleText,extractiveBrief,robotsAllowed,permittedArticleText,safeArticleHost} from '../src/server/articles';
import {sameEvent,consolidateEvents} from '../src/shared/events';
import {rankLatest} from '../src/shared/ranking';
import {Pipeline} from '../src/server/pipeline';
import {Story,FeedConfig} from '../src/shared/types';
const NOW=Date.parse('2026-11-20T19:00:00Z');
function item(id:string,title:string,source:string,offset=0):Story{return {
  id,kind:'latest',title,summary:'A substantial report explaining the key development, the people involved, what happened, and the details confirmed by this publisher.',
  source:{name:source,url:`https://news-${id}.example-news.net/articles/${id}`,quality:.85},alsoReportedBy:[],publishedAt:new Date(NOW+offset).toISOString(),
  category:'World affairs',background:'Context supported by the publisher.',whyRead:'A concrete detail changes the interpretation of this event.',whyItMatters:'Specific implications were reported.',
  worth:4,relatedFacts:[],relatedIds:[],uncertainty:'Single publisher',readingMinutes:2,provenance:'publisher excerpt'};}
const html=`<html><body><main><article>
<p>Wales earlier celebrated a rugby victory over New Zealand that had been decades in the making and thrilled sporting crowds.</p>
<p>A Welsh-language dub of Star Wars premiered in Cardiff on Thursday evening, at an event attended by the cast and performers.</p>
<p>Actors recorded Welsh voices for Luke Skywalker, Darth Vader and C-3PO in the film, with local performers taking the lead.</p>
<p>Organisers described it as a milestone in Welsh-language film culture, bringing a popular international franchise to Welsh-speaking audiences.</p>
</article></main></body></html>`;
test('V7 extracts article paragraphs and removes unrelated introduction from the summary',()=>{
 const body=extractArticleText(html),brief=extractiveBrief('Welsh-language Star Wars dub premieres in Cardiff',body)!;
 assert(body.includes('Cardiff'));assert(brief.summary.includes('Star Wars'));
 assert(!brief.summary.includes('rugby victory'));assert(!brief.background.includes('rugby victory'));assert(!brief.why.includes('rugby victory'));
 assert.match(brief.why,/Welsh-language/);
});
test('V7 prefers structured NewsArticle articleBody over unrelated page elements',()=>{
 const input=`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',articleBody:'A research team discovered an unusual cosmic signal through a new telescope. Researchers observed new particles after a long study involving several institutes. The discovery improves our understanding of the cosmos and opens research questions.'})}</script><main><p>Subscribe to the newsletter to get daily news updates every morning from the publisher.</p></main>`;
 assert.match(extractArticleText(input),/cosmic signal/);
 assert(!extractArticleText(input).includes('newsletter'));
});
test('V7 respects robots groups, more specific allow, and blocks local URLs',()=>{
 const rules='User-agent: *\nDisallow: /private\nAllow: /private/articles\nUser-agent: ElsewhereDiscovery\nDisallow: /paywall\n';
 assert(robotsAllowed(rules,'/paywall/story')===false);
 assert(robotsAllowed(rules,'/private/news')===true); // specific user-agent rules override wildcard
 assert(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/articles','/private/news')===false);
 assert(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/articles','/private/articles/yes')===true);
 assert.equal(safeArticleHost('https://127.0.0.1/test'),false);
 assert.equal(safeArticleHost('http://news.example.net/one'),false);
});
test('V7 permitted body uses robots and declines when disallowed',async()=>{
 const calls:string[]=[];const url='https://journal.publisher-news.net/articles/welsh-film';
 const fetcher=async(u:string)=>{calls.push(u);return {
  ok:true,status:200,headers:{get:(name:string)=>name==='content-type'?'text/html':null},text:async()=>u.endsWith('robots.txt')?'User-agent: *\nDisallow: /private':html
 }};
 const result=await permittedArticleText(url,fetcher);assert.match(result,/Star Wars/);assert.equal(calls.length,2);
 const restricted=await permittedArticleText('https://another.publisher-news.net/private/news',async(u:string)=>({ok:true,status:200,headers:{get:()=>null},text:async()=>u.endsWith('robots.txt')?'User-agent: *\nDisallow: /private':html}));
 assert.equal(restricted,'');
});
test('V7 merges differently worded coverage of the same event',()=>{
 const first=item('a','Storm Helene floods coastal towns as evacuations begin','BBC');
 const second=item('b','Coastal towns evacuated as Storm Helene brings floods','Guardian',3600000);
 assert(sameEvent(first,second,NOW+3600000));
 const groups=consolidateEvents([first,second],NOW+3600000);
 assert.equal(groups.length,1);assert.equal(groups[0].sourceNotes?.length,2);
 assert.equal(groups[0].alsoReportedBy.length,1);
 assert.deepEqual(new Set(groups[0].eventMembers),new Set(['a','b']));
 // Already-grouped events must retain their original report list after ranking.
 const ranked=rankLatest(groups,undefined,NOW+3600000);
 assert.equal(ranked[0].sourceNotes?.length,2);
});
test('V7 does not merge separate decisions merely sharing entities',()=>{
 const x=item('c','Storm Helene floods coastal towns','BBC');
 const y=item('d','Storm Helene recovery budget approved','Guardian',3600000);
 assert.equal(sameEvent(x,y,NOW+3600000),false);
 assert.equal(consolidateEvents([x,y],NOW+3600000).length,2);
});
test('V7 keeps a stable clustered identity as sources join and preserves articles',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'elsewhere-v7-'));
 const feeds:FeedConfig[]=[{id:'bbc',name:'BBC',tier:'breaking',category:'World affairs',quality:.8,enabled:true,url:'https://feed.publisher-news.net/bbc',licenseNote:'test'},
 {id:'guardian',name:'Guardian',tier:'breaking',category:'World affairs',quality:.8,enabled:true,url:'https://feed.publisher-news.net/guardian',licenseNote:'test'}];
 const rss=(title:string)=>`<rss><channel><item><title>${title}</title><link>https://journal.publisher-news.net/articles/welsh-film-${title.includes('dub')?'one':'two'}</link><pubDate>${new Date(NOW).toUTCString()}</pubDate><description>Performers voiced iconic characters in Welsh as the film premiered in Cardiff in a major cultural event celebrated by local audiences and the performing arts community.</description></item></channel></rss>`;
 const fetcher=async(u:string)=>({ok:true,status:200,headers:{get:()=>null},text:async()=>u.includes('/bbc')?rss('Welsh-language Star Wars dub premieres in Cardiff'):rss('Star Wars premieres in Welsh for the first time in Cardiff')});
 const p=new Pipeline({dataDir:tmp,feeds,fetcher,env:{ARTICLE_EXTRACTION:'off'}});
 await p.ingest('breaking',NOW);const latest=p.latest(NOW);assert.equal(latest.length,1);
 assert.equal(latest[0].sourceNotes?.length,2);const stableId=latest[0].id;
 await p.ingest('breaking',NOW+120000);assert.equal(p.latest(NOW+120000)[0].id,stableId);
 const restored=new Pipeline({dataDir:tmp,feeds,fetcher,env:{ARTICLE_EXTRACTION:'off'}});
 assert.equal(restored.latest(NOW+120000)[0].id,stableId);
});
