import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLanguage,resolveBrowserLanguage,normalizeLanguage,resolveLanguagePreference,mapMarkup,interpolate,templateSource,localizeCatalog,translate} from '../shared/i18n.mjs';
test('URL and saved preferences normalize supported tags and keep explicit, saved, App priority',()=>{
 const select=(query,saved)=>resolveLanguagePreference(new URLSearchParams(query),saved);
 assert.equal(select('appLang=pt-BR'),'pt');
 assert.equal(select('lang=ZH_cn&appLang=ja'),'zh');
 assert.equal(select('appLang=ja-JP','de'),'de');
 assert.equal(select('lang=fr-FR&appLang=ja','de'),'fr');
 assert.equal(select('lang=auto&appLang=ja','de'),'auto');
 assert.equal(select('lang=invalid&appLang=ko_KR','invalid'),'ko');
 assert.equal(select('lang=../../secret&appLang=unsupported'),'auto');
 assert.equal(normalizeLanguage(' PT_br '),'pt');
 for(const value of [null,42,'en-../../secret','zh<script>','en-','en--US'])assert.equal(normalizeLanguage(value),null);
});
test('preferred language order and regional variants',()=>{
 assert.equal(resolveLanguage(['xx-ZZ','pt-BR','ja']), 'pt');
 assert.equal(resolveLanguage(['zh-Hant-TW']), 'zh');
 assert.equal(resolveLanguage(['ar-SA']), 'ar');
 assert.equal(resolveLanguage(['ko_KR']), 'ko');
 assert.equal(resolveLanguage(['unsupported']), 'en');
});
test('automatic language prefers the ordered list, then the single language, server hint and English',()=>{
 assert.equal(resolveBrowserLanguage({languages:['nl-NL','ja-JP'],language:'de-DE'},'fr'),'ja');
 for (const languages of [undefined,null,[],{},'pt-BR',[null,42,'','unknown']]) {
  assert.equal(resolveBrowserLanguage({languages,language:' pt-BR '},'fr'),'pt');
 }
 assert.equal(resolveBrowserLanguage({languages:['nl-NL'],language:'nl-NL'},'ar'),'ar');
 assert.equal(resolveBrowserLanguage({},'unsupported'),'en');
 assert.equal(resolveBrowserLanguage(undefined),'en');
});
test('unavailable language getters do not prevent independent fallbacks',()=>{
 const brokenList={get languages(){throw Error('unavailable');},language:'ko-KR'};
 assert.equal(resolveBrowserLanguage(brokenList,'fr'),'ko');
 assert.equal(resolveBrowserLanguage({languages:['de'],get language(){throw Error('unavailable');}},'fr'),'de');
 assert.equal(resolveBrowserLanguage({get languages(){throw Error('unavailable');},get language(){throw Error('unavailable');}},'fr'),'fr');
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
 assert.equal(requestLanguage(new URL('https://example.com/?appLang=pt-BR'),'ko'),'pt');
 assert.equal(requestLanguage(new URL('https://example.com/?lang=ZH_cn&appLang=ja'),'ko'),'zh');
 assert.equal(requestLanguage(new URL('https://example.com/?lang=auto&appLang=ja'),'ko'),'ko');
 assert.equal(requestLanguage(new URL('https://example.com/?lang=invalid&appLang=ar-SA'),'ko'),'ar');
});
