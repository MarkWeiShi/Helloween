import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2'};
export function publicationFiles(root='dist') {
 if(!existsSync(join(root,'release.json')))throw Error('Run build:web before publishing the complete static site');
 const files=[];
 function walk(prefix=''){for(const name of readdirSync(join(root,prefix)).sort()){if(name.startsWith('.'))continue;const path=prefix+name;const stat=statSync(join(root,path));if(stat.isDirectory())walk(path+'/');else files.push(path);}}
 walk();
 // Immutable files first; mutable aliases next; HTML entrypoints last. Never delete old releases.
 const phase=path=>path.endsWith('.html')?2:/^(releases|assets)\//.test(path)?0:1;
 return files.sort((a,b)=>phase(a)-phase(b)||a.localeCompare(b));
}
export async function publishAssets(env=process.env) {
 const files=publicationFiles(env.STATIC_DIRECTORY || 'dist');
 if(env.PUBLISH_DRY_RUN==='true')return {files:files.length,mutated:false,entrypointsLast:true};
 const accessKeyId=env.MEDIA_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID,secretAccessKey=env.MEDIA_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;
 if(!env.MEDIA_BUCKET || !accessKeyId || !secretAccessKey)throw Error('Configure static bucket credentials before publishing');
 const client=new S3Client({region:env.AWS_REGION || 'auto',endpoint:env.AWS_ENDPOINT_URL_S3,credentials:{accessKeyId,secretAccessKey}});
 for(const path of files)await client.send(new PutObjectCommand({Bucket:env.MEDIA_BUCKET,Key:path,Body:readFileSync(join(env.STATIC_DIRECTORY || 'dist',path)),ContentType:mime[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream',CacheControl:/^(releases|assets)\//.test(path)?'public,max-age=31536000,immutable':'no-cache'}));
 return {files:files.length};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])console.log(JSON.stringify(await publishAssets()));
