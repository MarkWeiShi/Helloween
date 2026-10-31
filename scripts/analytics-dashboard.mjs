import {deflateSync} from 'node:zlib';
import {funnelEvents} from '../shared/funnel-events.mjs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const port = Number(process.env.ANALYTICS_PORT || 8790);
const localDatabase = process.env.ANALYTICS_DATABASE_PATH;
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
    // Keep the SSH command below Fly's argument-size boundary. The payload is
    // this trusted, read-only aggregate query; it contains no database records.
    const compressed=deflateSync(Buffer.from(query(country))).toString('base64');
    const remoteQuery="eval(require('node:zlib').inflateSync(Buffer.from('"+compressed+"','base64')).toString())";
    const args = localDatabase ? ['-e',query(country)] : [
      'machine', 'exec', '867657ae710308', '-a', 'helloween',
      `node -e ${quote(remoteQuery)}`, '--timeout', '40',
    ];
    const { stdout } = await run(localDatabase ? process.execPath : process.env.FLY_BIN || 'fly', args,
      { env: {...process.env,...(localDatabase?{DATABASE_PATH:localDatabase}:{}),GODEBUG:'http2client=0'}, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
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
<main><header><div><h1>WD Ghost 每小时统计</h1><div class="note">${localDatabase?'本地审核数据 · 非线上统计':'线上正式数据 · 东京主库'} · 北京时间（UTC+8）</div></div><button id="refresh">刷新数据</button></header>
<p id="status" aria-live="polite">正在读取线上统计，首次连接可能需要约一分钟…</p><p id="error" role="alert"></p>
<div class="controls"><label for="country">国家（按 IP 分组）</label><select id="country"><option value="all">全部国家 · 汇总</option><option value="ZZ">未知 / 未采集</option></select><span id="country-coverage" class="note"></span></div>
<p class="note">国家来自操作发生时的 IP，可能受 VPN 或代理影响，不是玩家自选国家。历史未采集、内网及无法识别的地址归入“未知 / 未采集”。切换国家后，下方小时、卡片与累计统计同步筛选。</p>
<div class="controls"><label for="date">日期（北京时间）</label><select id="date"><option value="all">全部日期</option></select><span id="coverage" class="note"></span></div>
<section id="sns-analysis"><h2>各 SNS 完成与流失分析</h2><div class="controls"><label for="sns-channel">分享渠道</label><select id="sns-channel"><option value="all">全部 SNS / 复制链接</option></select><span class="note">与日期、国家筛选联动；按流程启动小时归组。</span></div>
<p class="note" id="sns-boundary"></p><p class="note">下表统计流程数。确认发送仅代表 LINE SDK 回调；其他渠道的可观测目标是复制或跳转出口，不是平台内发送。状态互斥；曾到达目标后又失败，会保留目标到达数，并把最后状态列为失败。无后续记录不能确认放弃：30 分钟内记为暂留，超过 30 分钟且无已知出口记为疑似流失。断网、关闭页面、埋点丢失或微信菜单分享都可能造成无后续记录。</p>
<div class="scroll"><table><thead><tr><th>SNS 渠道</th><th>流程数</th><th>可观测目标</th><th>目标到达数 / 比例</th><th>确认发送（LINE）</th><th>复制 / 跳转（发送未知）</th><th>明确取消</th><th>最后事件失败</th><th>暂留 &lt;30 分钟</th><th>疑似流失 ≥30 分钟</th></tr></thead><tbody id="sns-summary"></tbody></table></div>
<h3>按各渠道实际步骤分析（逐小时）</h3><p class="note">到达数只计算收到该步骤事件的流程，不补推缺失事件。“较上步续进”＝同时记录上一步与本步的流程 ÷ 上一步流程；“未记录本步”包含暂留、失败、取消、埋点缺失及替代出口，不能直接算放弃。LINE 复制链接属于替代出口，未收到发送回调不代表未发送。</p>
<div class="scroll"><table><thead><tr><th>启动小时</th><th>SNS 渠道</th><th>步骤</th><th>本步到达</th><th>上步到达</th><th>较上步续进</th><th>上步未记录本步</th><th>其中已有替代出口</th><th>其中疑似流失</th></tr></thead><tbody id="sns-progress"></tbody></table></div>
<h3>最终记录状态与停留步骤（逐小时）</h3><div class="scroll"><table><thead><tr><th>启动小时</th><th>SNS 渠道</th><th>最终记录状态</th><th>最后到达的渠道步骤</th><th>最后上报事件</th><th>流程数</th></tr></thead><tbody id="sns-endings"></tbody></table></div></section>
<h2>国家分布（累计）</h2><div class="scroll"><table><thead id="country-head"></thead><tbody id="country-groups"></tbody></table></div>
<h2>逐小时明细</h2>
<p class="note">每行表示该小时新增或发生的数量，时段为左闭右开，例如 11:00–12:00。当前小时持续更新。“—”表示此前没有小时记录；黄色行表示该小时有指标从中途开始采集。</p>
<div class="scroll"><table id="hourly"><thead id="hourly-head"></thead><tbody id="hours"></tbody></table></div>
<h2>角色卡片查看明细（按小时）</h2><div class="scroll"><table><thead><tr><th>小时（北京时间）</th><th>角色 ID</th><th>打开次数</th><th>独立查看访客</th></tr></thead><tbody id="card-details"></tbody></table></div>
<h2>分享与录音步骤</h2><div class="scroll"><table><thead><tr><th>小时（北京时间）</th><th>渠道</th><th>步骤</th><th>次数</th></tr></thead><tbody id="funnel-details"></tbody></table></div>
<h2>分享流程最后记录环节（按启动小时）</h2><p class="note" id="flow-coverage"></p>
<p class="note">流程按首次收到事件的小时和 IP 国家归组，后续步骤保持关联。“最远完成步骤”不会因失败或乱序上报倒退；“最后上报事件”按服务端接收顺序显示。没有后续记录不代表取消。复制、手动复制操作或平台跳转均不代表实际发送；仅 LINE SDK 成功回调记为确认发送。好友访问单独关联原流程，可能跨小时更新。手动复制只记录浏览器 copy 事件，无法确认其他 App 的粘贴或发送。历史无流程编号的事件不回填。</p>
<div class="scroll"><table><thead><tr><th>流程启动小时（北京时间）</th><th>渠道</th><th>最远完成步骤</th><th>最后上报事件</th><th>流程数</th><th>独立发起访客</th><th>有好友访问的流程</th><th>好友访问（链接＋访客去重）</th></tr></thead><tbody id="flow-last"></tbody></table></div>
<h2>分享步骤到达比例（按启动小时）</h2><p class="note">每个步骤在同一流程内只计一次。比例＝到达该步骤的流程数 ÷ 本小时该渠道已记录流程数；各步骤比例不能相加。未收到事件时不推断已完成。独立访客不能跨行直接相加。</p>
<div class="scroll"><table><thead><tr><th>流程启动小时（北京时间）</th><th>渠道</th><th>步骤</th><th>到达流程数</th><th>独立发起访客</th><th>已记录流程数</th><th>到达比例</th></tr></thead><tbody id="flow-stages"></tbody></table></div>
<h2>累计总数</h2><div class="scroll"><table><thead><tr><th>指标</th><th>累计数值</th></tr></thead><tbody id="totals"></tbody></table></div>
<p class="note">“新增登录账户”表示该小时首次建立的账户数，并非登录次数或在线人数。“新增浏览器访客”按浏览器标识创建时间统计，不是该小时活跃 UV 或精确设备数；更换浏览器、清理 Cookie 可能重复，包含测试访问。页面进入按 entered 事件统计，不是所有按钮点击。录音及邀请数据按当前留存记录的创建时间回溯，已删除记录不计入。新增初始化玩家从小时采集启用后记录。停留时长按前台可见时间累计，含进行中的访问；平均和中位数按页面访问计算，小时行只计算该小时片段。后台、锁屏及冻结不持续计时；每 15 秒上报，强制退出或断网可能丢失尾段。卡片打开不代表播放变身动画，独立访客在每个小时及角色内按浏览器身份去重，跨角色或跨小时不能直接相加。</p></main>
<script>
const fmt=n=>n===null?'—':Number(n).toLocaleString('zh-CN');
const format=(n,c)=>n===null||n===undefined?'—':c.unit==='duration'?(Number(n)/1000).toLocaleString('zh-CN',{maximumFractionDigits:1})+' 秒':fmt(n);
const bj=ms=>new Date(ms+8*3600000).toISOString().slice(0,16).replace('T',' ');
const cumulative={entered:'页面进入次数',visitors:'浏览器访客标识（设备近似）',participants:'已初始化玩家',accounts:'登录账户',invitations:'邀请链接',invitationVisits:'邀请访问（链接＋访客去重）',recordings:'留存录音'};
const funnelLabels={...${JSON.stringify(funnelEvents)},friend_visited:'好友打开邀请链接',not_recorded:'尚无完成步骤'};
const snsStatuses={confirmed:'LINE SDK 确认发送',copied:'已复制，发送未知',handoff:'已跳转，发送未知',cancelled:'明确取消',failed:'最后事件失败',pending:'暂留（不足30分钟）',inactive:'疑似流失（至少30分钟无后续）'};
const percent=(n,d)=>d?(n/d*100).toLocaleString('zh-CN',{maximumFractionDigits:1})+'%':'—';
function renderSns(date){
 const a=report.shareFlows?.analysis,select=document.querySelector('#sns-channel'),selected=select.value;
 const definitions=a?.channels||[];select.replaceChildren(...[{channel:'all',name:'全部 SNS / 复制链接'},...definitions].map(c=>{const o=document.createElement('option');o.value=c.channel;o.textContent=c.name;return o}));if(selected==='all'||definitions.some(c=>c.channel===selected))select.value=selected;
 const channel=select.value,match=r=>(channel==='all'||channel===r.channel)&&(date==='all'||bj(r.hour*3600000).slice(0,10)===date),name=c=>definitions.find(d=>d.channel===c)?.name||c;
 document.querySelector('#sns-boundary').textContent=!a?'当前数据尚无渠道分析结果。':channel==='all'?'X / Facebook：点击 → 生成链接 → 跳转。复制：点击 → 打开页面 → 生成链接 → 展示 → 复制。其他 SNS：点击 → 生成链接 → 展示 → 跳转或复制；LINE 再观察 SDK 确认发送。':definitions.find(d=>d.channel===channel).boundary;
 document.querySelector('#sns-summary').replaceChildren(...definitions.filter(c=>channel==='all'||c.channel===channel).map(c=>{const rows=a.summary.filter(r=>r.channel===c.channel&&match(r)),sum=k=>rows.reduce((n,r)=>n+r[k],0),total=sum('flows'),goal=c.channel==='line'?'SDK 确认发送':c.channel==='copy'?'复制成功':'分享出口（非发送）';return row([c.name,fmt(total),goal,fmt(sum('goalReached'))+' / '+percent(sum('goalReached'),total),c.channel==='line'?fmt(sum('confirmed')):'—',fmt(sum('copied'))+' / '+fmt(sum('handoff')),fmt(sum('cancelled')),fmt(sum('failed')),fmt(sum('pending')),fmt(sum('inactive'))])}));
 const order=(x,y)=>y.hour-x.hour||x.channel.localeCompare(y.channel)||(x.order??0)-(y.order??0);
 document.querySelector('#sns-progress').replaceChildren(...(a?.steps||[]).filter(match).sort(order).map(r=>row([bj(r.hour*3600000),name(r.channel),String(r.order+1)+'. '+r.label,fmt(r.reached),r.order?fmt(r.previous):'—',r.order?fmt(r.continued)+' / '+percent(r.continued,r.previous):'—',r.order?fmt(r.notContinued):'—',r.order?fmt(r.alternativeExit):'—',r.order?fmt(r.inactive):'—'])));
 document.querySelector('#sns-endings').replaceChildren(...(a?.endings||[]).filter(match).sort(order).map(r=>row([bj(r.hour*3600000),name(r.channel),snsStatuses[r.status],r.lastStep,funnelLabels[r.lastEvent]||r.lastEvent,fmt(r.flows)])));
}
function renderFlows(date){
 const flows=report.shareFlows||{startedAt:null,rows:[],stages:[]};
 const inDate=r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date;
 document.querySelector('#flow-coverage').textContent=flows.startedAt?'流程采集启用：'+new Date(flows.startedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'流程采集尚未上线；线上旧数据无法还原流程。';
 document.querySelector('#flow-last').replaceChildren(...flows.rows.filter(inDate).map(r=>row([bj(r.hour*3600000),r.channel,funnelLabels[r.furthest]||r.furthest,funnelLabels[r.lastEvent]||r.lastEvent,fmt(r.flows),fmt(r.visitors),fmt(r.visitedFlows),fmt(r.friendVisits)])));
 document.querySelector('#flow-stages').replaceChildren(...flows.stages.filter(inDate).map(r=>row([bj(r.hour*3600000),r.channel,funnelLabels[r.step]||r.step,fmt(r.flows),fmt(r.visitors),fmt(r.totalFlows),(r.totalFlows?r.flows/r.totalFlows*100:0).toLocaleString('zh-CN',{maximumFractionDigits:1})+'%'])));
}
let report;
let regionNames;try{regionNames=new Intl.DisplayNames(['zh-CN'],{type:'region'})}catch{}
const countryName=code=>code==='ZZ'?'未知 / 未采集':(regionNames?.of(code)||code)+' ('+code+')';
function row(values,tag='td'){const tr=document.createElement('tr');for(const value of values){const td=document.createElement(tag);td.textContent=value;tr.append(td)}return tr}
function renderHours(){if(!report)return;const date=document.querySelector('#date').value;renderFlows(date);renderSns(date);document.querySelector('#hourly-head').replaceChildren(row(['小时区间（北京时间）',...report.columns.map(c=>c.label)],'th'));document.querySelector('#funnel-details').replaceChildren(...(report.funnel||[]).filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>row([bj(r.hour*3600000),r.channel,funnelLabels[r.step]||r.step,fmt(r.count)])));document.querySelector('#card-details').replaceChildren(...report.cards.filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>row([bj(r.hour*3600000),r.spiritId,fmt(r.views),fmt(r.visitors)])));document.querySelector('#hours').replaceChildren(...report.rows.filter(r=>date==='all'||bj(r.hour*3600000).slice(0,10)===date).map(r=>{const start=bj(r.hour*3600000),end=bj((r.hour+1)*3600000);const tr=row([start+'–'+end.slice(11)+(r.hour===report.rows[0].hour?'（进行中）':'')+(r.partial?' *':''),...report.columns.map(c=>format(r.values[c.key],c))]);if(r.partial)tr.className='partial';return tr}));}
async function refresh(){const button=document.querySelector('#refresh');button.disabled=true;document.querySelector('#country').disabled=true;document.querySelector('#error').textContent='';try{const response=await fetch('/metrics?country='+encodeURIComponent(document.querySelector('#country').value));if(!response.ok)throw Error('线上数据读取失败，请稍后刷新。');report=await response.json();const countrySelect=document.querySelector('#country');countrySelect.replaceChildren(...['all',...report.countryGroups.map(g=>g.code)].map(code=>{const option=document.createElement('option');option.value=code;option.textContent=code==='all'?'全部国家 · 汇总':countryName(code);return option}));countrySelect.value=report.country;document.querySelector('#country-coverage').textContent=report.countryStartedAt?'IP 国家采集启用：'+new Date(report.countryStartedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'IP 国家采集尚未上线，历史数据归入未知';document.querySelector('#country-head').replaceChildren(row(['国家（IP）',...report.columns.map(c=>cumulative[c.key]||c.label)],'th'));document.querySelector('#country-groups').replaceChildren(...report.countryGroups.map(g=>row([countryName(g.code),...report.columns.map(c=>format(g.totals[c.key],c))])));document.querySelector('#totals').replaceChildren(...report.columns.map(c=>row([cumulative[c.key]||c.label,format(report.totals[c.key],c)])));const select=document.querySelector('#date'),selected=select.value;const options=['all',...new Set(report.rows.map(r=>bj(r.hour*3600000).slice(0,10)))];select.replaceChildren(...options.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value==='all'?'全部日期':value;return option}));if(options.includes(selected))select.value=selected;document.querySelector('#coverage').textContent='事件小时采集启用：'+new Date(report.startedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});document.querySelector('#coverage').textContent+=' · 停留/卡片采集：'+(report.engagementStartedAt?new Date(report.engagementStartedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未启用');renderHours();document.querySelector('#status').textContent='数据读取时间：'+new Date(report.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间） · 每 60 秒刷新';}catch(error){document.querySelector('#error').textContent=error.message;}finally{button.disabled=false;document.querySelector('#country').disabled=false}}
document.querySelector('#sns-channel').onchange=renderHours;document.querySelector('#country').onchange=refresh;document.querySelector('#date').onchange=renderHours;document.querySelector('#refresh').onclick=refresh;refresh();setInterval(refresh,60000);
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
