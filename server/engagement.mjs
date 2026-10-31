import {funnelEvents} from '../shared/funnel-events.mjs';
import {CHANNELS} from '../shared/rules.mjs';
import {ApiError} from './store.mjs';
import {previewTransformations} from '../shared/preview-transformations.mjs';
export function createEngagement(store){
 const db=store.db,validId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value),bad=()=>{throw new ApiError(400,'Invalid analytics sample.');};
 db.exec(`CREATE TABLE IF NOT EXISTS funnel_events(player_id TEXT NOT NULL REFERENCES players(id),event_id TEXT NOT NULL,step TEXT NOT NULL,channel TEXT NOT NULL,invite_id TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(player_id,event_id));
 CREATE TABLE IF NOT EXISTS engagement_metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS page_dwell(player_id TEXT NOT NULL REFERENCES players(id),visit_id TEXT NOT NULL,hour INTEGER NOT NULL,visible_ms INTEGER NOT NULL,PRIMARY KEY(visit_id,hour));
 CREATE TABLE IF NOT EXISTS card_views(player_id TEXT NOT NULL REFERENCES players(id),view_id TEXT NOT NULL,spirit_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(player_id,view_id));
 CREATE INDEX IF NOT EXISTS dwell_hour ON page_dwell(hour);
 CREATE INDEX IF NOT EXISTS card_views_time ON card_views(created_at,spirit_id);`);
 db.prepare("INSERT OR IGNORE INTO engagement_metadata VALUES('started_at',?)").run(store.now());
 const spirits=new Set([...store.catalog.spirits.map(s=>s.id),...Object.values(previewTransformations)]);
 return function record(playerId,body){
  const now=store.now();
  if(body.kind==='funnel'){
   if(!validId(body.eventId)||!Object.hasOwn(funnelEvents,body.step))bad();
   let channel=body.channel||'exploration';
   if(body.inviteId!==undefined){const invitation=store.invite(body.inviteId);channel=invitation.channel;}
   if(channel!=='exploration'&&!CHANNELS.includes(channel))bad();
   if(body.step==='share_send_confirmed'&&(channel!=='line'||!body.inviteId))bad();
   if(body.spiritId!==undefined&&!spirits.has(body.spiritId))bad();
   return store.transaction(()=>{const result=db.prepare('INSERT OR IGNORE INTO funnel_events VALUES(?,?,?,?,?,?)').run(playerId,body.eventId,body.step,channel,body.inviteId||null,now);if(result.changes)store.event(body.step,channel);return {ok:true,counted:result.changes>0};});
  }
  if(body.kind==='card'){
   if(!validId(body.viewId)||!spirits.has(body.spiritId))bad();
   db.prepare('INSERT OR IGNORE INTO card_views VALUES(?,?,?,?)').run(playerId,body.viewId,body.spiritId,now);return {ok:true};
  }
  if(body.kind!=='dwell'||!validId(body.visitId)||!Number.isSafeInteger(body.openedAt)||body.openedAt>now+60000||body.openedAt<now-7*86400000||!Array.isArray(body.hours)||!body.hours.length||body.hours.length>168)bad();
  const seen=new Set();let total=0;
  for(const item of body.hours){if(!Array.isArray(item)||item.length!==2)bad();const [hour,ms]=item;if(!Number.isSafeInteger(hour)||!Number.isSafeInteger(ms)||ms<0||ms>3600000||hour<Math.floor(body.openedAt/3600000)-1||hour>Math.floor((now+60000)/3600000)||seen.has(hour))bad();seen.add(hour);total+=ms;}
  if(total>Math.max(0,now-body.openedAt)+60000)bad();
  return store.transaction(()=>{for(const [hour,ms] of body.hours)db.prepare('INSERT INTO page_dwell VALUES(?,?,?,?) ON CONFLICT(visit_id,hour) DO UPDATE SET visible_ms=MAX(visible_ms,excluded.visible_ms)').run(playerId,body.visitId,hour,ms);return {ok:true};});
 };
}
