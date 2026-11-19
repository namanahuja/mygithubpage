import {Pipeline} from './pipeline';
declare const process:any;
const tier=process.argv[2]||'breaking';
const pipeline=new Pipeline();
console.log('Elsewhere ingestion:',tier);
pipeline.ingest(tier).then(()=>{console.log(JSON.stringify(pipeline.status().find(t=>t.tier===tier),null,2));process.exit(0)}).catch(e=>{console.error(e);process.exit(1)});
