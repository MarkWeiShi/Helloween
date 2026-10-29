import {copyFileSync,constants,mkdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {prepareContent,rewritePublicPaths} from './public-content.mjs';

export function staticContentPlugin() {
  let data, outDir, building=false;
  return {
    name:'ghost-static-content',
    configResolved(config) {building=config.command==='build';outDir=resolve(config.root,config.build.outDir);data=prepareContent(config.root);},
    resolveId(id) {if(id==='virtual:ghost-content')return '\0ghost-content';},
    load(id) {
      if(id==='\0ghost-content')return `export const catalogUrl=${JSON.stringify(building?data.prefix+'/content/catalog.json':'/content/catalog.json')};export const motionsUrl=${JSON.stringify(building?data.prefix+'/content/motions.json':'/content/motions.json')};`;
    },
    transform(code,id) {
      if(!building || !/\/src\/.*\.(ts|css)$/.test(id))return;
      // Only literal URL starts; leave regex validators and external URLs intact.
      return {code:code.replace(/(["'`(])\/(art|geo|audio|icons)\//g,`$1${data.prefix}/$2/`),map:null};
    },
    transformIndexHtml(html) {
      const origin=process.env.PUBLIC_ORIGIN;
      if(building && (!origin || !/^https?:\/\//.test(origin)))throw new Error('PUBLIC_ORIGIN is required for the static share card (use http://localhost:5173 locally).');
      const image=new URL((building?data.snapshot:data.raw).catalog.spirits[0].art.share,origin || 'http://localhost:5173').href;
      const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return html.replace('</head>',`<meta property="og:title" content="Boo Around the World"><meta property="og:description" content="A little fright. A world of friendship."><meta property="og:type" content="website"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary_large_image"></head>`);
    },
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        const path=req.url?.split('?')[0];
        const value=path==='/content/catalog.json'?data.raw.catalog:path==='/content/motions.json'?data.raw.motions:undefined;
        if(!value)return next();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
      });
    },
    closeBundle() {
      if(!building)return;
      const target=join(outDir,'releases',data.release);
      for(const file of data.files) {
        const destination=join(target,file);mkdirSync(dirname(destination),{recursive:true});
        if(file.endsWith('.json'))writeFileSync(destination,JSON.stringify(rewritePublicPaths(JSON.parse(readFileSync(join(data.source,file),'utf8')),data.prefix)));
        else copyFileSync(join(data.source,file),destination,constants.COPYFILE_FICLONE);
      }
      mkdirSync(join(target,'content'),{recursive:true});
      for(const name of ['catalog','motions'])writeFileSync(join(target,'content',`${name}.json`),JSON.stringify(data.snapshot[name]));
      // Old players validate /art/... URLs. Keep their original JSON while new
      // clients load rewritten manifests from the immutable snapshot.
      for(const file of data.files) {
        const legacy=join(outDir,file);mkdirSync(dirname(legacy),{recursive:true});
        if(file.endsWith('.json'))copyFileSync(join(data.source,file),legacy);
        else symlinkSync(relative(dirname(legacy),join(target,file)),legacy);
      }
      writeFileSync(join(outDir,'release.json'),JSON.stringify({release:data.release,contentVersion:data.snapshot.contentVersion}));
    },
  };
}
