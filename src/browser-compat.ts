/** Keep native APIs on capable engines; do not patch browser prototypes. */
export const nativePopover=typeof HTMLElement!=='undefined' && typeof HTMLElement.prototype.showPopover==='function';
export function regionNames(locale:string):{of:(code:string)=>string|undefined} {
  try {return new Intl.DisplayNames([locale],{type:'region'});} catch {return {of:()=>undefined};}
}
export function audioContext() {
  const Constructor=globalThis.AudioContext || (globalThis as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Constructor)throw new Error('Audio is unavailable in this browser.');
  return new Constructor();
}
const dialogCleanup=new WeakMap<HTMLDialogElement,()=>void>();
export function closeDialog(dialog:HTMLDialogElement|null) {
  if(!dialog)return;
  if(dialogCleanup.has(dialog)){dialogCleanup.get(dialog)!();dialogCleanup.delete(dialog);dialog.removeAttribute('open');}
  else dialog.close();
}
export function openDialog(dialog:HTMLDialogElement) {
  if(typeof dialog.showModal==='function'){dialog.showModal();return;}
  const previousFocus=document.activeElement as HTMLElement|null;
  const container=dialog.parentElement!;
  const app=document.querySelector<HTMLElement>('#app');
  const previousHidden=app?.getAttribute('aria-hidden');
  app?.setAttribute('aria-hidden','true');
  container.classList.add('compat-modal-layer');
  dialog.setAttribute('open','');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
  const focusables=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(e=>e.getClientRects().length);
  const focus=()=> (focusables()[0]||dialog).focus();
  const key=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){event.preventDefault();dialog.dispatchEvent(new Event('cancel',{cancelable:true}));}
    if(event.key==='Tab'){
      const items=focusables(),first=items[0]||dialog,last=items[items.length-1]||dialog;
      if(event.shiftKey && (document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last||document.activeElement===dialog)){event.preventDefault();first.focus();}
    }
  };
  const contain=(event:FocusEvent)=>{if(!dialog.contains(event.target as Node))focus();};
  const outside=(event:MouseEvent)=>{if(event.target===container)dialog.dispatchEvent(new Event('cancel',{cancelable:true}));};
  document.addEventListener('keydown',key);document.addEventListener('focusin',contain);container.addEventListener('click',outside);
  dialogCleanup.set(dialog,()=>{
    document.removeEventListener('keydown',key);document.removeEventListener('focusin',contain);container.removeEventListener('click',outside);
    container.classList.remove('compat-modal-layer');
    if(previousHidden==null)app?.removeAttribute('aria-hidden');else app?.setAttribute('aria-hidden',previousHidden);
    if(previousFocus?.isConnected)previousFocus.focus();
  });
  focus();
}
const inertRestore=new WeakMap<HTMLElement,()=>void>();
export function setInert(element:HTMLElement,value:boolean){
  if('inert' in HTMLElement.prototype){element.inert=value;return;}
  if(!value){inertRestore.get(element)?.();inertRestore.delete(element);return;}
  if(inertRestore.has(element))return;
  const previous=element.getAttribute('aria-hidden');
  const nodes=Array.from(element.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'));
  const saved=nodes.map(node=>[node,node.getAttribute('tabindex')] as const);
  nodes.forEach(node=>node.tabIndex=-1);element.setAttribute('aria-hidden','true');element.setAttribute('inert','');element.classList.add('compat-inert');
  const block=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const focus=(event:FocusEvent)=>{(event.target as HTMLElement).blur();(element.closest('dialog')?.querySelector<HTMLElement>('[data-play-transform]') || document.querySelector<HTMLElement>('.play-unlock'))?.focus();};
  element.addEventListener('click',block,true);element.addEventListener('keydown',block,true);element.addEventListener('focusin',focus);
  inertRestore.set(element,()=>{
    for(const [node,index] of saved){if(index===null)node.removeAttribute('tabindex');else node.setAttribute('tabindex',index);}
    if(previous===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',previous);
    element.removeAttribute('inert');element.classList.remove('compat-inert');
    element.removeEventListener('click',block,true);element.removeEventListener('keydown',block,true);element.removeEventListener('focusin',focus);
  });
}

let listenerSignals:boolean|undefined;
export function scopedListener<K extends keyof DocumentEventMap>(target:EventTarget|null,type:K,callback:(event:DocumentEventMap[K])=>void,options:AddEventListenerOptions){
  if(!target)return;
  if(listenerSignals===undefined){
    listenerSignals=false;
    const probe=()=>{};
    const controller=new AbortController();
    const opts={get signal(){listenerSignals=true;return controller.signal;}};
    window.addEventListener('compat-signal-probe',probe,opts);
    window.removeEventListener('compat-signal-probe',probe);controller.abort();
  }
  if(listenerSignals){target.addEventListener(type,callback as EventListener,options);return;}
  const {signal,...rest}=options;
  if(signal?.aborted)return;
  target.addEventListener(type,callback as EventListener,rest);
  signal?.addEventListener('abort',()=>target.removeEventListener(type,callback as EventListener,rest),{once:true});
}
export const focusedPinSelector=typeof CSS!=='undefined' && CSS.supports('selector(:focus-visible)')?'.globe-pin:focus-visible':'.globe-pin:focus';
export function firstSentence(text:string,locale:string,fallback:string){
  if(typeof Intl.Segmenter==='function'){
    const first=new Intl.Segmenter(locale,{granularity:'sentence'}).segment(text)[Symbol.iterator]().next().value;
    return first?.segment.trim() || fallback;
  }
  // Keep authored copy rather than approximate sentence boundaries for every language.
  return fallback || text;
}
