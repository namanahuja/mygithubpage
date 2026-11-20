import {Pipeline} from './pipeline';
import {Story} from '../shared/types';
import {rankGeneral,rankLatest} from '../shared/ranking';
declare const process:any;declare const require:any;declare const module:any;
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=process.cwd(),PORT=Number(process.env.PORT||3000),PUBLIC=path.join(ROOT,'public');
const app=new Pipeline();
const library=JSON.parse(fs.readFileSync(path.join(ROOT,'data/general.json'),'utf8')) as Story[];
const rate=new Map<string,{when:number,count:number}>();
function send(res:any,status:number,body:any,extra:Record<string,string>={}){const text=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(text)}
function safeFile(res:any,pathname:string){const file=path.resolve(PUBLIC,'.'+pathname);if(!file.startsWith(PUBLIC+path.sep)&&file!==PUBLIC){res.writeHead(403);res.end();return}
 const target=file===PUBLIC?path.join(PUBLIC,'index.html'):file;
 let data:any;try{data=fs.readFileSync(target)}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return}
 const ext=path.extname(target);const mime=({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'} as any)[ext]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime,'Cache-Control':ext==='.html'?'no-store':'public,max-age=600'});res.end(data)
}
export async function handler(req:any,res:any){
 const peer=(String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'anon').split(',')[0]).slice(0,64),now=Date.now();
 const bucket=rate.get(peer);if(!bucket||now-bucket.when>60000)rate.set(peer,{when:now,count:1});else if(++bucket.count>150){send(res,429,{error:'Rate limit exceeded'},{'Retry-After':'60'});return}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer-when-downgrade');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Permissions-Policy','camera=(),microphone=(),geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'");
 const u=new URL(req.url||'/',`http://localhost:${PORT}`),route=u.pathname;
 if(req.method!=='GET'&&req.method!=='HEAD'){send(res,405,{error:'Method not allowed'});return}
 if(route==='/api/health'){send(res,200,{ok:true,version:'7.1.1',scheduler:process.env.SCHEDULER!=='off',generalLibrary:library.length,latestCached:app.state.stories.length,latestReady:app.latest().length,ingesting:[...app.busy],feedsWithStories:Object.values(app.state.feedStatus).filter((f:any)=>f.items>0&&!f.error).length,lastUpdated:app.state.generatedAt||null});return}
 if(route==='/api/latest'){
  // Free instances may answer before the asynchronous first-feed refresh finishes.
  // Wait briefly for first arrivals rather than returning a misleading empty list.
  if(!app.latest().length&&app.busy.size){
    const start=Date.now();while(!app.latest().length&&app.busy.size&&Date.now()-start<9000)await new Promise(resolve=>setTimeout(resolve,350));
  }
  const current=app.latest();const states=app.status();
  // General-library refreshes do not count as a verified Latest refresh.
  const lastGoodRuns=app.feeds.filter(f=>f.enabled).map(f=>app.state.feedStatus[f.id]).filter(s=>s&&s.lastRun&&!s.error&&s.items>0);
  const lastGood=lastGoodRuns.map(s=>s.lastRun!).sort().at(-1)||null;
  const stale=!lastGood||Date.now()-Date.parse(lastGood)>6*3600000||!current.length;
  send(res,200,{generatedAt:lastGood,stale,pending:app.busy.size>0&&!current.length,stories:current,sources:app.feeds.map(f=>({id:f.id,name:f.name,enabled:f.enabled,category:f.category,tier:f.tier,quality:f.quality,...(app.state.feedStatus[f.id]||{})})),window:{hours:168,preferredHours:48},tiers:states,provenance:'in-app source-grounded briefs; article bodies when permitted, excerpts otherwise; event clusters are heuristic and not independent fact checking'});return;
 }
 if(route==='/api/general/discoveries'){
  const lastRun=app.state.feedStatus.general?.lastRun||null;
  send(res,200,{generatedAt:lastRun,stale:!lastRun||Date.now()-Date.parse(lastRun)>12*3600000,stories:app.state.generalDiscoveries,source:'Wikimedia featured excerpts; verified article URLs'});return;
 }
 if(route==='/api/general'){
  const visit=Math.min(1e8,Math.max(0,Number(u.searchParams.get('visit')||1)))||1;
  const ids=(s:string)=>Object.fromEntries(s.split(',').filter(x=>/^[a-z\d-]{1,100}$/.test(x)).slice(0,2000).map(x=>[x,1]));
  const read=ids(u.searchParams.get('read')||''),hidden=ids(u.searchParams.get('hidden')||''),known=ids(u.searchParams.get('known')||''),last=(u.searchParams.get('last')||'').split(',').filter(Boolean).slice(0,25);
  const stories=rankGeneral([...library,...app.state.generalDiscoveries],{read,hidden,known,lastGeneral:last},visit).slice(0,25);
  send(res,200,{generatedAt:new Date().toISOString(),stories,count:stories.length,source:'curated offline library + optional Wikimedia excerpts'});return;
 }
 if(route==='/api/schedule'){send(res,200,{scheduler:process.env.SCHEDULER==='off'?'off':'on',tiers:app.status(),refreshConfig:app.schedule,updatedAt:app.state.generatedAt||null});return}
 if(route==='/api/stories'){
  const q=(u.searchParams.get('q')||'').trim().slice(0,140).toLowerCase();if(!q){send(res,200,{stories:[]});return}
  const stories=[...library,...app.latest(),...app.state.generalDiscoveries].filter(x=>(x.title+' '+x.summary+' '+x.category).toLowerCase().includes(q)).slice(0,75);
  send(res,200,{query:q,stories});return;
 }
 if(route.startsWith('/api/')){send(res,404,{error:'Unknown API endpoint'});return}
 if(route==='/'||/^\/(index\.html|app\.js|styles\.css|manifest\.webmanifest|sw\.js|icon\.svg)$/.test(route)){safeFile(res,route);return}
 safeFile(res,route);
}
if(require.main===module){app.start();const server=http.createServer(handler);server.listen(PORT,'0.0.0.0',()=>console.log(`[Elsewhere] ${PORT} | ${library.length} general | ${app.feeds.filter(f=>f.enabled).length} feeds`));process.on('SIGTERM',()=>{app.stop();server.close()})}
export {app,library};
