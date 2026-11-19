"""Browser interaction suite using Playwright's inline-document harness.
The sandbox blocks ordinary navigation, so this checks real DOM/touch events, not hosted HTTP or Service Worker registration.
"""
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
import json,traceback
HERE=Path(__file__).resolve().parent.parent
HTML=(HERE/'Elsewhere_standalone_demo.html').read_text()
NOW=datetime.now(timezone.utc).isoformat()
DATA=[dict(id='latest-test-'+str(i),kind='latest',category='Science',title=f'Discovery{i} Result{i} Event{i}',summary=('A carefully sourced publisher report explains a current development with adequate detail. ')*6,
 source=dict(name='Test publisher '+str(i),url='https://test.example.com/articles/report-'+str(i),quality=.9),publishedAt=NOW,
 background='Article summary from publisher feed.',whyItMatters='The development has implications worth knowing.',whyRead='Source-backed current story.',
 relatedFacts=[],relatedIds=[],alsoReportedBy=[],uncertainty='One publisher; not independently verified.',provenance='publisher excerpt',readingMinutes=1,worth=4) for i in range(26)]

def page_html(mode='ok',stored=None):
 data=json.dumps(dict(generatedAt=NOW,stale=False,stories=DATA,sources=[],tiers=[]))
 setup=f'''<script>
 window.__testStore={json.dumps(stored or {})};
 Object.defineProperty(window,'localStorage',{{configurable:true,value:{{
  getItem(k){{return window.__testStore[k]??null;}},
  setItem(k,v){{window.__testStore[k]=String(v)}},
  removeItem(k){{delete window.__testStore[k]}}
 }}}});
 window.fetch=async function() {{
  {"return new Promise(resolve => {window.__finishFetch=()=>resolve(new Response("+json.dumps(data)+",{status:200,headers:{'Content-Type':'application/json'}}));});" if mode=='slow' else "return new Response('Bad gateway',{status:502});" if mode=='failure' else "return new Response("+json.dumps(data)+",{status:200,headers:{'Content-Type':'application/json'}});"}
 }};
 </script>'''
 return HTML.replace('<script>/* Elsewhere',setup+'<script>/* Elsewhere',1)

def chk(x,msg):
 if not x:raise AssertionError(msg)

all_errors=[];passed=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 def make(mobile=False,mode='ok',js=True,stored=None):
  ctx=browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile,java_script_enabled=js)
  page=ctx.new_page();page.set_default_timeout(4500);page.on('pageerror',lambda e:all_errors.append('JS '+str(e)))
  page.set_content(page_html(mode,stored),wait_until='load')
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
   chk(page.locator('a.source-link').first.get_attribute('target')=='_blank','source must target new tab')
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
 browser.close()
print('PASS:',passed)
print('FAILED:',all_errors)
if all_errors:raise SystemExit(1)
