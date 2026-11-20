export const CATEGORIES=[
'World affairs','Business','Science','Space','Health','Technology','Gaming','History','Geography','Travel','Culture','Myth & religion','Language','Film & TV','Music','Fashion & beauty','Trends','Art & design','Mind & philosophy','Nature & climate','Sports','Food & drink','Curiosities'] as const;
const MAP:Record<string,string[]>= {
'Space':['spacecraft','planet','nasa','esa','galaxy','moon','astronaut','telescope','mars','satellite'],
'Health':['health','clinical','vaccine','disease','medical','medicine','hospital','drug','cancer'],
'Gaming':['game','gaming','nintendo','xbox','playstation','esport','steam'],
'Fashion & beauty':['fashion','runway','couture','designer','fragrance','beauty','cosmetic','skincare','clothing'],
'Music':['music','album','concert','song','grammy','singer','band','billboard'],
'Film & TV':['film','movie','cinema','series','television','oscars','netflix','actor','star wars','dub','dubbing','premiere','screening','franchise'],
'Sports':['football','cricket','olympic','tennis','basketball','athlete','sports','league'],
'Food & drink':['restaurant','recipe','cuisine','food','coffee','chef','wine','dining'],
'Nature & climate':['climate','weather','wildlife','species','ocean','conservation','forest','fossil'],
'Art & design':['art','museum','painting','sculpture','architecture','design','gallery'],
'Trends':['viral','trend','meme','tiktok','influencer','social media'],
'Technology':['ai','artificial intelligence','software','semiconductor','chip','internet','cyber','robot'],
'Business':['market','economy','trade','business','finance','bank','stocks','inflation'],
'Science':['research','scientist','physics','chemistry','biology','laboratory'],
'World affairs':['election','government','president','war','diplomacy','policy','parliament'],
'Culture':['festival','tradition','heritage','community','culture'],
'History':['history','historic','archaeology','ancient','century'],
};
export function classify(title:string,body:string,defaultCategory:string):string {
 const headline=title.toLowerCase(),text=body.toLowerCase();
 const has=(s:string,word:string)=>{
   const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   return new RegExp('\\b'+escaped+'(?:s|es|ed|ing)?\\b','i').test(s);
 };
 let scoreMax=0,choice=defaultCategory;
 for(const [name,keywords] of Object.entries(MAP)){
   const score=keywords.reduce((total,term)=>total+(has(headline,term)?3:0)+(has(text,term)?1:0),0);
   if(score>scoreMax){scoreMax=score;choice=name;}
 }
 // A strong headline cue outweighs the original feed section, which may be broad.
 return scoreMax>=3?choice:defaultCategory;
}
export function worthFallback(title:string,summary:string,quality:number):number {
 const t=(title+' '+summary).toLowerCase();let points=2+Math.min(1,quality);
 if(/breakthrough|first ever|historic|election|discovery|global|major|worldwide|landmark|explained/.test(t))points+=.8;
 if(/how|why|unexpected|ancient|surprising|record/.test(t))points+=.4;
 return Math.max(1,Math.min(5,Math.round(points)));
}
export function whyReadFallback(category:string,title:string,summary=''):string {
 const candidate=summary.split(/(?<=[.!?])\s+/).find(s=>s.trim().split(/\s+/).length>=9)?.trim();
 return candidate?candidate.slice(0,185):`The publisher reports: ${title.replace(/[.!?]+$/,'').slice(0,140)}.`;
}
