import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {ApiError} from './store.mjs';
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export function createKakaoWebhook(store,{adminKey=process.env.KAKAO_ADMIN_KEY||'',enabled=process.env.KAKAO_SHARE_WEBHOOK_ENABLED==='true'}={}){
 const active=!!adminKey&&enabled,db=store.db;
 db.exec('CREATE TABLE IF NOT EXISTS kakao_share_receipts(event_key TEXT PRIMARY KEY,flow_id TEXT NOT NULL,received_at INTEGER NOT NULL)');
 db.prepare("INSERT INTO engagement_metadata VALUES('kakao_webhook_active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(active?1:0);
 if(active)db.prepare("INSERT OR IGNORE INTO engagement_metadata VALUES('kakao_webhook_started_at',?)").run(store.now());
 const proof=(flow,invite)=>createHmac('sha256',adminKey).update('kakao-share-v1\n'+flow+'\n'+invite).digest('hex');
 return {
  active,
  callbackArgs(flow,invite){if(!active||typeof flow!=='string'||!/^[a-f0-9]{32}$/.test(flow))return undefined;return {flow_id:flow,invite_id:invite,proof:proof(flow,invite)};},
  authorize(req){if(!active)throw new ApiError(503,'Kakao share webhook is not enabled.');if(typeof req.headers.authorization!=='string'||!equal(req.headers.authorization,'KakaoAK '+adminKey))throw new ApiError(403,'Invalid webhook authorization.');},
  receive(body,resource){
   if(!active)throw new ApiError(503,'Kakao share webhook is not enabled.');
   const {flow_id:flow,invite_id:inviteId,proof:signature}=body;
   if(typeof resource!=='string'||!resource.length||resource.length>200||typeof flow!=='string'||!/^[a-f0-9]{32}$/.test(flow)||typeof inviteId!=='string'||!/^[\w-]{1,80}$/.test(inviteId)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!equal(signature,proof(flow,inviteId)))throw new ApiError(400,'Invalid webhook correlation.');
   const invitation=store.invite(inviteId);if(invitation.channel!=='kakao')throw new ApiError(400,'Wrong invitation channel.');
   const owner=invitation.senderId,eventKey=createHash('sha256').update(resource).digest('hex');
   return store.transaction(()=>{
    const existing=db.prepare('SELECT * FROM share_flows WHERE id=?').get(flow);
    const flowOwner=existing?(db.prepare('SELECT a.player_id FROM account_members m JOIN accounts a ON a.subject=m.subject WHERE m.player_id=?').get(existing.player_id)?.player_id||existing.player_id):owner;
    if(flowOwner!==owner)throw new ApiError(400,'Wrong flow owner.');
    if(existing&&(existing.channel!=='kakao'||(existing.invite_id&&existing.invite_id!==inviteId)))throw new ApiError(400,'Wrong share flow.');
    const receipt=db.prepare('INSERT OR IGNORE INTO kakao_share_receipts VALUES(?,?,?)').run(eventKey,flow,store.now());if(!receipt.changes){if(db.prepare('SELECT flow_id FROM kakao_share_receipts WHERE event_key=?').get(eventKey).flow_id!==flow)throw new ApiError(400,'Wrong webhook resource.');return {ok:true,counted:false};}
    db.prepare('INSERT OR IGNORE INTO share_flows VALUES(?,?,?,?,?)').run(flow,owner,'kakao',inviteId,store.now());db.prepare('UPDATE share_flows SET invite_id=COALESCE(invite_id,?) WHERE id=?').run(inviteId,flow);
    const prior=db.prepare("SELECT 1 FROM share_flow_events b JOIN funnel_events e ON e.player_id=b.player_id AND e.event_id=b.event_id WHERE b.flow_id=? AND e.step='share_send_confirmed' AND e.channel='kakao'").get(flow);if(prior)return {ok:true,counted:false};
    const event=randomBytes(16).toString('hex');db.prepare('INSERT INTO funnel_events VALUES(?,?,?,?,?,?)').run(owner,event,'share_send_confirmed','kakao',inviteId,store.now());db.prepare('INSERT INTO share_flow_events VALUES(?,?,?)').run(flow,owner,event);store.event('share_send_confirmed','kakao');return {ok:true,counted:true};
   });
  },
 };
}
