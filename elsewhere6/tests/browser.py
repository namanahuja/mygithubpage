"""Browser interaction suite using Playwright's inline-document harness.
The sandbox blocks ordinary navigation, so this checks real DOM/touch events, not hosted HTTP or Service Worker registration.
"""
from pathlib import Path
from datetime import datetime,timezone,timedelta
from playwright.sync_api import sync_playwright
import json,traceback
HERE=Path(__file__).resolve().parent.parent
HTML=(HERE/'Elsewhere_standalone_demo.html').read_text()
NOW=datetime.now(timezone.utc).isoformat()
DATA=[dict(id='latest-test-'+str(i),kind='latest',category='Science',title=f'Discovery{i} Result{i} Event{i}',summary=('A carefully sourced publisher report explains a current development with adequate detail. ')*6,
 source=dict(name='Test publisher '+str(i),url='https://test.example.com/articles/report-'+str(i),quality=.9),publishedAt=NOW,
 background='Article summary from publisher feed.',whyItMatters='The development has implications worth knowing.',whyRead='Source-backed current story.',
 relatedFacts=[],relatedIds=[],alsoReportedBy=[],uncertainty='One publisher; not independently verified.',provenance='publisher excerpt',readingMinutes=1,worth=4) for i in range(26)]
# One realistic consolidated event for in-app reader and source-list UI checks.
DATA[0]['sourceNotes']=[
 {'name':'Test publisher 0','url':DATA[0]['source']['url'],'summary':DATA[0]['summary']},
 {'name':'Independent desk','url':'https://independent-news.test/articles/event-0','summary':'A second named outlet independently covers the same development and adds source-attributed details.'}
]
DATA[0]['alsoReportedBy']=[dict(name='Independent desk',url='https://independent-news.test/articles/event-0',quality=.8)]
DATA[0]['eventMembers']=['latest-test-0','independent-coverage-0']
DATA[0]['provenance']='article-derived extract'

def page_html(mode='ok',stored=None,offset_hours=0):
 data=json.dumps(dict(generatedAt=NOW,stale=False,stories=DATA,sources=[],tiers=[]))
 setup=f'''<script>
 window.__testStore={json.dumps(stored or {})};
 window.__apiPayload={data};
 window.__fakeNow={int(datetime.fromisoformat(NOW).timestamp()*1000)} + {int(offset_hours*3600000)};
 Date.now=()=>window.__fakeNow;
 window.__latestFetchCount=0;
 window.__generalFetchCount=0;
 Object.defineProperty(window,'localStorage',{{configurable:true,value:{{
  getItem(k){{return window.__testStore[k]??null;}},
  setItem(k,v){{window.__testStore[k]=String(v)}},
  removeItem(k){{delete window.__testStore[k]}}
 }}}});
 window.fetch=async function(url) {{
  if(String(url).includes('/api/general/discoveries')){{window.__generalFetchCount++;return new Response(JSON.stringify({{stories:[],generatedAt:new Date().toISOString()}}),{{status:200}})}}
  window.__latestFetchCount++;
  {"return new Promise(resolve => {window.__finishFetch=()=>resolve(new Response(JSON.stringify(window.__apiPayload),{status:200,headers:{'Content-Type':'application/json'}}));});" if mode=='slow' else "return new Response('Bad gateway',{status:502});" if mode=='failure' else "return new Response(JSON.stringify(window.__apiPayload),{status:200,headers:{'Content-Type':'application/json'}});"}
 }};
 </script>'''
 return HTML.replace('<script>/* Elsewhere',setup+'<script>/* Elsewhere',1)

def chk(x,msg):
 if not x:raise AssertionError(msg)

all_errors=[];passed=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def make(mobile=False,mode='ok',js=True,stored=None,offset_hours=0,landing='general'):
  ctx=browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,java_script_enabled=js)
  page=ctx.new_page();page.set_default_timeout(4500);page.on('pageerror',lambda e:all_errors.append('JS '+str(e)))
  page.set_content(page_html(mode,stored,offset_hours),wait_until='load')
  if landing=='general' and js:page.evaluate('location.hash="\#general"'.replace('\#','#'))
  return ctx,page
 for mobile in (False,True):
  name='mobile touch' if mobile else 'desktop'
  try:
   ctx,page=make(mobile)
   page.wait_for_selector('#view .discovery-card',timeout=6000)
   chk(page.locator('#bottom-nav .bottom-tab').count()==2,'not exactly two tabs')
   chk(page.locator('#view .discovery-card').count()==25,'not 25 General cards')
   chk(page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'horizontal overflow')
   chk(page.locator('[data-interest]').count()==0,'unexpected interest onboarding')
   # Mobile/desktop clickable headline
   first=page.locator('#view .discovery-card .headline a').first
   headline=first.inner_text()
   first.tap() if mobile else first.click()
   page.wait_for_selector('.story-page',timeout=4000)
   chk(page.locator('#view .story-title').inner_text()==headline,'headline tap did not open story')
   page.go_back(wait_until='domcontentloaded');page.wait_for_selector('#view .discovery-card')
   # Stretched-link hit target: image, summary, and empty art space
   for sel in ('.card-description','.art','.card-inside'):
    c=page.locator('#view .discovery-card').first
    target=c.locator(sel)
    sid=c.get_attribute('data-story')
    target.tap(position={'x':18,'y':18},force=True) if mobile else target.click(position={'x':18,'y':18},force=True)
    page.wait_for_selector('.story-page',timeout=4000)
    chk(page.url.endswith('#story-'+sid),'tapping '+sel+' did not open story')
    page.go_back();page.wait_for_selector('#view .discovery-card')
   card=page.locator('#view .discovery-card').first
   card.locator('button.save-button').click()
   chk(not page.url.split('#')[-1].startswith('story-'),'save button navigated')
   store=page.evaluate('window.__testStore')
   chk('elsewhere-state-v6' in store,'save did not persist')
   chk(page.locator('#view .discovery-card a.source-link').count()==0,'source links must not interrupt cards')
   # Reopening with same localStorage snapshot restores bookmarks
   ctx.close();ctx,page=make(mobile,stored=store)
   page.locator('a.top-action[aria-label="Saved and reading history"]').click()
   page.wait_for_selector('.search-results a[href^="#story-"]',timeout=5000)
   chk(page.locator('.search-results a[href^="#story-"]').count()>=1,'saved story did not survive reopening')
   page.locator('a.top-action[aria-label="Search"]').click()
   page.locator('#search-input').fill('Venus')
   chk(page.locator('.search-results a').count()>=1,'search did not find Venus')
   page.evaluate('location.hash="#general"')
   page.locator('a.bottom-tab[href="#latest"]').click()
   page.wait_for_selector('.feed-status.live',timeout=5000)
   chk(page.locator('#view .discovery-card').count()==25,'not 25 Latest cards')
   page.locator('#view .headline a').first.tap() if mobile else page.locator('#view .headline a').first.click()
   page.wait_for_selector('.story-page')
   chk(page.locator('#view .source-cta').count()==1, 'missing original reporting')
   chk(page.locator('#view .source-cta').get_attribute('target')=='_blank','article source must open a new tab')
   chk(page.locator('#view .source-cta').get_attribute('href').startswith('https://'),'article source url')
   chk(page.locator('#view .reporting-note').count()==1,'missing attributed other-outlet reporting')
   chk(page.locator('#view .editorial-section h2').all_inner_texts()[-1]=='Original reporting','source links must come last')
   if mobile:page.screenshot(path=str(HERE/'docs'/'v7-reader.png'),full_page=True)
   page.locator('button.back-action').click()
   page.wait_for_selector('#view .discovery-card')
   chk(page.locator('#view .discovery-card.was-read').count()==1,'read item not dimmed')
   chk(page.locator('#view .discovery-card.was-read').last.get_attribute('data-story')=='latest-test-0','read item not moved to last position')
   page.screenshot(path=str(HERE/'docs'/('mobile.png' if mobile else 'desktop.png')),full_page=False)
   passed.append(name)
  except Exception as e:
   all_errors.append(name+': '+str(e)[:450]);traceback.print_exc(limit=2)
  finally:
   ctx.close()
 try:
  ctx,page=make(mobile=True,js=False)
  chk(page.locator('#static-edition .discovery-card').count()==27,'static edition missing')
  page.locator('#static-edition #general .headline a').first.tap()
  chk(page.locator('.st-detail:target').is_visible(),'no-JS target detail missing')
  page.screenshot(path=str(HERE/'docs'/'nojs.png'));passed.append('no JavaScript')
 except Exception as e:all_errors.append('no-JS: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 try:
  ctx,page=make(mobile=True,mode='failure')
  page.locator('a.bottom-tab[href="#latest"]').click();page.wait_for_selector('.feed-status.offline',timeout=5000)
  chk(page.locator('.empty-block').count()==1,'failure shows no empty state')
  chk(page.locator('#view .discovery-card').count()==0,'failure displays General as Latest')
  passed.append('502 fallback')
 except Exception as e:all_errors.append('502: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 try:
  ctx,page=make(mobile=True,mode='slow')
  page.locator('a.bottom-tab[href="#latest"]').click()
  page.wait_for_selector('.fetching',timeout=2000)
  chk(page.locator('.fetching').count()==1,'slow API missing skeleton')
  page.evaluate('window.__finishFetch()')
  page.wait_for_selector('.feed-status.live',timeout=5000)
  passed.append('slow loading state')
 except Exception as e:all_errors.append('slow: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 # Verify time-aware rotation across separate app openings; all sessions share the same storage.
 try:
  def mix(p):return p.locator('#view .discovery-card').evaluate_all('(cards)=>cards.map(x=>x.dataset.story)')
  def saved_store(p):return json.loads(p.evaluate("window.__testStore['elsewhere-state-v6']"))
  ctx,page=make(mobile=True,offset_hours=0)
  first=mix(page);chk(len(first)==25,'initial General mix not 25')
  original=saved_store(page)
  ctx.close()
  ctx,page=make(mobile=True,stored={'elsewhere-state-v6':json.dumps(original)},offset_hours=0.3)
  unchanged=mix(page)
  chk(first==unchanged,'reopening within one hour must preserve all 25 including order')
  chk(page.evaluate('window.__latestFetchCount')>=1,'Latest not rechecked on app opening')
  chk(page.evaluate('window.__generalFetchCount')>=1,'General discovery API not rechecked on app opening')
  ctx.close()
  # Save state before closing the context (persisted selection is authoritative).
  ctx,page=make(mobile=True,stored={'elsewhere-state-v6':json.dumps(original)},offset_hours=2)
  two=mix(page);chk(len(set(first)-set(two))==5,'after two hours must replace exactly five discoveries')
  store=saved_store(page)
  ctx.close()
  ctx,page=make(mobile=True,stored={'elsewhere-state-v6':json.dumps(store)},offset_hours=10)
  ten=mix(page);chk(len(set(two)-set(ten))==12,'after 8 more hours must replace twelve discoveries')
  store=saved_store(page)
  ctx.close()
  ctx,page=make(mobile=True,stored={'elsewhere-state-v6':json.dumps(store)},offset_hours=35)
  later=mix(page);chk(len(set(ten)-set(later))==25,'after a day must rotate all 25 with an ample pool')
  tab_before=mix(page)
  page.locator('a.bottom-tab[href="#latest"]').click()
  page.locator('a.bottom-tab[href="#general"]').click()
  page.wait_for_selector('.general-topline')
  chk(tab_before==mix(page),'switching tabs changed General mix')
  passed.append('reopen: keep 25, replace 5/12/25, stable tabs')
 except Exception as e:all_errors.append('rotation: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 # Foreground resume re-evaluates selections and requests Latest again.
 try:
  ctx,page=make(mobile=True)
  initial=mix(page);before=page.evaluate('window.__latestFetchCount')
  page.evaluate('window.__fakeNow+=2*3600000; window.dispatchEvent(new Event("focus"))')
  page.wait_for_function('(before)=>window.__latestFetchCount>before',arg=before,timeout=3500)
  new_mix=mix(page)
  chk(len(set(initial)-set(new_mix))==5,'foreground resume did not rotate five discoveries')
  passed.append('foreground resume refresh')
 except Exception as e:all_errors.append('resume: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 # Latest should stay identical when source data is unchanged, but a stronger
 # new report should enter immediately even on a same-hour reopen.
 try:
  ctx,page=make(mobile=True)
  page.locator('a.bottom-tab[href="#latest"]').click();page.wait_for_selector('.feed-status.live')
  first=mix(page);chk(len(first)==25,'initial Latest is not 25')
  firstCalls=page.evaluate('window.__latestFetchCount')
  page.evaluate('window.__fakeNow+=10*60000; window.dispatchEvent(new Event("focus"))')
  page.wait_for_function('(n)=>window.__latestFetchCount>n',arg=firstCalls)
  chk(first==mix(page),'unchanged Latest publisher data unnecessarily changed cards')
  page.evaluate("""const newer={...window.__apiPayload.stories[0],id:'latest-test-breaking',title:'Critical high-worth discovery',worth:5,publishedAt:new Date(Date.now()-1000).toISOString()}; window.__apiPayload.stories=[newer,...window.__apiPayload.stories]; window.__fakeNow+=60*1000; window.dispatchEvent(new Event('focus'));""")
  page.wait_for_function("()=>Boolean(document.querySelector('[data-story=\"latest-test-breaking\"]'))",timeout=5000)
  current=mix(page)
  chk(current[0]=='latest-test-breaking','important new item should rank first')
  chk(len(set(first)&set(current))==24,'one new Latest story should replace one old card')
  passed.append('Latest unchanged-or-new selection')
 except Exception as e:all_errors.append('latest-reselection: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 # New launch starts on Latest, even before an API has returned stories.
 try:
  ctx,page=make(mobile=True,mode='slow',landing='latest')
  chk(page.locator('.bottom-tab[href="#latest"].selected').count()==1,'Latest is not the default tab')
  chk(page.locator('.fetching').count()==1,'Latest should show loading while news arrives')
  page.evaluate('window.__finishFetch()')
  page.wait_for_selector('.feed-status.live')
  passed.append('Latest default at launch')
 except Exception as e:all_errors.append('latest-default: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 # Regression: cached Latest cards must resolve in the reader when the backend fails.
 try:
  store={'elsewhere-state-v6':json.dumps({'latestCache':DATA,'latestFetchedAt':NOW})}
  ctx,page=make(mobile=True,mode='failure',stored=store,landing='latest')
  page.wait_for_selector('.feed-status.cached',timeout=5000)
  chk(page.locator('#view .discovery-card').count()==25,'cached Latest cards missing')
  page.locator('#view .discovery-card .headline a').first.tap()
  page.wait_for_selector('.story-page',timeout=5000)
  chk(page.locator('#view .story-title').count()==1,'cached story failed to resolve')
  chk(page.locator('#view').inner_text().find('Story not found')<0,'cached story reported not found')
  passed.append('cached Latest opens offline')
 except Exception as e:all_errors.append('cached-latest: '+str(e)[:350]);traceback.print_exc(limit=2)
 finally:ctx.close()
 browser.close()
print('PASS:',passed)
print('FAILED:',all_errors)
if all_errors:raise SystemExit(1)
