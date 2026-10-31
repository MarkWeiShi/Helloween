// Self-contained: executed on the primary, returning aggregates only.
export function countryReport(db, buildReport, buildEngagement, selected = 'all') {
  if (selected !== 'all' && !/^[A-Z]{2}$/.test(selected)) throw new Error('Invalid country');
  const connection=db;
  connection.exec('BEGIN');
  db={prepare: sql=>connection.prepare(sql),exec:()=>{}};
  try {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='analytics_country_metadata'").get();
  const startedAt = exists ? db.prepare("SELECT value FROM analytics_country_metadata WHERE key='started_at'").get()?.value ?? null : null;
  const codes = exists ? db.prepare("SELECT country FROM analytics_country_records UNION SELECT country FROM analytics_country_hourly ORDER BY country").all().map(r=>r.country) : [];
  if (!codes.includes('ZZ')) codes.push('ZZ');
  const keys = {players:['id'],accounts:['subject'],invites:['id'],invite_visits:['invite_id','player_id'],reaction_audio:['invite_id','player_id'],page_dwell:['visit_id','hour'],card_views:['player_id','view_id'],funnel_events:['player_id','event_id'],share_flows:['id']};
  function scoped(country) {
    const views = {};
    for (const [table, fields] of Object.entries(keys)) {
      views[table] = exists
        ? `(SELECT origin.* FROM main.${table} origin LEFT JOIN analytics_country_records geo ON geo.kind='${table}' AND geo.record_key=json_array(${fields.map(k=>'origin.'+k).join(',')}) WHERE COALESCE(geo.country,'ZZ')='${country}')`
        : `(SELECT * FROM main.${table}${country==='ZZ'?'':' WHERE 0'})`;
    }
    // Historical/uninstrumented writes stay in unknown. They are never inferred
    // from a player's self-selected country or their subsequent IP address.
    const hours = exists ? (country === 'ZZ'
      ? `(SELECT h.hour,h.event,MAX(0,h.count-COALESCE(g.count,0)) count FROM main.analytics_hourly h LEFT JOIN (SELECT hour,event,SUM(count) count FROM analytics_country_hourly WHERE country<>'ZZ' GROUP BY hour,event) g ON g.hour=h.hour AND g.event=h.event)`
      : `(SELECT hour,event,count FROM analytics_country_hourly WHERE country='${country}')`)
      : `(SELECT * FROM main.analytics_hourly${country==='ZZ'?'':' WHERE 0'})`;
    views.analytics_hourly = hours;
    views.analytics = exists ? (country==='ZZ'
      ? `(SELECT a.event,MAX(0,a.count-COALESCE(g.count,0)) count FROM (SELECT event,SUM(count) count FROM main.analytics GROUP BY event) a LEFT JOIN (SELECT substr(event,7) event,SUM(count) count FROM analytics_country_hourly WHERE country<>'ZZ' AND event LIKE 'event:%' GROUP BY event) g ON a.event=g.event)`
      : `(SELECT event,0 count FROM main.analytics UNION ALL SELECT substr(event,7) event,SUM(count) count FROM analytics_country_hourly WHERE country='${country}' AND event LIKE 'event:%' GROUP BY event)`)
      : `(SELECT * FROM main.analytics${country==='ZZ'?'':' WHERE 0'})`;
    return {
      exec: sql => db.exec(sql),
      prepare: sql => db.prepare(sql.replace(/\b(FROM|JOIN)\s+(players|accounts|invites|invite_visits|reaction_audio|page_dwell|card_views|funnel_events|share_flows|analytics_hourly|analytics)\b/gi, (_, op, table) => `${op} ${views[table.toLowerCase()]}`)),
    };
  }
  const reports = new Map();
  function reportFor(country) {
    if(reports.has(country)) return reports.get(country);
    const source = country==='all' ? db : scoped(country);
    const report = buildReport(source, buildEngagement(source));
    if(country!=='all' && country!=='ZZ' && startedAt!==null){
      for(const r of report.rows){
        if(r.hour < Math.floor(startedAt/3600000))for(const c of report.columns)r.values[c.key]=null;
        if(r.hour===Math.floor(startedAt/3600000))r.partial=true;
      }
    }
    if (country !== 'all') {
      // Initialization belongs to the request that performed the transition.
      report.totals.participants = exists
        ? db.prepare("SELECT COUNT(*) n FROM main.players p LEFT JOIN analytics_country_records g ON g.kind='initialized' AND g.record_key=json_array(p.id) WHERE p.initialized=1 AND COALESCE(g.country,'ZZ')=?").get(country).n
        : country==='ZZ' ? db.prepare('SELECT COUNT(*) n FROM players WHERE initialized=1').get().n : 0;
    }
    reports.set(country,report);
    return report;
  }
  const report = reportFor(selected);
  return {...report, country: selected, countryStartedAt: startedAt, countryGroups: codes.map(code=>({code,totals:reportFor(code).totals}))};
  } finally { connection.exec('ROLLBACK'); }
}
