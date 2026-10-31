// Returns aggregates only; browser identities never leave the database host.
export function engagementSummary(db){
 function flowReport(){
  const empty={startedAt:null,rows:[],stages:[]};
  if(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN('share_flows','share_flow_events','funnel_events')").get().n!==3)return empty;
  const startedAt=db.prepare("SELECT value FROM engagement_metadata WHERE key='share_flows_started_at'").get()?.value??null;
  // Country scopes apply to the start of a flow; follow-up events and friend
  // visits stay attached even when their requests arrive from another country.
  const events=db.prepare(`SELECT f.id,f.player_id,f.channel,f.created_at flow_at,e.step,e.created_at,e.rowid event_order,
   (SELECT COUNT(*) FROM main.invite_visits v WHERE v.invite_id=f.invite_id) friend_visits
   FROM share_flows f LEFT JOIN main.share_flow_events b ON b.flow_id=f.id
   LEFT JOIN main.funnel_events e ON e.player_id=b.player_id AND e.event_id=b.event_id
   ORDER BY e.created_at,e.rowid`).all();
  const flows=new Map();
  const rank={share_clicked:0,share_page_opened:1,share_ready:2,share_invite_created:3,share_copied:4,share_handoff:4,share_send_confirmed:5};
  for(const e of events){
   if(!flows.has(e.id))flows.set(e.id,{hour:Math.floor(e.flow_at/3600000),channel:e.channel,player:e.player_id,steps:new Set(),furthest:'not_recorded',lastEvent:'not_recorded',lastAt:e.flow_at,friends:e.friend_visits});
   const f=flows.get(e.id);if(!e.step)continue;f.steps.add(e.step);f.lastEvent=e.step;f.lastAt=e.created_at;
   if(rank[e.step]!==undefined&&rank[e.step]>=(rank[f.furthest]??-1))f.furthest=e.step;
  }
  const groups=new Map(),stageGroups=new Map(),denominators=new Map();
  for(const f of flows.values()){
   const base=JSON.stringify([f.hour,f.channel]);denominators.set(base,(denominators.get(base)||0)+1);
   const key=JSON.stringify([f.hour,f.channel,f.furthest,f.lastEvent]);
   if(!groups.has(key))groups.set(key,{hour:f.hour,channel:f.channel,furthest:f.furthest,lastEvent:f.lastEvent,flows:0,players:new Set(),visitedFlows:0,friendVisits:0});
   const g=groups.get(key);g.flows++;g.players.add(f.player);g.visitedFlows+=f.friends>0?1:0;g.friendVisits+=f.friends;
   if(f.friends>0)f.steps.add('friend_visited');
   for(const step of f.steps){
    const key=JSON.stringify([f.hour,f.channel,step]);
    if(!stageGroups.has(key))stageGroups.set(key,{hour:f.hour,channel:f.channel,step,flows:0,players:new Set()});
    const g=stageGroups.get(key);g.flows++;g.players.add(f.player);
   }
  }
  const channelNames={x:'X',facebook:'Facebook',line:'LINE',whatsapp:'WhatsApp',messenger:'Messenger',kakao:'KakaoTalk',wechat:'微信',copy:'复制链接',system:'系统分享'};
  const entry={key:'entry',label:'点击渠道',events:['share_clicked']},invite={key:'invite',label:'生成邀请链接',events:['share_invite_created']},ready={key:'ready',label:'展示分享界面',events:['share_ready']};
  const action={key:'action',label:'发起平台跳转或复制成功',events:['share_handoff','share_copied']};
  const channels=Object.entries(channelNames).map(([channel,name])=>({channel,name,steps:channel==='copy'?[entry,{key:'page',label:'打开复制页面',events:['share_page_opened']},invite,ready,{key:'copy',label:'复制成功',events:['share_copied']}]:['x','facebook'].includes(channel)?[entry,invite,{key:'handoff',label:'发起平台跳转',events:['share_handoff']}]:channel==='line'?[entry,invite,ready,action,{key:'confirmed',label:'LINE SDK 确认发送',events:['share_send_confirmed']}]:[entry,invite,ready,action],boundary:channel==='copy'?'复制成功是站内完成，粘贴和发送不可观测。':channel==='line'?'仅 SDK 成功回调确认发送；复制链接是替代出口，不能算发送成功。':channel==='wechat'?'微信右上角菜单的实际分享不可观测；无站内后续不代表未分享。':'平台跳转或复制只是分享出口，平台内发送结果不可观测。'}));
  const summaries=new Map(),progress=new Map(),endings=new Map(),now=Date.now(),idleMs=30*60000;
  const statuses=['confirmed','copied','handoff','cancelled','failed','pending','inactive'];
  for(const f of flows.values()){
   const definition=channels.find(c=>c.channel===f.channel);if(!definition)continue;
   const quiet=now-f.lastAt>=idleMs;
   const status=f.steps.has('share_send_confirmed')?'confirmed':f.lastEvent==='share_cancelled'?'cancelled':['share_failed','share_copy_failed'].includes(f.lastEvent)?'failed':f.steps.has('share_copied')?'copied':f.steps.has('share_handoff')?'handoff':quiet?'inactive':'pending';
   const key=JSON.stringify([f.hour,f.channel]);
   if(!summaries.has(key))summaries.set(key,{hour:f.hour,channel:f.channel,flows:0,goalReached:0,...Object.fromEntries(statuses.map(s=>[s,0])),visitedFlows:0});
   const total=summaries.get(key);total.flows++;total[status]++;total.goalReached+=(f.channel==='line'?f.steps.has('share_send_confirmed'):f.channel==='copy'?f.steps.has('share_copied'):f.steps.has('share_copied')||f.steps.has('share_handoff'))?1:0;total.visitedFlows+=f.friends>0?1:0;
   let last='未记录到标准步骤';
   for(let i=0;i<definition.steps.length;i++){
    const step=definition.steps[i],hit=step.events.some(e=>f.steps.has(e));if(hit)last=step.label;
    const previous=i?definition.steps[i-1].events.some(e=>f.steps.has(e)):false;
    const k=JSON.stringify([f.hour,f.channel,i]);
    if(!progress.has(k))progress.set(k,{hour:f.hour,channel:f.channel,order:i,label:step.label,reached:0,previous:0,continued:0,notContinued:0,inactive:0,alternativeExit:0});
    const g=progress.get(k);g.reached+=hit?1:0;g.previous+=previous?1:0;g.continued+=previous&&hit?1:0;
    if(previous&&!hit){g.notContinued++;if(quiet&&status==='inactive')g.inactive++;if(['copied','handoff'].includes(status))g.alternativeExit++;}
   }
   const endKey=JSON.stringify([f.hour,f.channel,status,last,f.lastEvent]);
   if(!endings.has(endKey))endings.set(endKey,{hour:f.hour,channel:f.channel,status,lastStep:last,lastEvent:f.lastEvent,flows:0});endings.get(endKey).flows++;
  }
  const analysis={idleMinutes:30,asOf:now,channels,summary:[...summaries.values()],steps:[...progress.values()],endings:[...endings.values()]};
  const clean=g=>{const {players,...rest}=g;return {...rest,visitors:players.size};};
  return {startedAt,analysis,rows:[...groups.values()].map(clean).sort((a,b)=>b.hour-a.hour||a.channel.localeCompare(b.channel)),stages:[...stageGroups.values()].map(g=>({...clean(g),totalFlows:denominators.get(JSON.stringify([g.hour,g.channel]))})).sort((a,b)=>b.hour-a.hour||a.channel.localeCompare(b.channel)||a.step.localeCompare(b.step))};
 }
 const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='engagement_metadata'").get();
 if(!exists)return {startedAt:null,total:{samples:0,totalMs:0,averageMs:null,medianMs:null,cards:0,cardVisitors:0},hours:[],cards:[],funnel:[]};
 const startedAt=db.prepare("SELECT value FROM engagement_metadata WHERE key='started_at'").get().value;
 const total=db.prepare(`WITH visits AS(SELECT visit_id,SUM(visible_ms) ms FROM page_dwell GROUP BY visit_id),ranked AS(SELECT ms,ROW_NUMBER() OVER(ORDER BY ms) rn,COUNT(*) OVER() n FROM visits)
 SELECT COUNT(*) samples,COALESCE(SUM(ms),0) totalMs,AVG(ms) averageMs,AVG(CASE WHEN rn IN((n+1)/2,(n+2)/2) THEN ms END) medianMs FROM ranked`).get();
 Object.assign(total,db.prepare('SELECT COUNT(*) cards,COUNT(DISTINCT player_id) cardVisitors FROM card_views').get());
 const hours=db.prepare(`WITH ranked AS(SELECT *,ROW_NUMBER() OVER(PARTITION BY hour ORDER BY visible_ms) rn,COUNT(*) OVER(PARTITION BY hour) n FROM page_dwell)
 SELECT hour,COUNT(*) samples,SUM(visible_ms) totalMs,AVG(visible_ms) averageMs,AVG(CASE WHEN rn IN((n+1)/2,(n+2)/2) THEN visible_ms END) medianMs FROM ranked GROUP BY hour`).all();
 const cardHours=db.prepare('SELECT CAST(created_at/3600000 AS INTEGER) hour,COUNT(*) cards,COUNT(DISTINCT player_id) cardVisitors FROM card_views GROUP BY hour').all();
 const map=new Map(hours.map(row=>[row.hour,row]));for(const row of cardHours)map.set(row.hour,{...map.get(row.hour),...row});
 const cards=db.prepare('SELECT CAST(created_at/3600000 AS INTEGER) hour,spirit_id spiritId,COUNT(*) views,COUNT(DISTINCT player_id) visitors FROM card_views GROUP BY hour,spirit_id ORDER BY hour DESC,views DESC,spirit_id').all();
 const funnel=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='funnel_events'").get()?db.prepare('SELECT CAST(created_at/3600000 AS INTEGER) hour,channel,step,COUNT(*) count FROM funnel_events GROUP BY hour,channel,step ORDER BY hour DESC,channel,step').all():[];
 return {startedAt,total,hours:[...map.values()],cards,funnel,shareFlows:flowReport()};
}
