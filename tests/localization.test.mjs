import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLanguage,mapMarkup,interpolate,templateSource,localizeCatalog,translate} from '../shared/i18n.mjs';
test('preferred language order and regional variants',()=>{
 assert.equal(resolveLanguage(['xx-ZZ','pt-BR','ja']), 'pt');
 assert.equal(resolveLanguage(['zh-Hant-TW']), 'zh');
 assert.equal(resolveLanguage(['ar-SA']), 'ar');
 assert.equal(resolveLanguage(['ko_KR']), 'ko');
 assert.equal(resolveLanguage(['unsupported']), 'en');
});
test('translation keeps markup, user content and attributes separate',()=>{
 const source=templateSource(['<button data-id="','" title="Hello ','">Hello ','</button>']);
 const localized=mapMarkup(source,s=>translate(s,{'Hello {{1}}':'Bonjour {{1}}','Hello {{2}}':'Bonjour {{2}}'}));
 assert.equal(interpolate(localized,['fixed-id','Alice &amp; Bob','&lt;script&gt;']),'<button data-id="fixed-id" title="Bonjour Alice &amp; Bob">Bonjour &lt;script&gt;</button>');
 assert.equal(mapMarkup('<p>Hello</p>',s=>s==='Hello'?'<img onerror="bad">':s),'<p>&lt;img onerror=&quot;bad&quot;&gt;</p>');
});
test('translated template may reorder or repeat variables without interpreting their contents',()=>{
 assert.equal(interpolate('{{1}} greets {{0}}',['{{1}}','Bob']), 'Bob greets {{1}}');
 assert.equal(translate(' Hello ',{Hello:'你好'}),' 你好 ');
});
test('catalog localizes presentation fields without changing identity, paths or native names',()=>{
 const source={name:'Kappa',nativeName:'河童',id:'kappa',art:{idle:'/Kappa.webp'},story:[{title:'Hello',text:'Hello'}]};
 const result=localizeCatalog(source,{Kappa:'カッパ',Hello:'こんにちは'});
 assert.equal(result.name,'カッパ');assert.equal(result.nativeName,'河童');assert.equal(result.id,'kappa');
 assert.equal(result.art.idle,'/Kappa.webp');assert.equal(result.story[0].text,'こんにちは');assert.equal(source.name,'Kappa');
});
import {requestLanguage} from '../server/localization.mjs';
test('HTTP preferences respect quality and explicit supported language',()=>{
 assert.equal(requestLanguage(new URL('https://example.com/'),'en;q=0.4,ja;q=0.9,zh;q=0'),'ja');
 assert.equal(requestLanguage(new URL('https://example.com/i/token?lang=ar'),'ja'),'ar');
 assert.equal(requestLanguage(new URL('https://example.com/?lang=../../secret'),'ko'),'ko');
 assert.equal(requestLanguage(new URL('https://example.com/?lang=auto'),'pt-BR'),'pt');
});
