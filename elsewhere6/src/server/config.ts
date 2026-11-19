import {FeedConfig} from '../shared/types';
const conf=(id:string,name:string,url:string,tier:string,category:string,quality=.75,enabled=true,licenseNote='Public RSS syndication; confirm publisher terms before commercial reuse'):FeedConfig=>({id,name,url,tier,category,quality,enabled,licenseNote});
export const DEFAULT_FEEDS:FeedConfig[]=[
conf('bbc-world','BBC World','https://feeds.bbci.co.uk/news/world/rss.xml','breaking','World affairs',.9),
conf('bbc-politics','BBC Politics','https://feeds.bbci.co.uk/news/politics/rss.xml','breaking','World affairs',.9),
conf('bbc-us','BBC US/Canada','https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml','breaking','World affairs',.9),
conf('bbc-asia','BBC Asia','https://feeds.bbci.co.uk/news/world/asia/rss.xml','breaking','World affairs',.9),
conf('bbc-europe','BBC Europe','https://feeds.bbci.co.uk/news/world/europe/rss.xml','breaking','World affairs',.9),
conf('guardian-world','The Guardian World','https://www.theguardian.com/world/rss','breaking','World affairs',.85),
conf('guardian-politics','The Guardian Politics','https://www.theguardian.com/politics/rss','breaking','World affairs',.85),
conf('npr-news','NPR News','https://feeds.npr.org/1001/rss.xml','breaking','World affairs',.85),
conf('npr-world','NPR World','https://feeds.npr.org/1004/rss.xml','breaking','World affairs',.85),
conf('bbc-business','BBC Business','https://feeds.bbci.co.uk/news/business/rss.xml','business','Business',.9),
conf('guardian-business','The Guardian Business','https://www.theguardian.com/uk/business/rss','business','Business',.85),
conf('bbc-tech','BBC Technology','https://feeds.bbci.co.uk/news/technology/rss.xml','science','Technology',.9),
conf('bbc-science','BBC Science','https://feeds.bbci.co.uk/news/science_and_environment/rss.xml','science','Science',.9),
conf('nasa','NASA News Releases','https://www.nasa.gov/news-release/feed/','science','Space',.95),
conf('esa','ESA','https://www.esa.int/rssfeed/Our_Activities','science','Space',.9,false,'Candidate feed URL; needs validation and terms review'),
conf('sciencedaily','ScienceDaily','https://www.sciencedaily.com/rss/top/science.xml','science','Science',.7),
conf('sciencedaily-health','ScienceDaily Health','https://www.sciencedaily.com/rss/health_medicine.xml','science','Health',.7),
conf('nature-news','Nature News','https://www.nature.com/nature.rss','science','Science',.9,false,'Nature reuse rights and feed validity must be reviewed'),
conf('ars','Ars Technica','https://feeds.arstechnica.com/arstechnica/index','science','Technology',.85),
conf('wired','WIRED','https://www.wired.com/feed/rss','science','Technology',.8),
conf('verge','The Verge','https://www.theverge.com/rss/index.xml','science','Technology',.75),
conf('mit','MIT News','https://news.mit.edu/rss/feed','science','Technology',.9),
conf('variety','Variety','https://variety.com/feed/','pop','Film & TV',.75),
conf('bbc-ent','BBC Entertainment','https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml','pop','Film & TV',.9),
conf('pitchfork','Pitchfork','https://pitchfork.com/feed/feed-news/rss','pop','Music',.75,false,'Candidate URL; validate before enabling'),
conf('billboard','Billboard','https://www.billboard.com/feed/','pop','Music',.75,false,'Commercial use and feed validation required'),
conf('polygon','Polygon','https://www.polygon.com/rss/index.xml','pop','Gaming',.75),
conf('ign','IGN News','https://feeds.ign.com/ign/all','pop','Gaming',.75,false,'Candidate URL; validate feed and licensing'),
conf('bbc-sport','BBC Sport','https://feeds.bbci.co.uk/sport/rss.xml','pop','Sports',.85),
conf('guardian-sport','The Guardian Sport','https://www.theguardian.com/sport/rss','pop','Sports',.8),
conf('guardian-culture','The Guardian Culture','https://www.theguardian.com/culture/rss','lifestyle','Culture',.8),
conf('guardian-fashion','The Guardian Fashion','https://www.theguardian.com/fashion/rss','lifestyle','Fashion & beauty',.8),
conf('vogue','Vogue','https://www.vogue.com/feed/rss','lifestyle','Fashion & beauty',.8),
conf('smithsonian','Smithsonian','https://www.smithsonianmag.com/rss/','lifestyle','History',.9),
conf('smithsonian-history','Smithsonian History','https://www.smithsonianmag.com/rss/history/','lifestyle','History',.9),
conf('eater','Eater','https://www.eater.com/rss/index.xml','lifestyle','Food & drink',.75),
conf('dezeen','Dezeen','https://www.dezeen.com/feed/','lifestyle','Art & design',.8),
conf('natgeo','National Geographic','https://www.nationalgeographic.com/content/natgeo/en_us/index.rss','lifestyle','Nature & climate',.9,false,'Candidate feed URL; rights and validity unconfirmed'),
conf('guardian-travel','The Guardian Travel','https://www.theguardian.com/travel/rss','lifestyle','Travel',.8),
conf('guardian-food','The Guardian Food','https://www.theguardian.com/food/rss','lifestyle','Food & drink',.8),
conf('guardian-science','The Guardian Science','https://www.theguardian.com/science/rss','science','Science',.8),
conf('google-trends','Google Trends US','https://trends.google.com/trending/rss?geo=US','trends','Trends',.65,false,'Trends indicate interest, not a verified news article; disabled to prevent false claims'),
conf('guardian-tech','The Guardian Technology','https://www.theguardian.com/technology/rss','science','Technology',.8),
conf('npr-arts','NPR Arts','https://feeds.npr.org/1008/rss.xml','pop','Art & design',.85)
];
export const TIERS:Record<string,number>={breaking:15,science:30,business:30,pop:30,lifestyle:60,trends:60,general:360,links:1440};
export function schedules(env:Record<string,string|undefined>={}):Record<string,number>{
 let overrides:Record<string,number>={};try{overrides=JSON.parse(env.SCHEDULE_JSON||'{}')}catch{}
 return Object.fromEntries(Object.entries(TIERS).map(([k,v])=>[k,Math.max(1,Number(env[`REFRESH_${k.toUpperCase()}_MINUTES`]||overrides[k]||v))]));
}
