import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync('src/public-assets.ts','utf8').replace("import {assetOrigin,releasePrefix,mediaPrefix,changedAssets} from 'virtual:ghost-content';", "const assetOrigin='https://assets.helloween.dev',releasePrefix='/releases/21e0f86429f2cfe9808d',mediaPrefix=releasePrefix,changedAssets={'/icons/social/whatsapp.svg':'/releases/11111111111111111111/icons/social/whatsapp.svg'};");
const {publicAssetUrl,publicAssetData}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('CDN maps only public media and preserves immutable versions',()=>{
 assert.equal(publicAssetUrl('/art/a.png'),'https://assets.helloween.dev/releases/21e0f86429f2cfe9808d/art/a.png');
 assert.equal(publicAssetUrl('/releases/00000000000000000000/audio/a.mp3'),'https://assets.helloween.dev/releases/00000000000000000000/audio/a.mp3');
 for(const path of ['/api/audio/private','/api/session','/i/token','https://other.example/art/a.png','blob:example','/my-links'])assert.equal(publicAssetUrl(path),path);
 assert.equal(publicAssetUrl('/icons/social/whatsapp.svg'),'https://assets.helloween.dev/releases/11111111111111111111/icons/social/whatsapp.svg');
 const data={assetOrigin:'',art:{thumb:'/releases/21e0f86429f2cfe9808d/art/a.png'},audio:'/api/audio/private'};
 const mapped=publicAssetData(data);assert.equal(mapped.assetOrigin,'');assert.match(mapped.art.thumb,/^https:\/\/assets.helloween.dev\//);assert.equal(mapped.audio,data.audio);assert.ok(data.art.thumb.startsWith('/'));
});
test('CSP grants CDN only image media and fetch access',()=>{
 const csp=readFileSync('deploy/nginx/security.conf','utf8');
 for(const directive of ['img-src','media-src','connect-src'])assert.match(csp,new RegExp(directive+"[^;]*https://assets\\.helloween\\.dev"));
 assert.doesNotMatch(csp,/script-src[^;]*assets\.helloween\.dev/);
 assert.doesNotMatch(csp,/frame-src[^;]*assets\.helloween\.dev/);
});

test('unchanged transformation videos retain published CDN URLs and are absent from the new release',()=>{
 const {release}=JSON.parse(readFileSync('dist/release.json'));
 const manifest=JSON.parse(readFileSync(`dist/releases/${release}/art/transformations/manifest.json`));
 for(const entry of Object.values(manifest.characters))for(const key of ['entrance','loop'])assert.match(entry[key],/^\/releases\/21e0f86429f2cfe9808d\//);
 const catalog=JSON.parse(readFileSync(`dist/releases/${release}/content/catalog.json`));
 assert.ok(catalog.spirits.every(s=>s.globeDescription));

});
