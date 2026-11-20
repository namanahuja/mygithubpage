/* Elsewhere's dependency-free browser client. Links remain valid without this script. */
try {
(() => {
  type AnyStory=any;type Store={read:Record<string,number>;viewed:Record<string,number>;saved:Record<string,AnyStory>;hidden:Record<string,number>;known:Record<string,number>;interesting:Record<string,number>;visits:number;lastGeneral:string[];seen:Record<string,number>;latestCache:AnyStory[];latestFetchedAt:string;theme:string;generalSelection:string[];generalMixAt:number;lastOpenedAt:number;generalRemote:AnyStory[]};
  const $=(selector:string,base:ParentNode=document)=>base.querySelector(selector) as HTMLElement|null;
  const queryAll=(selector:string,base:ParentNode=document)=>Array.from(base.querySelectorAll(selector)) as HTMLElement[];
  const id=(s:string)=>document.getElementById(s);
  const raw=id('embedded-general')?.textContent||'[]';
  const general:AnyStory[]=JSON.parse(raw);
  const demo:AnyStory[]=JSON.parse(id('embedded-demo')?.textContent||'[]');
  const STORAGE='elsewhere-state-v6';let memory:Partial<Store>={};
  try{memory=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{}}catch{}
  const state:Store={read:memory.read||{},viewed:memory.viewed||{},saved:memory.saved||{},hidden:memory.hidden||{},known:memory.known||{},interesting:memory.interesting||{},visits:Number(memory.visits||0),lastGeneral:memory.lastGeneral||[],seen:memory.seen||{},latestCache:memory.latestCache||[],latestFetchedAt:memory.latestFetchedAt||'',theme:memory.theme||'dark',generalSelection:memory.generalSelection||[],generalMixAt:Number(memory.generalMixAt||0),lastOpenedAt:Number(memory.lastOpenedAt||0),generalRemote:memory.generalRemote||[]};
  let latest:AnyStory[]=[];let latestSelection:string[]=[];let generalMix:AnyStory[]=[];let mixChanged=0;let latestChanged=0;let status:'loading'|'live'|'cached'|'demo'|'offline'='loading';let errorText='';let allowOlder=false;
  let dialogReturn='#general';let sectionScroll:Record<string,number>={latest:0,general:0};let searchQuery='';let savedSection='saved';
  let front=window.location.hash||'#general';if(!/^#(?:latest|general|search|saved|you|story-[a-z0-9-]+)$/.test(front))front='#general';
  if(front.startsWith('#story-'))front='#general';
  const stories=new Map<string,AnyStory>([...general,...state.generalRemote,...demo,...Object.values(state.saved)].map(s=>[s.id,s]));
  const currentDate=()=>Date.now();const DAY=86400000;
  const esc=(s:any)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const isSafe=(url:string)=>{try{return new URL(url).protocol==='https:'}catch{return false}};
  const safeId=(value:string)=>/^[a-z0-9-]+$/.test(value)?value:'';
  const persist=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{ /* Memory remains for the session. */ }};
  const hash=(s:string)=>{window.location.hash=s;};
  const d=(s:string)=>{const n=Date.parse(s||'');return Number.isFinite(n)?n:0};
  const date=(s:string)=>d(s)?new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date unknown';
  const age=(s:string)=>{let ms=currentDate()-d(s);if(ms<3600000)return 'Just published';if(ms<DAY)return Math.round(ms/3600000)+'h ago';return Math.floor(ms/DAY)+'d ago'};
  const size=(s:string)=>Math.ceil(String(s||'').trim().split(/\s+/).length/210)||1;
  const slugNum=(key:string)=>{let v=2166136261;for(let i=0;i<key.length;i++)v=Math.imul(v^key.charCodeAt(i),16777619)>>>0;return v/4294967296};
  function rankGeneral(input:AnyStory[],visit:number,last:string[]):AnyStory[]{
    // Editorial ranking, not interest or engagement ranking. Read items go last.
    const recent=new Set(last);const tiers=[input.filter(s=>!state.read[s.id]&&!recent.has(s.id)),input.filter(s=>!state.read[s.id]&&recent.has(s.id)),input.filter(s=>!!state.read[s.id])];
    const ordered=tiers.flatMap(t=>t.sort((a,b)=>b.worth+.6*slugNum(b.id+':'+visit)-(a.worth+.6*slugNum(a.id+':'+visit))));
    return ordered.slice(0,25).sort((a,b)=>(state.read[a.id]&&state.read[b.id])?state.read[a.id]-state.read[b.id]:Number(Boolean(state.read[a.id]))-Number(Boolean(state.read[b.id])));
  }
  function fresh(s:AnyStory){const ms=currentDate()-d(s.publishedAt);return s.kind==='latest'&&ms>=0&&ms<=7*DAY&&isSafe(s.source?.url)}
  function rankLatest(all:AnyStory[]):AnyStory[]{
    return [...new Map(all.filter(fresh).map(s=>[s.id,s])).values()]
      .filter(s=>!state.hidden[s.id]&&!state.known[s.id])
      .sort((a,b)=>{
        if(Boolean(state.read[a.id])!==Boolean(state.read[b.id]))return state.read[a.id]?1:-1;
        if(state.read[a.id]&&state.read[b.id])return state.read[a.id]-state.read[b.id];
        const score=(s:AnyStory)=>.55*((s.worth-1)/4)+.25*(1-(currentDate()-d(s.publishedAt))/(7*DAY))+.1*(Math.min(2,s.corroboration||s.alsoReportedBy?.length||0)/2)+.05*(s.source?.quality||.65)+.05*(state.read[s.id]?0:state.viewed[s.id]?.5:1);
        return score(b)-score(a);
      }).slice(0,25);
  }
  const HOUR=3600000;
  // We re-evaluate on every app open, but don't churn an unchanged feed arbitrarily.
  // General needs time to collect variety; Latest is refreshed from real sources separately.
  function replaceTarget(ageMs:number):number {
    if(ageMs<HOUR)return 0;
    if(ageMs<6*HOUR)return 5;
    if(ageMs<24*HOUR)return 12;
    return 25;
  }
  function availableGeneral():AnyStory[]{
    return [...new Map([...general,...state.generalRemote].map(s=>[s.id,s])).values()]
      .filter(s=>s.kind==='general'&&!state.hidden[s.id]&&!state.known[s.id]);
  }
  const readLast=(items:AnyStory[])=>[...items].sort((a,b)=>{
    const aRead=state.read[a.id]||0,bRead=state.read[b.id]||0;
    if(Boolean(aRead)!==Boolean(bRead))return aRead?1:-1;
    return aRead&&bRead?aRead-bRead:0;
  });
  function replenishGeneral():void{
    // While switching sections or marking a story known/hidden, preserve every
    // eligible card. Only fill vacancies; do not start another visit.
    const candidates=availableGeneral();const byId=new Map(candidates.map(s=>[s.id,s]));
    const kept=state.generalSelection.map(key=>byId.get(key)).filter(Boolean);
    const keepIds=new Set(kept.map(s=>s.id));
    const additional=rankGeneral(candidates.filter(s=>!keepIds.has(s.id)),state.visits,state.generalSelection);
    generalMix=readLast([...kept,...additional].slice(0,25));
    state.generalSelection=generalMix.map(s=>s.id);
    persist();
  }
  function refreshGeneralOnOpen(now=Date.now(),force=false):void{
    const candidates=availableGeneral();const byId=new Map(candidates.map(s=>[s.id,s]));
    const before=state.generalSelection.map(key=>byId.get(key)).filter(Boolean);
    const since=state.generalMixAt?Math.max(0,now-state.generalMixAt):Infinity;
    const replacement=!before.length?25:force?25:replaceTarget(since);
    if(replacement===0){
      replenishGeneral();mixChanged=0;return;
    }
    const keepCount=Math.max(0,25-replacement);
    // Keep higher-worth unread cards first, then read ones; no interest scores.
    const kept=[...before].sort((a,b)=>{
      const aRead=Number(Boolean(state.read[a.id])),bRead=Number(Boolean(state.read[b.id]));
      return aRead-bRead || b.worth-a.worth || slugNum(b.id+':'+state.visits)-slugNum(a.id+':'+state.visits);
    }).slice(0,keepCount);
    const keepIds=new Set(kept.map(s=>s.id));
    const freshCandidates=candidates.filter(s=>!keepIds.has(s.id)&&!before.some(x=>x.id===s.id));
    const newItems=rankGeneral(freshCandidates,state.visits,before.map(s=>s.id));
    let combined=[...kept,...newItems.slice(0,replacement)];
    if(combined.length<25){const used=new Set(combined.map(s=>s.id));
      const extra=rankGeneral(candidates.filter(s=>!used.has(s.id)),state.visits,before.map(s=>s.id));
      combined=[...combined,...extra.slice(0,25-combined.length)];
    }
    // Editor-worth order for a changed list; preserving the exact list and order
    // is more important when no changes are warranted.
    const editorial=(s:AnyStory)=>s.worth+.6*slugNum(s.id+':'+state.visits);
    generalMix=readLast(combined.sort((a,b)=>editorial(b)-editorial(a)).slice(0,25));
    state.lastGeneral=before.map(s=>s.id);
    state.generalSelection=generalMix.map(s=>s.id);
    state.generalMixAt=now;
    mixChanged=generalMix.filter(s=>!before.some(x=>x.id===s.id)).length;
    persist();
  }
  document.body.dataset.theme=state.theme;
  const loadedHtml=id('static-edition');const runtime=id('dynamic-app');
  if(loadedHtml)loadedHtml.hidden=true;if(runtime)runtime.hidden=false;
  document.body.classList.add('enhanced');
  function artwork(s:AnyStory){const char=({'World affairs':'◉','Business':'↗','Science':'✺','Space':'☾','Health':'✚','Technology':'⌘','Gaming':'◇','History':'⌛','Geography':'◎','Travel':'✧','Culture':'✦','Myth & religion':'❂','Language':'〰','Film & TV':'▣','Music':'♫','Fashion & beauty':'✳','Trends':'➶','Art & design':'⬡','Mind & philosophy':'◈','Nature & climate':'❀','Sports':'◒','Food & drink':'◐','Curiosities':'✴'} as any)[s.category]||'✳';
    return `<div class="art art-${esc(s.category.toLowerCase().replace(/[^a-z]+/g,'-'))}" role="img" aria-label="Decorative artwork representing ${esc(s.category)}"><span class="art-orb"></span><span class="art-line"></span><span class="art-glyph">${char}</span><span class="art-corner">ELSEWHERE / ${esc(s.category).toUpperCase()}</span></div>`;}
  function storyCard(s:AnyStory,index:number){
    const isLatest=s.kind==='latest';const stamp=isLatest?date(s.publishedAt):'Timeless knowledge';const read=Boolean(state.read[s.id]);const saved=Boolean(state.saved[s.id]);
    const sourceCount=isLatest?new Set([s.source?.name,...(s.alsoReportedBy||[]).map((x:AnyStory)=>x.name)]).size:1;
    const shortLabel=isLatest?`${esc(sourceCount>1?sourceCount+' reporting sources':s.source.name)} · ${esc(stamp)}`:esc(s.source.name);
    return `<article class="discovery-card ${read?'was-read':''}" data-story="${esc(s.id)}">
      ${artwork(s)}
      <div class="card-inside"><div class="eyebrow"><span>${esc(s.category)}</span><span>${isLatest?esc(age(s.publishedAt)):'GENERAL'}</span></div>
      <h2 class="headline"><a class="stretched" href="#story-${esc(s.id)}">${esc(s.title)}</a></h2>
      <p class="card-description">${esc(s.summary)}</p>
      <div class="why-read"><span class="pin">✳</span><span>${esc(s.whyRead)}</span></div>
      <div class="card-footer"><div><span class="source-name">${shortLabel}</span><span class="card-time">${esc(String(s.readingMinutes||size(s.summary)))} min read · ${esc(s.provenance)}</span></div>
      <div class="card-actions"><button class="save-button ${saved?'active':''}" data-save="${esc(s.id)}" aria-pressed="${saved}" aria-label="${saved?'Unsave':'Save'} ${esc(s.title)}">${saved?'♥':'♡'}</button></div></div>
      <div class="cue">${read?'Read again':'Read more'} <span>↗</span></div>
      </div></article>`;
  }
  function hero(kind:string){const latestTab=kind==='latest';return `<section class="section-intro"><div class="kicker">${latestTab?'01 / THE PRESENT':'02 / THE UNEXPECTED'}</div><h1>${latestTab?'The world, <em>right now.</em>':'Meet what you <em>didn’t know.</em>'}</h1><p>${latestTab?'25 significant developments, from anywhere and about anything.':'25 discoveries worth knowing. Checked on each open; refreshed when it makes sense.'}</p></section>`;}
  const skeleton=`<div class="fetching" role="status"><div class="spinner"></div><strong>Fetching the latest verified stories…</strong><span>Checking dates, sources, and context</span></div><div class="skeleton"></div><div class="skeleton"></div>`;
  function recencyStatus(){
    const ts=state.latestFetchedAt?date(state.latestFetchedAt):'never';
    const msg=status==='live'?'Up to date':status==='cached'?'Cached copy':status==='demo'?'Demo copy — not live, will age':status==='loading'?'Checking sources':'Sources unavailable';
    return `<div class="feed-status ${status}"><span class="status-dot"></span><strong>${msg}</strong>${status==='live'||status==='cached'?`<small>Last checked ${esc(ts)}</small>`:''}${status==='live'&&latestChanged>0?`<small>${latestChanged} new since your previous feed</small>`:''}${errorText?`<small>${esc(errorText)}</small>`:''}</div>`;
  }
  function latestView(){
    const fromCache=status==='cached'||status==='offline',pool=status==='demo'?demo:fromCache?state.latestCache:latest;
    const stablePool=latestSelection.length&&status!=='demo'?pool.filter(s=>latestSelection.includes(s.id)):pool;
    const items=rankLatest(stablePool);
    const old=[...state.latestCache].filter(s=>s.kind==='latest'&&d(s.publishedAt)>0&&isSafe(s.source.url));
    let cards='';
    if(status==='loading')cards=skeleton;
    else if(items.length)cards=`<div class="cards">${items.map(storyCard).join('')}</div>`;
    else cards=`<div class="empty-block"><span class="huge">◷</span><h2>No recent stories available</h2><p>Elsewhere will not pretend old articles are fresh. The source connection may be unavailable, or its recent reports may be too short to summarize safely.</p><div class="empty-actions"><button class="pill" data-refresh="true">Try again</button>${old.length?'<button class="pill secondary" data-older="true">Show older cached stories (dated)</button>':''}<button class="pill secondary" data-demo="true">View demo snapshot</button></div></div>`;
    if(allowOlder&&!items.length&&old.length)cards=`<div class="warning-banner">Older cached stories: publication dates are shown. This is not a fresh news feed.</div><div class="cards">${old.slice(0,25).map(storyCard).join('')}</div>`;
    return hero('latest')+recencyStatus()+cards;
  }
  function generalView(){const items=generalMix.filter(s=>!state.hidden[s.id]&&!state.known[s.id]);return hero('general')+
    `<div class="general-topline"><span>${items.length} discoveries · ${mixChanged?mixChanged+' new since last refresh':'list checked, no reshuffle needed'}</span><button class="subtle-button" data-mix="true">↻ New mix</button></div><div class="cards">${items.map(storyCard).join('')}</div>`;}
  function detailView(s:AnyStory){const read=!!state.read[s.id],saved=!!state.saved[s.id];const facts=(s.relatedFacts||[]).slice(0,3),related=(s.relatedIds||[]).map((x:string)=>stories.get(x)).filter((x:AnyStory)=>x&&!state.hidden[x.id]&&!state.known[x.id]).slice(0,4);
    return `<article class="story-page"><div class="story-toolrow"><button class="iconbutton back-action" data-back="true" aria-label="Back">←</button><div class="rightbuttons"><button class="iconbutton" data-share="${esc(s.id)}" aria-label="Share story">↗</button><button class="iconbutton ${saved?'active':''}" data-save="${esc(s.id)}" aria-pressed="${saved}" aria-label="${saved?'Unsave':'Save'} story">${saved?'♥':'♡'}</button></div></div>
      <div class="story-top"><span class="category-pill">${esc(s.category)}</span><span class="story-worth">Worth ${esc(s.worth)} / 5</span></div>
      <h1 class="story-title">${esc(s.title)}</h1><p class="story-lede">${esc(s.summary)}</p>
      <div class="story-byline">${s.kind==='latest'&&s.sourceNotes?.length>1?`${esc(s.sourceNotes.length)} publisher reports · `:''}${esc(s.source.name)} ${s.publishedAt?'· '+date(s.publishedAt):''} · ${esc(s.provenance)}</div>
      ${artwork(s)}
      <section class="editorial-section"><h2>Background & context</h2>${paragraphs(s.background)}</section>
      <section class="editorial-section"><h2>Why it matters</h2>${paragraphs(s.whyItMatters)}</section>
      ${s.kind==='latest'&&s.sourceNotes?.length>1?`<section class="editorial-section"><h2>What else was reported</h2><p>These accounts were grouped as the same event. Additional claims remain attributed to their publishers rather than being presented as independently verified.</p>${s.sourceNotes.slice(1).map((note:AnyStory)=>`<div class="reporting-note"><strong>${esc(note.name)}</strong><p>${esc(note.summary)}</p></div>`).join('')}</section>`:''}
      ${s.kind==='latest'&&state.read[s.id]&&s.updatedAt&&d(s.updatedAt)>state.read[s.id]?`<div class="update-indicator" role="status">Updated since you read this story</div>`:''}
      ${facts.length?`<section class="editorial-section"><h2>Related facts</h2><ul>${facts.map((f:string)=>`<li>${esc(f)}</li>`).join('')}</ul></section>`:''}
      ${s.kind==='latest'&&!facts.length?`<p class="supported-limit">That's everything the cited reporting supports so far.</p>`:''}
      <section class="editorial-section"><h2>Confidence & provenance</h2><p>${esc(s.uncertainty||'Read the original reporting for context.')}</p><p class="provenance">Source type: ${esc(s.provenance)}. ${s.kind==='latest'?'In-app explanation uses available publisher text, not independent fact verification. Extractive briefs are selected passages; AI synthesis is labelled when enabled.':'Reference-based explanation; check original references.'}</p></section>
      <section class="editorial-section feedback"><h2>How was this?</h2><div class="feedback-row"><button class="pill ${state.interesting[s.id]?'selected':''}" data-feedback="interesting" data-fid="${esc(s.id)}">✳ Interesting</button><button class="pill" data-feedback="known" data-fid="${esc(s.id)}">✓ Knew this</button><button class="pill" data-feedback="hidden" data-fid="${esc(s.id)}">− Not interested</button></div><p class="small">Feedback records your reaction; Interesting does not change recommendations.</p></section>
      ${related.length?`<section class="editorial-section"><h2>Related discoveries</h2><div class="related-list">${related.map((r:AnyStory)=>`<a href="#story-${esc(r.id)}">${esc(r.title)} <span>↗</span></a>`).join('')}</div></section>`:''}
      <section class="editorial-section"><h2>Original reporting</h2><a class="source-cta" href="${esc(s.source.url)}" target="_blank" rel="noopener noreferrer">Read at ${esc(s.source.name)} <span>↗</span></a>${(s.alsoReportedBy||[]).length?`<p>Also reported by</p>${s.alsoReportedBy.map((x:any)=>`<p><a target="_blank" rel="noopener noreferrer" href="${esc(x.url)}">${esc(x.name)} ↗</a></p>`).join('')}`:''}</section>
      <div class="story-bottom"><button class="pill" data-back="true">← Back</button><button class="pill primary" data-next="true">Next discovery →</button></div>
      </article>`;
  }
  function paragraphs(s:any){return String(s||'').split(/\n\n+/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}
  function findStory(sid:string){return stories.get(sid)||state.saved[sid]}
  function showOverlay(name:string){const common=`<div class="overlay-heading"><button class="iconbutton" data-back="true" aria-label="Close">←</button><h1>${name==='search'?'Search':name==='saved'?'Your library':'You'}</h1></div>`;
    if(name==='search'){
      const found=[...stories.values()].filter((s:AnyStory)=>!state.hidden[s.id]&&!state.known[s.id]&&[s.title,s.category,s.summary].join(' ').toLowerCase().includes(searchQuery.toLowerCase())).slice(0,40);
      return common+`<div class="search-line"><span>⌕</span><input id="search-input" type="search" placeholder="A subject you didn't know existed..." aria-label="Search stories" value="${esc(searchQuery)}" autofocus></div><div class="search-results">${searchQuery?found.map((s:AnyStory)=>`<a href="#story-${esc(s.id)}"><small>${esc(s.category)}</small>${esc(s.title)} <span>↗</span></a>`).join('')||'<p>No matching discoveries found.</p>':'<p>Search 175 curated discoveries and the recent feed.</p>'}</div>`;
    }
    if(name==='saved'){
      const tabs=[['saved','Saved'],['history','History'],['known','Known'],['hidden','Hidden']];
      const entries=savedSection==='saved'?Object.values(state.saved):savedSection==='history'?Object.keys(state.read).sort((a,b)=>state.read[b]-state.read[a]).map(findStory):Object.keys(savedSection==='known'?state.known:state.hidden).map(findStory);
      return common+`<div class="mini-tabs">${tabs.map(([k,v])=>`<button class="${savedSection===k?'active':''}" data-library="${k}">${v}</button>`).join('')}</div><div class="search-results">${entries.filter(Boolean).map((s:AnyStory)=>`<div class="library-row"><a href="#story-${esc(s.id)}"><small>${esc(s.category)}</small>${esc(s.title)} ↗</a>${savedSection==='known'||savedSection==='hidden'?`<button data-restore="${esc(s.id)}">Undo</button>`:''}</div>`).join('')||'<p>Nothing here yet.</p>'}</div>`;
    }
    return common+`<div class="settings-list"><h2>Elsewhere is for discovery, not profiling.</h2><p>No interest selection, tracking-based personalization or category quotas. Everybody gets the same editorial order; your read history only moves completed stories lower.</p><label class="setting"><span>Light theme</span><input type="checkbox" id="theme-toggle" ${state.theme==='light'?'checked':''}></label><div class="setting"><span>Stories read</span><strong>${Object.keys(state.read).length}</strong></div><div class="setting"><span>Stories saved</span><strong>${Object.keys(state.saved).length}</strong></div><div class="setting"><span>Visit count</span><strong>${state.visits}</strong></div><button class="pill danger" data-clear="true">Clear local history and bookmarks</button><p class="small">Read history and saves stay on this device. No cloud account sync in this edition.</p></div>`;
  }
  function toast(message:string,action?:{label:string;fn:()=>void}){const holder=id('toast')!;holder.innerHTML=`<span>${esc(message)}</span>${action?`<button id="toast-undo">${esc(action.label)}</button>`:''}`;holder.hidden=false;if(action)id('toast-undo')?.addEventListener('click',()=>{action.fn();holder.hidden=true});clearTimeout((toast as any).timer);(toast as any).timer=setTimeout(()=>holder.hidden=true,6000)}
  let lastRoute='';let previousRoute='#general';
  function render(){const target=id('view')!;const route=window.location.hash||'#general';
    if(lastRoute!==route){if(lastRoute==='#latest'||lastRoute==='#general')sectionScroll[lastRoute.slice(1)]=window.scrollY;lastRoute=route;}
    const storyRoute=route.match(/^#story-([a-z0-9-]+)$/);const overlay=route.slice(1);
    if(storyRoute){const s=findStory(storyRoute[1]);if(!s){target.innerHTML='<p>Story not found.</p><a href="#general">Back to General</a>';return}
      if(!state.read[s.id]){state.read[s.id]=Date.now();state.seen[s.id]=Date.now();persist()}state.viewed[s.id]=Date.now();persist();
      target.innerHTML=detailView(s);id('bottom-nav')!.hidden=true;window.scrollTo(0,0);
    }else if(['search','saved','you'].includes(overlay)){
      target.innerHTML=showOverlay(overlay);id('bottom-nav')!.hidden=true;window.scrollTo(0,0);
      if(overlay==='search')setTimeout(()=>id('search-input')?.focus(),10);
    }else{const section=overlay==='latest'?'latest':'general';target.innerHTML=section==='latest'?latestView():generalView();id('bottom-nav')!.hidden=false;
      queryAll('.bottom-tab').forEach(el=>{const selected=el.getAttribute('href')==='#'+section;el.classList.toggle('selected',selected);el.setAttribute('aria-current',selected?'page':'false')});
      window.scrollTo(0,sectionScroll[section]||0);
    }
    queryAll('.top-action').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===route));
  }
  function nextStory(){const route=location.hash||'#general';const s=findStory(route.replace('#story-',''));
    const arr=s?.kind==='latest'?rankLatest((latest.length?latest:state.latestCache).filter(s=>!latestSelection.length||latestSelection.includes(s.id))):generalMix;
    const i=arr.findIndex((v:AnyStory)=>v.id===s?.id);const next=arr[(i+1)%arr.length];if(next)hash('#story-'+next.id);else hash('#general');
  }
  const goBack=()=>{if(window.history.length>1)window.history.back();else hash(previousRoute.startsWith('#story-')?'#general':previousRoute)};
  window.addEventListener('hashchange',()=>{const route=location.hash;if((lastRoute==='#latest'||lastRoute==='#general')&&route.startsWith('#story-'))previousRoute=lastRoute;render();});
  document.addEventListener('click',e=>{const el=e.target as Element;if(!el.closest)return;
    const save=el.closest('[data-save]') as HTMLElement|null;if(save){e.preventDefault();e.stopPropagation();const key=save.dataset.save!,s=findStory(key);if(state.saved[key])delete state.saved[key];else if(s)state.saved[key]=JSON.parse(JSON.stringify(s));persist();render();return}
    const back=el.closest('[data-back]');if(back){e.preventDefault();goBack();return}
    const next=el.closest('[data-next]');if(next){e.preventDefault();nextStory();return}
    const mix=el.closest('[data-mix]');if(mix){e.preventDefault();state.visits+=1;refreshGeneralOnOpen(Date.now(),true);sectionScroll.general=0;render();window.scrollTo(0,0);return}
    const refresh=el.closest('[data-refresh]');if(refresh){e.preventDefault();void fetchLatest(true);return}
    const older=el.closest('[data-older]');if(older){e.preventDefault();allowOlder=true;render();return}
    const tryDemo=el.closest('[data-demo]');if(tryDemo){e.preventDefault();status='demo';render();return}
    const share=el.closest('[data-share]') as HTMLElement|null;if(share){e.preventDefault();const s=findStory(share.dataset.share!);if(!s)return;const url=location.origin+location.pathname+'#story-'+s.id;if((navigator as any).share){(navigator as any).share({title:s.title,text:s.summary,url}).catch(()=>{})}else if(navigator.clipboard?.writeText){navigator.clipboard.writeText(url).then(()=>toast('Story link copied')).catch(()=>toast(url))}else toast(url);return}
    const feedback=el.closest('[data-feedback]') as HTMLElement|null;if(feedback){e.preventDefault();const key=feedback.dataset.fid!,type=feedback.dataset.feedback!;if(type==='interesting'){state.interesting[key]=Date.now();persist();toast('Marked interesting');render();return}
      const was=type==='known'?state.known[key]:state.hidden[key];if(type==='known')state.known[key]=Date.now();else state.hidden[key]=Date.now();persist();replenishGeneral();hash(previousRoute);toast(type==='known'?'Moved to Known':'Story hidden',{label:'Undo',fn:()=>{if(type==='known'){if(was)state.known[key]=was;else delete state.known[key]}else{if(was)state.hidden[key]=was;else delete state.hidden[key]}persist();replenishGeneral();render();}});return}
    const mini=el.closest('[data-library]') as HTMLElement|null;if(mini){e.preventDefault();savedSection=mini.dataset.library!;render();return}
    const undo=el.closest('[data-restore]') as HTMLElement|null;if(undo){e.preventDefault();const key=undo.dataset.restore!;delete state.known[key];delete state.hidden[key];persist();replenishGeneral();render();return}
    const clear=el.closest('[data-clear]');if(clear){e.preventDefault();if(!confirm('Clear bookmarks, reading history, and feedback from this device?'))return;for(const k of ['read','viewed','saved','hidden','known','interesting','seen'] as const)(state as any)[k]={};persist();replenishGeneral();render();return}
  });
  document.addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='search-input'){const start=t.selectionStart;searchQuery=t.value;render();const field=id('search-input') as HTMLInputElement;field?.focus();field?.setSelectionRange(start,start)}if(t.id==='theme-toggle'){state.theme=t.checked?'light':'dark';document.body.dataset.theme=state.theme;persist()}});
  window.addEventListener('storage',e=>{if(e.key===STORAGE){try{const newState=JSON.parse(e.newValue||'{}');Object.assign(state,newState);document.body.dataset.theme=state.theme;replenishGeneral();render()}catch{}}});
  function validPayload(payload:any){return payload&&Array.isArray(payload.stories)}
  let fetchingLatest=false;let retryLatest:ReturnType<typeof setTimeout>|null=null;
  async function fetchLatest(force=false){
    if(fetchingLatest)return;fetchingLatest=true;
    if(!force&&status==='loading'){render()}const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),13000);
    try{
      const resp=await fetch('/api/latest',{cache:'no-store',signal:ctrl.signal});if(!resp.ok)throw Error('HTTP '+resp.status);
      const payload=await resp.json();if(!validPayload(payload))throw Error('Invalid API response');
      const items=payload.stories.filter(fresh);if(items.length){
        const previous=new Set(rankLatest(state.latestCache).map((s:any)=>s.id));
        latestChanged=previous.size?rankLatest(items).filter((s:any)=>!previous.has(s.id)).length:0;
        latest=items;latestSelection=rankLatest(items).map((s:any)=>s.id);for(const s of items)stories.set(s.id,s);state.latestCache=items;state.latestFetchedAt=payload.generatedAt||new Date().toISOString();persist();status=payload.stale?'cached':'live';errorText=payload.stale?'The source snapshot is older than six hours.':''}
      else if(state.latestCache.some(fresh)){if(!latestSelection.length)latestSelection=rankLatest(state.latestCache).map((s:any)=>s.id);status='cached';errorText='No new publisher articles; showing your last successful fetch.'}
      else{status='offline';errorText='No qualifying recent source reports.';
        // A sleeping free-tier server can reply before its scheduler finishes the first ingestion.
        if(!retryLatest&&location.protocol!=='file:')retryLatest=setTimeout(()=>{retryLatest=null;void fetchLatest()},12000);
      }
    }catch(e){status=state.latestCache.some(fresh)?'cached':'offline';errorText='Content API unavailable: '+String((e as Error).message||e).slice(0,100);for(const s of state.latestCache)stories.set(s.id,s)}
    finally{clearTimeout(timer);fetchingLatest=false;render()}
  }
  let fetchingGeneral=false;
  async function fetchGeneralDiscoveries(){
    if(location.protocol==='file:'||fetchingGeneral)return;fetchingGeneral=true;
    try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
      let res:Response;try{res=await fetch('/api/general/discoveries',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timer)}
      if(!res.ok)return;const payload=await res.json();if(!Array.isArray(payload.stories))return;
      const verified=payload.stories.filter((s:AnyStory)=>s?.kind==='general'&&safeId(s.id)&&s.title&&s.summary&&isSafe(s.source?.url));
      // Retain previously sourced knowledge for offline reading; cap the remote pool.
      const merged=new Map([...state.generalRemote,...verified].map((s:AnyStory)=>[s.id,s]));
      state.generalRemote=[...merged.values()].slice(-90);for(const s of state.generalRemote)stories.set(s.id,s);
      persist();replenishGeneral();if((location.hash||'#general')==='#general')render();
    }catch{ /* General's bundled offline collection remains available. */ }finally{fetchingGeneral=false}
  }
  let lastActivation=0;
  function onAppOpen(){
    const now=Date.now();if(now-lastActivation<3000)return;lastActivation=now;
    state.visits+=1;state.lastOpenedAt=now;refreshGeneralOnOpen(now);persist();render();
    if(location.protocol==='file:')return;
    void fetchLatest();void fetchGeneralDiscoveries();
  }
  window.addEventListener('online',()=>{void fetchLatest();void fetchGeneralDiscoveries()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)onAppOpen()});
  window.addEventListener('pageshow',e=>{if(e.persisted)onAppOpen()});
  window.addEventListener('focus',()=>{if(!document.hidden)onAppOpen()});
  setInterval(()=>{if(!document.hidden)void fetchLatest()},10*60*1000);
  if(location.protocol==='file:'){status='demo';for(const s of demo)stories.set(s.id,s);errorText='Standalone demo: content is dated and cannot refresh.';}
  onAppOpen();
  try{if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{})}catch{}
})();
} catch (err) {
  console.error('Elsewhere interactive edition failed; restoring the static reading edition',err);
  const staticEdition=document.getElementById('static-edition');
  const dynamic=document.getElementById('dynamic-app');
  if(staticEdition)staticEdition.hidden=false;
  if(dynamic)dynamic.hidden=true;
  document.body.classList.remove('enhanced');
}
