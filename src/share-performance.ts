// Bounded, local-only timings. Never include invitation URLs or player identifiers.
export function startShareTiming(stage:'config'|'sdk-kakao'|'sdk-wechat'|'image'|'invitation'|'kakao-ready'){
 const start=performance.now();
 return ()=>{
  try{
   const name=`share:${stage}`;
   performance.clearMeasures(name);
   performance.measure(name,{start,end:performance.now()});
  }catch{/* Diagnostics must not break sharing on older embedded browsers. */}
 };
}
