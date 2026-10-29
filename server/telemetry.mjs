import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
// Bounded process-level metrics. No URLs, cookies, request bodies or player IDs.
export function createTelemetry() {
 const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 let cpu=process.cpuUsage(),started=performance.now(),requests=0,errors=0,limited=0,active=0,latencies=[];
 return {
  track(req,res){const start=performance.now();active++;let finished=false;const finish=()=>{if(finished)return;finished=true;active--;requests++;if(res.statusCode>=500)errors++;if(res.statusCode===429)limited++;if(latencies.length<10000)latencies.push(performance.now()-start);};res.once('finish',finish);res.once('close',finish);},
  snapshot(){
   const elapsed=performance.now()-started,usage=process.cpuUsage(cpu);cpu=process.cpuUsage();started=performance.now();latencies.sort((a,b)=>a-b);
   const result={type:'api_metrics',intervalMs:Math.round(elapsed),requests,active,errors,limited,rps:requests/Math.max(.001,elapsed/1000),p95Ms:latencies[Math.floor(latencies.length*.95)]??0,p99Ms:latencies[Math.floor(latencies.length*.99)]??0,cpuCores:(usage.user+usage.system)/Math.max(1,elapsed*1000),rssBytes:process.memoryUsage().rss,eventLoopP99Ms:loop.percentile(99)/1e6,latencySamples:latencies.length};
   requests=errors=limited=0;latencies=[];loop.reset();return result;
  },
  close(){loop.disable();},
 };
}
