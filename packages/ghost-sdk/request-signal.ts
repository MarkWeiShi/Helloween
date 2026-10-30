/** A request owns its timeout until its response body has been consumed. */
export function requestSignal(timeoutMs:number, external?:AbortSignal) {
  if (typeof AbortSignal.timeout==='function' && typeof AbortSignal.any==='function') {
    return {signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(external?[external]:[])]),dispose:()=>{}};
  }
  const controller=new AbortController();
  const abort=()=>controller.abort(external?.reason ?? new DOMException('Request cancelled','AbortError'));
  let timer:ReturnType<typeof setTimeout>|undefined;
  if(external?.aborted)abort();
  else {
    external?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>controller.abort(new DOMException('Request timed out','TimeoutError')),timeoutMs);
  }
  return {signal:controller.signal,dispose:()=>{clearTimeout(timer);external?.removeEventListener('abort',abort);}};
}
/** Includes JSON decoding in the timeout and always releases fallback resources. */
export async function fetchJson<T>(url:string,init:RequestInit={},timeoutMs=15000):Promise<T> {
  const scope=requestSignal(timeoutMs,init.signal ?? undefined);
  try {
    const response=await fetch(url,{...init,signal:scope.signal});
    if(!response.ok)throw new Error('Public content unavailable');
    return await response.json();
  } finally {scope.dispose();}
}
