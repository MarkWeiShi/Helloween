export const SHARE_BROWSERS=['chromium','safari','firefox','edge','other','unknown'];
export const SHARE_CONTEXTS=['hellotalk','line','wechat','kakao','facebook','instagram','webview','browser','unknown'];
export const SHARE_ERRORS=['TIMEOUT','NETWORK','UNAVAILABLE','INIT_FAILED','UNAUTHORIZED','FORBIDDEN','INVALID_CONFIG','INVALID_ARGUMENT','AUTH_REQUIRED','CANCELLED','CONFIG_MISSING','HTTP_4XX','HTTP_5XX','OTHER'];
export function shareEnvironment(ua=''){
 const s=String(ua).toLowerCase();const browser=/edg\//.test(s)?'edge':/firefox|fxios/.test(s)?'firefox':/chrome|chromium|crios/.test(s)?'chromium':/safari/.test(s)?'safari':s?'other':'unknown';
 const app=/hellotalk/.test(s)?'hellotalk':/micromessenger/.test(s)?'wechat':/kakaotalk/.test(s)?'kakao':/\bline\//.test(s)?'line':/fban|fbav/.test(s)?'facebook':/instagram/.test(s)?'instagram':/; wv\)|\bwv\b/.test(s)?'webview':s?'browser':'unknown';return {browser,appContext:app};
}
