import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const port = Number(process.env.ANALYTICS_PORT || 8790);
import { engagementSummary } from '../server/engagement-report.mjs';
import { countryReport } from '../server/country-report.mjs';
import { analyticsReport } from '../server/analytics-report.mjs';
// Only aggregate data leaves the primary. No cookies, identities or recordings.
const query = country => `
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(process.env.DATABASE_PATH||'/data/boo.sqlite',{readOnly:true});
${engagementSummary.toString()}
${analyticsReport.toString()}
${countryReport.toString()}
try {console.log(JSON.stringify(countryReport(db,(source,engagement)=>analyticsReport(source,engagement,${JSON.stringify({...funnelEvents,recording_uploaded:'录音上传成功（累计）'})}),engagementSummary,${JSON.stringify(country)})));} finally {db.close();}`;
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const cache = new Map(), requests = new Map();
async function metrics(country) {
  const cached = cache.get(country);
  let pending = requests.get(country);
  if (cached && Date.now() - cached.time < 30000) return cached.data;
  if (!pending) pending = (async () => {
    const { stdout } = await run(process.env.FLY_BIN || 'fly', [
      'machine', 'exec', '867657ae710308', '-a', 'helloween',
      `node -e ${quote(query(country))}`, '--timeout', '40',
    ], { env: {...process.env,GODEBUG:'http2client=0'}, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const line = stdout.split('\n').find(line => line.startsWith('{'));
    if (!line) throw new Error('Missing aggregate response');
    const data = JSON.parse(line);
    cache.set(country, { time: Date.now(), data });
    return data;
  })().finally(() => { requests.delete(country); });
  requests.set(country, pending);
  return pending;
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WD Ghost · 每小时统计</title>
<style>body{font:15px/1.6 system-ui;margin:0;background:#f5f5f3;color:#20231f}main{max-width:1600px;margin:36px auto;padding:0 24px}header{display:flex;justify-content:space-between;align-items:center;gap:20px}h1{font-size:28px;margin:0}button,select{font:inherit;padding:8px 16px;border:1px solid #aaa;background:white;border-radius:6px;cursor:pointer}.note{color:#62665e;font-size:14px}.scroll{overflow:auto;max-height:65vh;border:1px solid #dedfd9;background:white;margin:16px 0}table{width:100%;border-collapse:separate;border-spacing:0;background:white;white-space:nowrap}th,td{padding:12px 16px;text-align:right;border-bottom:1px solid #dedfd9}th{background:#edf0e9;font-weight:600;position:sticky;top:0;z-index:2}td:first-child,th:first-child{text-align:left;position:sticky;left:0;background:#f9faf7;z-index:1}th:first-child{z-index:3}tr:last-child td{border-bottom:0}tr.partial td{background:#fff5df}tr.partial td:first-child{background:#fff5df}#error{color:#a52626}h2{font-size:20px;margin:26px 0 8px}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.muted{color:#92978c}</style>
<main><header><div><h1>WD Ghost 每小时统计</h1><div class="note">线上正式数据 · 东京主库 · 北京时间（UTC+8）</div></div><button id="refresh">刷新数据</button></header>
<p id="status" aria-live="polite">正在读取线上统计，首次连接可能需要约一分钟…</p><p id="error" role="alert"></p>
<div class="controls"><label for="country">国家（按 IP 分组）</label><select id="country"><option value="all">全部国家 · 汇总</option><option value="ZZ">未知 / 未采集</option></select><span id="country-coverage" class="note"></span></div>
<p class="note">国家来自操作发生时的 IP，可能受 VPN 或代理影响，不是玩家自选国家。历史未采集、内网及无法识别的地址归入“未知 / 未采集”。切换国家后，下方小时、卡片与累计统计同步筛选。</p>
<h2>国家分布（累计）</h2><div class="scroll"><table><thead id="country-head"></thead><tbody id="country-groups"></tbody></table></div>
<h2>逐小时明细</h2><div class="controls"><label for="date">日期（北京时间）</label><select id="date"><option value="all">全部日期</option></select><span id="coverage" class="note"></span></div>
<p class="note">每行表示该小时新增或发生的数量，时段为左闭右开，例如 11:00–12:00。当前小时持续更新。“—”表示此前没有小时记录；黄色行表示该小时有指标从中途开始采集。</p>
<div class="scroll"><table id="hourly"><thead id="hourly-head"></thead><tbody id="hours"></tbody></table></div>
<h2>角色卡片查看明细（按小时）</h2><div class="scroll"><table><thead><tr><th>小时（北京时间）</th><th>角色 ID</th><th>打开次数</th><th>独立查看访客</th></tr></thead><tbody id="card-details"></tbody></table></div>
<h2>分享与录音步骤</h2><div class="scroll"><table><thead><tr><th>小时（北京时间）</th><th>渠道</th><th>步骤</th><th>次数</th></tr></thead><tbody id="funnel-details"></tbody></table></div>
<h2>累计总数</h2><div class="scroll"><table><thead><tr><th>指标</th><th>累计数值</th></tr></thead><tbody id="totals"></tbody></table></div>
<p class="note">“新增登录账户”表示该小时首次建立的账户数，并非登录次数或在线人数。“新增浏览器访客”按浏览器标识创建时间统计，不是该小时活跃 UV 或精确设备数；更换浏览器、清理 Cookie 可能重复，包含测试访问。页面进入按 entered 事件统计，不是所有按钮点击。录音及邀请数据按当前留存记录的创建时间回溯，已删除记录不计入。新增初始化玩家从小时采集启用后记录。停留时长按前台可见时间累计，含进行中的访问；平均和中位数按页面访问计算，小时行只计算该小时片段。后台、锁屏及冻结不持续计时；每 15 秒上报，强制退出或断网可能丢失尾段。卡片打开不代表播放变身动画，独立访客在每个小时及角色内按浏览器身份去重，跨角色或跨小时不能直接相加。</p></main>
<script>
const fmt=n=>n===null?'—':Number(n).toLocaleString('zh-CN');
const format=(n,c)=>n===null||n===undefined?'—':c.unit==='duration'?(Number(n)/1000).toLocaleString('zh-CN',{maximumFractionDigits:1})+' 秒':fmt(n);
const bj=ms=>new Date(ms+8*3600000).toISOString().slice(0,16).replace('T',' ');
const cumulative={entered:'页面进入次数',visitors:'浏览器访客标识（设备近似）',participants:'已初始化玩家',accounts:'登录账户',invitations:'邀请链接',invitationVisits:'邀请访问（链接＋访客去重）',recordings:'留存录音'};
const funnelLabels=${JSON.stringify(funnelEvents)};
let report;
let regionNames;try{regionNames=new Intl.DisplayNames(['zh-CN'],{type:'region'})}catch{}
const countryName=code=>code==='ZZ'?'未知 / 未采集':(regionNames?.of(code)||code)+' ('+code+')';
function row(values,tag='td'){const tr=document.createElement('tr');for(const value of values){const td=document.createElement(tag);td.textContent=value;tr.append(td)}return tr}
function renderHours(){if(!report)return;const date=document.querySelector('#date').value;document.querySelector('#hourly-head').replaceChildren(row(['小时区间（北京时间）',...report.columns.map(c=>c.label)],'th'));document.querySelector('#funnel-details').replaceChildren(...(report.funnel||[]).filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>row([bj(r.hour*3600000),r.channel,funnelLabels[r.step]||r.step,fmt(r.count)])));document.querySelector('#card-details').replaceChildren(...report.cards.filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>row([bj(r.hour*3600000),r.spiritId,fmt(r.views),fmt(r.visitors)])));document.querySelector('#hours').replaceChildren(...report.rows.filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>{const start=bj(r.hour*3600000),end=bj((r.hour+1)*3600000);const tr=row([start+'–'+end.slice(11)+(r.hour===report.rows[0].hour?'（进行中）':'')+(r.partial?' *':''),...report.columns.map(c=>format(r.values[c.key],c))]);if(r.partial)tr.className='partial';return tr}));}
async function refresh(){const button=document.querySelector('#refresh');button.disabled=true;document.querySelector('#country').disabled=true;document.querySelector('#error').textContent='';try{const response=await fetch('/metrics?country='+encodeURIComponent(document.querySelector('#country').value));if(!response.ok)throw Error('线上数据读取失败，请稍后刷新。');report=await response.json();const countrySelect=document.querySelector('#country');countrySelect.replaceChildren(...['all',...report.countryGroups.map(g=>g.code)].map(code=>{const option=document.createElement('option');option.value=code;option.textContent=code==='all'?'全部国家 · 汇总':countryName(code);return option}));countrySelect.value=report.country;document.querySelector('#country-coverage').textContent=report.countryStartedAt?'IP 国家采集启用：'+new Date(report.countryStartedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'IP 国家采集尚未上线，历史数据归入未知';document.querySelector('#country-head').replaceChildren(row(['国家（IP）',...report.columns.map(c=>cumulative[c.key]||c.label)],'th'));document.querySelector('#country-groups').replaceChildren(...report.countryGroups.map(g=>row([countryName(g.code),...report.columns.map(c=>format(g.totals[c.key],c))])));document.querySelector('#totals').replaceChildren(...report.columns.map(c=>row([cumulative[c.key]||c.label,format(report.totals[c.key],c)])));const select=document.querySelector('#date'),selected=select.value;const options=['all',...new Set(report.rows.map(r=>bj(r.hour*3600000).slice(0,10)))];select.replaceChildren(...options.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value==='all'?'全部日期':value;return option}));if(options.includes(selected))select.value=selected;document.querySelector('#coverage').textContent='事件小时采集启用：'+new Date(report.startedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});document.querySelector('#coverage').textContent+=' · 停留/卡片采集：'+(report.engagementStartedAt?new Date(report.engagementStartedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未启用');renderHours();document.querySelector('#status').textContent='数据读取时间：'+new Date(report.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间） · 每 60 秒刷新';}catch(error){document.querySelector('#error').textContent=error.message;}finally{button.disabled=false;document.querySelector('#country').disabled=false}}
document.querySelector('#country').onchange=refresh;document.querySelector('#date').onchange=renderHours;document.querySelector('#refresh').onclick=refresh;refresh();setInterval(refresh,60000);
</script></html>`;

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
    res.writeHead(403).end(); return;
  }
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/metrics') {
    const country=url.searchParams.get('country')||'all';
    if(country!=='all'&&!/^[A-Z]{2}$/.test(country)){res.writeHead(400).end();return;}
    try { const data = await metrics(country); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }
    catch { res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Could not read production aggregates'})); }
  } else if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  } else res.writeHead(404).end();
}).listen(port, '127.0.0.1', () => console.log(`Analytics dashboard: http://127.0.0.1:${port}`));
