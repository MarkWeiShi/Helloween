import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseSync} from 'rolldown/utils';
import {mapMarkup,templateSource} from '../shared/i18n.mjs';
import {loadCatalog} from '../server/content.mjs';
const root=new URL('../',import.meta.url);
export function collectMessages(){
 const messages=new Set();
 const record=text=>{if(typeof text==='string'&&/[A-Za-z\u3400-\u9fff]/.test(text.replace(/\{\{\d+\}\}/g,'')))messages.add(text.trim());return text;};
 const fields=new Set(['name','subtitle','kind','culture','shortDescription','globeDescription','folklore','artNote','wish','peaceLabel','prop','title','text','storyLabel','storyDisclosure']);
 const catalog=(value,key='')=>{if(Array.isArray(value))value.forEach(item=>catalog(item,key));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>catalog(v,k));else if(fields.has(key))record(value);};catalog(loadCatalog());
 const sourceFiles=readdirSync(new URL('src/',root)).filter(f=>f.endsWith('.ts')).map(f=>'src/'+f);
 sourceFiles.push('server/index.mjs','server/store.mjs','server/social.mjs');
 for(const file of sourceFiles){
  const source=readFileSync(new URL(file,root),'utf8');const parsed=parseSync(file,source);
  if(parsed.errors.length)throw Error(`Cannot parse ${file}: ${JSON.stringify(parsed.errors)}`);
  const walk=node=>{
   if(!node||typeof node!=='object')return;
   if(node.type==='TaggedTemplateExpression'&&['html','msg'].includes(node.tag.name)){
    const source=templateSource(node.quasi.quasis.map(x=>x.value.cooked));if(node.tag.name==='html')mapMarkup(source,record);else record(source);
   }
   if(node.type==='CallExpression'&&node.callee.name==='t'&&node.arguments[0]?.type==='Literal')record(node.arguments[0].value);
   if((node.type==='NewExpression'&&node.callee.name==='ApiError')||(node.type==='CallExpression'&&node.callee.name==='fail')){
    const message=node.arguments[1];if(message?.type==='Literal')record(message.value);else if(message?.type==='TemplateLiteral')record(templateSource(message.quasis.map(q=>q.value.cooked)));
   }
   if(file==='server/social.mjs'&&['CallExpression','NewExpression'].includes(node.type)&&node.callee.name==='Error'&&node.arguments[0]?.type==='Literal')record(node.arguments[0].value);
   if(file==='server/index.mjs'&&node.type==='CallExpression'&&node.callee.object?.name==='res'&&node.callee.property?.name==='end'&&node.arguments[0]?.type==='Literal')record(node.arguments[0].value);
   if(node.type==='Property'&&((file==='src/region-previews.ts'&&['name','culture'].includes(node.key.name||node.key.value))||node.key.name==='error')&&node.value.type==='Literal')record(node.value.value);
   for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
  };walk(parsed.program);
 }
 const index=readFileSync(new URL('index.html',root),'utf8');record(index.match(/<meta name="description" content="([^"]+)"/)?.[1]);
 ['Boo Around the World','Not measured','Mega Boo','Big Boo','Little Boo','Low Boo'].forEach(record);
 return [...messages].sort();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const messages=collectMessages();
 if(process.argv.includes('--write'))writeFileSync(new URL('content/localization/source.json',root),JSON.stringify(messages,null,2)+'\n');
 console.log(JSON.stringify(messages,null,2));
}
