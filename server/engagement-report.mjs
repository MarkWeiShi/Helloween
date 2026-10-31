// Returns aggregates only; browser identities never leave the database host.
export function engagementSummary(db){
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
 return {startedAt,total,hours:[...map.values()],cards,funnel};
}
