// Native SNS apps do not expose a reliable browser completion callback.
// Only restore the game after the user actually leaves and returns; never infer delivery.
let stop: (()=>void)|undefined;
export function watchShareReturn() {
 stop?.();
 let left=document.visibilityState==='hidden';
 const cleanup=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',changed);if(stop===cleanup)stop=undefined;};
 const changed=()=>{
  if(document.visibilityState==='hidden')left=true;
  else if(left){cleanup();document.dispatchEvent(new Event('boo:share-return'));}
 };
 const timer=setTimeout(cleanup,10*60*1000);
 document.addEventListener('visibilitychange',changed);stop=cleanup;
}
export function returnToGame(){stop?.();document.dispatchEvent(new Event('boo:share-return'));}
