"""Elsewhere live feed server — Python 3.10+, standard library only."""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
HEADERS = {"User-Agent": "ElsewhereDiscovery/5.0 (+https://github.com/namanahuja/mygithubpage)", "Accept": "application/rss+xml,application/atom+xml,application/xml,*/*"}
FEEDS = [
  ("World","BBC World","https://feeds.bbci.co.uk/news/world/rss.xml",15),
  ("Politics","BBC Politics","https://feeds.bbci.co.uk/news/politics/rss.xml",15),
  ("Science","BBC Science","https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",30),
  ("Technology","BBC Tech","https://feeds.bbci.co.uk/news/technology/rss.xml",30),
  ("Business","BBC Business","https://feeds.bbci.co.uk/news/business/rss.xml",30),
  ("Pop culture","BBC Entertainment","https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",30),
  ("History","Smithsonian History","https://www.smithsonianmag.com/rss/history/",360),
  ("Culture","Smithsonian","https://www.smithsonianmag.com/rss/",60),
  ("Fashion","Vogue","https://www.vogue.com/feed/rss",60),
  ("Fashion","The Guardian Fashion","https://www.theguardian.com/fashion/rss",60),
  ("Pop culture","Variety","https://variety.com/feed/",30),
  ("Trends","Google Trends","https://trends.google.com/trending/rss?geo=US",60),
  ("Sports","BBC Sport","https://feeds.bbci.co.uk/sport/rss.xml",60),
  ("Technology","Ars Technica","https://feeds.arstechnica.com/arstechnica/index",30),
  ("Science","ScienceDaily","https://www.sciencedaily.com/rss/top/science.xml",30),
  ("World","The Guardian World","https://www.theguardian.com/world/rss",15),
]
LOCK = threading.RLock()
DATA = {}
START = time.time()
STRIP = re.compile(r"<[^>]*>")
SPACES = re.compile(r"\s+")

def clean(value, size=420):
    text = SPACES.sub(" ", html.unescape(STRIP.sub(" ", str(value or "")))).strip()
    return text[:size].rsplit(" ",1)[0]+"…" if len(text)>size else text

def get_bytes(url):
    if not url.startswith("https://"):
        raise ValueError("Only HTTPS feeds are supported")
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=9) as reply:
        data=reply.read(1_500_001)
    if len(data)>1_500_000:
        raise ValueError("Feed too large")
    return data

def parse_date(text):
    if not text:
        return None
    try:
        d=email.utils.parsedate_to_datetime(text)
    except (ValueError,TypeError,IndexError):
        try:d=dt.datetime.fromisoformat(str(text).replace("Z","+00:00"))
        except ValueError:return None
    if d.tzinfo is None:
        d=d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)

def child_text(node, *tags):
    for tag in tags:
        item=node.find(tag)
        if item is not None and item.text:
            return item.text.strip()
    return ""

def parse_feed(raw, category, publisher):
    root=ET.fromstring(raw)
    atom=root.tag.endswith("feed")
    nodes=root.findall("{http://www.w3.org/2005/Atom}entry") if atom else root.findall(".//item")
    now=dt.datetime.now(dt.timezone.utc)
    found=[]
    for node in nodes[:100]:
        title=clean(child_text(node,"title","{http://www.w3.org/2005/Atom}title"),180)
        url=child_text(node,"link")
        if atom:
            for l in node.findall("{http://www.w3.org/2005/Atom}link"):
                if l.attrib.get("rel","alternate")=="alternate":
                    url=l.attrib.get("href","");break
        if not url.startswith("https://"):
            continue
        date=parse_date(child_text(node,"pubDate","published","updated","{http://www.w3.org/2005/Atom}published","{http://www.w3.org/2005/Atom}updated","{http://purl.org/dc/elements/1.1/}date"))
        if date is None or not (-dt.timedelta(hours=6) <= now-date <= dt.timedelta(days=7)):
            continue
        description=clean(child_text(node,"description","summary","{http://www.w3.org/2005/Atom}summary","{http://purl.org/rss/1.0/modules/content/}encoded"),430)
        if not title:
            continue
        if not description:
            description="A recent story from "+publisher+". Read the original publisher report for context."
        found.append({"id":"rss-"+hashlib.sha1(url.encode()).hexdigest()[:16],"title":title,"category":category,
                      "source":publisher,"url":url,"summary":description,"date":date.isoformat(),
                      "kind":"current","type":"Publisher report","takeaway":"Open the original report for full context and any developing details."})
        if len(found)>=25:break
    return found

def fetch_source(index, force=False):
    category,source,url,ttl=FEEDS[index]
    key=str(index)
    with LOCK:
        entry=DATA.get(key,{})
        if not force and time.time()-entry.get("checked",0) < ttl*60:
            return
    try:
        stories=parse_feed(get_bytes(url),category,source)
        with LOCK:
            old=DATA.get(key,{})
            DATA[key]={"stories":stories or old.get("stories",[]),"checked":time.time(),"error":None if stories else "No recent items"}
    except Exception as e:
        with LOCK:
            old=DATA.get(key,{})
            DATA[key]={"stories":old.get("stories",[]),"checked":time.time(),"error":type(e).__name__}

def refresh(force=False):
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i:fetch_source(i,force),range(len(FEEDS))))

def snapshot():
    now=dt.datetime.now(dt.timezone.utc)
    with LOCK:
        cache={k:dict(v) for k,v in DATA.items()}
    stories=[]
    for obj in cache.values():
        for s in obj.get("stories",[]):
            d=parse_date(s.get("date",""))
            if d and -dt.timedelta(hours=6)<=now-d<=dt.timedelta(days=7):
                stories.append(s)
    stories.sort(key=lambda s:s["date"],reverse=True)
    unique={}
    for s in stories:
        key=re.sub("[^a-z0-9]","",s["title"].lower())[:100]
        if key and key not in unique:
            unique[key]=s
    statuses=[{"name":name,"working":bool(cache.get(str(i),{}).get("stories")),"error":cache.get(str(i),{}).get("error")} for i,(_,name,_,_) in enumerate(FEEDS)]
    return {"stories":list(unique.values())[:180],"updated":now.isoformat(),
            "sources_ok":sum(1 for x in statuses if x["working"]),"sources_total":len(FEEDS),
            "source_status":statuses,"note":"Dated publisher headlines and excerpts, with source links. Not independently fact-checked."}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kw):
        super().__init__(*args,directory=str(HERE),**kw)
    def send_json(self,obj):
        body=json.dumps(obj,ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        request=urllib.parse.urlsplit(self.path)
        if request.path=="/api/health":
            return self.send_json({"ok":True,"version":"5.0","publisher_sources":len(FEEDS),"uptime_seconds":int(time.time()-START)})
        if request.path in ("/api/content","/api/feed"):
            if urllib.parse.parse_qs(request.query).get("refresh")==["1"]:
                refresh(True)
            result=snapshot()
            return self.send_json(result)
        if request.path=="/api/sources":
            return self.send_json({"feeds":[{"category":c,"source":s,"url":u,"check_minutes":ttl} for c,s,u,ttl in FEEDS]})
        if request.path=="/":
            self.path="/index.html"
        return super().do_GET()

def scheduling():
    while True:
        try:refresh(False)
        except Exception as err: print("Refresh error:",repr(err),flush=True)
        time.sleep(60)

if __name__=="__main__":
    threading.Thread(target=scheduling,daemon=True).start()
    port=int(os.environ.get("PORT","8080"))
    print("Elsewhere HTTP + RSS running on port",port,flush=True)
    ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
