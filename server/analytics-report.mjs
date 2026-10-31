// Self-contained so it can run against the live database through SSH.
export function analyticsReport(db, engagement, eventLabels={}) {
  const scalar = sql => db.prepare(sql).get().n;
  db.exec('BEGIN');
  try {
    const startedAt = db.prepare("SELECT value FROM analytics_metadata WHERE key='hourly_started_at'").get().value;
    const fetchedAt = new Date().toISOString();
    const events = db.prepare('SELECT event,SUM(count) count FROM analytics GROUP BY event ORDER BY event').all();
    const hourlyEvents = db.prepare('SELECT hour,event,count FROM analytics_hourly').all();
    const diagnosticEvents=['share_invite_api_ready','share_config_ready','share_config_failed','share_sdk_loaded','share_sdk_ready','share_sdk_failed','share_login_started','share_login_returned','share_picker_opened','share_picker_returned','share_fallback_offered'];
    const eventSince=name=>diagnosticEvents.includes(name)?engagement?.shareFlows?.analysis?.diagnostics?.startedAt:['share_page_opened','share_invite_created','share_copy_failed','share_copy_manual'].includes(name)?engagement?.shareFlows?.startedAt:engagement?.startedAt;
    const columns = [
      { key:'entered', label:'页面进入次数', tracked:true },
      { key:'visitors', label:'新增浏览器访客' },
      { key:'participants', label:'新增初始化玩家', tracked:true },
      { key:'accounts', label:'新增登录账户' },
      { key:'invitations', label:'新建邀请链接' },
      { key:'invitationVisits', label:'邀请访问（链接＋访客去重）' },
      { key:'recordings', label:'新增留存录音' },
    ];
    const extra=[['dwellSamples','停留时长样本数','samples'],['dwellTotal','总可见停留时长','totalMs'],['dwellAverage','平均可见停留时长','averageMs'],['dwellMedian','中位可见停留时长','medianMs'],['cardOpens','卡片打开次数','cards'],['cardVisitors','卡片独立查看访客','cardVisitors']];
    if(engagement)for(const [key,label,field] of extra)columns.push({key,label,since:engagement.startedAt??Infinity,unit:field.endsWith('Ms')?'duration':undefined});
    const labels = {character_selected:'角色选择次数',share_started:'创建分享事件',invite_responded:'邀请响应事件',story_read:'故事读完事件',hellotalk_clicked:'HelloTalk 外链点击',hellotalk_unlocked:'HelloTalk 解锁事件',wish_completed:'愿望完成事件',battle_completed:'对战完成事件'};
    Object.assign(labels,eventLabels);
    for (const name of new Set([...Object.keys(eventLabels),...events.map(x=>x.event),...hourlyEvents.filter(x=>x.event.startsWith('event:')).map(x=>x.event.slice(6))])) {
      if (name!=='entered') columns.push({key:'event:'+name,label:labels[name]||name,tracked:true,...(Object.hasOwn(eventLabels,name)?{since:eventSince(name)??Infinity}:{})});
    }
    const totals = {
      entered:events.find(x=>x.event==='entered')?.count||0,
      visitors:scalar('SELECT COUNT(*) n FROM players'),
      participants:scalar('SELECT COUNT(*) n FROM players WHERE initialized=1'),
      accounts:scalar('SELECT COUNT(*) n FROM accounts'),
      invitations:scalar('SELECT COUNT(*) n FROM invites'),
      invitationVisits:scalar('SELECT COUNT(*) n FROM invite_visits'),
      recordings:scalar('SELECT COUNT(*) n FROM reaction_audio'),
      ...Object.fromEntries(Object.keys(eventLabels).map(name=>['event:'+name,eventSince(name)==null?null:0])),
      ...Object.fromEntries(events.filter(x=>x.event!=='entered').map(x=>['event:'+x.event,x.count])),
    };
    if(engagement)for(const [key,,field] of extra)totals[key]=engagement.startedAt===null?null:engagement.total[field];
    const buckets = new Map();
    const bucket = hour => { if(!buckets.has(hour)) buckets.set(hour,{}); return buckets.get(hour); };
    for (const [key,table] of [['visitors','players'],['accounts','accounts'],['invitations','invites'],['invitationVisits','invite_visits'],['recordings','reaction_audio']]) {
      for(const item of db.prepare(`SELECT CAST(created_at/3600000 AS INTEGER) hour,COUNT(*) count FROM ${table} GROUP BY hour`).all()) bucket(item.hour)[key]=item.count;
    }
    for(const item of hourlyEvents) bucket(item.hour)[item.event==='initialized'?'participants':item.event==='event:entered'?'entered':item.event]=item.count;
    if(engagement)for(const item of engagement.hours)for(const [key,,field] of extra)bucket(item.hour)[key]=item[field]??(field==='averageMs'||field==='medianMs'?null:0);
    const currentHour = Math.floor(Date.parse(fetchedAt)/3600000);
    const firstHour = Math.min(Math.floor(startedAt/3600000),...buckets.keys());
    const rows = [];
    for(let hour=currentHour;hour>=firstHour;hour--) {
      const data=bucket(hour), tracked=hour*3600000>=startedAt;
      rows.push({hour,partial:hour===Math.floor(startedAt/3600000)||hour===Math.floor((engagement?.startedAt??Infinity)/3600000)||hour===Math.floor((engagement?.shareFlows?.startedAt??Infinity)/3600000),values:Object.fromEntries(columns.map(c=>[c.key,c.since!==undefined?(c.since===Infinity||hour<Math.floor(c.since/3600000)?null:data[c.key]??(c.key==='dwellAverage'||c.key==='dwellMedian'?null:0)):c.tracked&&!tracked?(hour===Math.floor(startedAt/3600000)?data[c.key]||0:null):data[c.key]||0]))});
    }
    return {fetchedAt,startedAt,source:'helloween / Tokyo primary',columns,totals,rows,engagementStartedAt:engagement?.startedAt??null,cards:engagement?.cards??[],funnel:engagement?.funnel??[],shareFlows:engagement?.shareFlows??{startedAt:null,rows:[],stages:[]}};
  } finally {db.exec('ROLLBACK');}
}
