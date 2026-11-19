export const CATEGORIES=[
'World affairs','Business','Science','Space','Health','Technology','Gaming','History','Geography','Travel','Culture','Myth & religion','Language','Film & TV','Music','Fashion & beauty','Trends','Art & design','Mind & philosophy','Nature & climate','Sports','Food & drink','Curiosities'] as const;
const MAP:Record<string,string[]>= {
'Space':['spacecraft','planet','nasa','esa','galaxy','moon','astronaut','telescope','mars','satellite'],
'Health':['health','clinical','vaccine','disease','medical','medicine','hospital','drug','cancer'],
'Gaming':['game','gaming','nintendo','xbox','playstation','esport','steam'],
'Fashion & beauty':['fashion','runway','couture','designer','fragrance','beauty','cosmetic','skincare','clothing'],
'Music':['music','album','concert','song','grammy','singer','band','billboard'],
'Film & TV':['film','movie','cinema','series','television','oscars','netflix','actor'],
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
 const hay=(title+' '+body).toLowerCase();let best=0,cat=defaultCategory;
 for(const [name,words] of Object.entries(MAP)) {const score=words.reduce((n,w)=>n+(hay.includes(w)?1:0),0);if(score>best){best=score;cat=name}}
 return best>=2?cat:defaultCategory;
}
export function worthFallback(title:string,summary:string,quality:number):number {
 const t=(title+' '+summary).toLowerCase();let points=2+Math.min(1,quality);
 if(/breakthrough|first ever|historic|election|discovery|global|major|worldwide|landmark|explained/.test(t))points+=.8;
 if(/how|why|unexpected|ancient|surprising|record/.test(t))points+=.4;
 return Math.max(1,Math.min(5,Math.round(points)));
}
export function whyReadFallback(category:string, title:string):string {const label=title.replace(/[.!?]+$/,'');return `Understand why this ${category.toLowerCase()} development deserves attention: ${label.slice(0,86)}.`}
