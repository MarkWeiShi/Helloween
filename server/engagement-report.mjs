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
   if(!flows.has(e.id))flows.set(e.id,{hour:Math.floor(e.flow_at/3600000),channel:e.channel,player:e.player_id,steps:new Set(),furthest:'not_recorded',lastEvent:'not_recorded',friends:e.friend_visits});
   const f=flows.get(e.id);if(!e.step)continue;f.steps.add(e.step);f.lastEvent=e.step;
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
  const clean=g=>{const {players,...rest}=g;return {...rest,visitors:players.size};};
  return {startedAt,rows:[...groups.values()].map(clean).sort((a,b)=>b.hour-a.hour||a.channel.localeCompare(b.channel)),stages:[...stageGroups.values()].map(g=>({...clean(g),totalFlows:denominators.get(JSON.stringify([g.hour,g.channel]))})).sort((a,b)=>b.hour-a.hour||a.channel.localeCompare(b.channel)||a.step.localeCompare(b.step))};
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
