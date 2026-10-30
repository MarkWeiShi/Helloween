import {normalizeLanguage} from '../shared/i18n.mjs';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Public crawler document: never includes sender details or creates a visit/session.
// Browsers continue to the original invite and its existing consent flow.
export function facebookShareDocument(invite,spirit,origin,language) {
 const lang=normalizeLanguage(language)||'en';
 const path=`/i/${encodeURIComponent(invite.id)}?lang=${lang}`;
 const canonical=new URL(`/api/share/facebook/${encodeURIComponent(invite.id)}?lang=${lang}`,origin).href;
 const image=new URL(`/art/x-cards/${encodeURIComponent(spirit.id)}.${lang}.jpg`,origin).href;
 const title=`${spirit.nativeName ? spirit.nativeName+' · ' : ''}${spirit.name} — Halloween Tricks by HelloTalk`;
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(title)}</title><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="Halloween Tricks by HelloTalk"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:width" content="960"><meta property="og:image:height" content="504"><meta name="twitter:card" content="summary_large_image"></head><body><a href="${escape(path)}">${escape(title)}</a><script>location.replace(${JSON.stringify(path)})</script></body></html>`;
}
