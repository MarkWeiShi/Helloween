import {api} from './api';
import {t,msg} from '../shared/i18n.mjs';
type Stat = {spiritId:string;score:number;samples:number;updatedAt:number};
let stats:Stat[] = [], loaded=false, pending:Promise<void>|undefined;
export function worldScareLabel(id:string) {
  const stat=stats.find(s=>s.spiritId===id);
  return stat ? msg`World Scariness ${stat.score} / 100` : (loaded?t('No valid global samples yet'):t('Loading global score…'));
}
function paint() {
  document.querySelectorAll<HTMLElement>('[data-reaction-spirit]').forEach(meter=>{
    const id=meter.dataset.reactionSpirit!,stat=stats.find(s=>s.spiritId===id);
    const label=meter.querySelector<HTMLElement>('[data-world-scariness]');
    if(label)label.textContent=worldScareLabel(id);
    const progress=meter.querySelector('progress');
    if(progress){progress.hidden=!stat;if(stat)progress.value=stat.score;}
    const detail=meter.querySelector<HTMLElement>('[data-world-samples]');
    if(detail)detail.textContent=stat ? `${msg`Participants: ${stat.samples}`} · ${stat.samples<5?t('Small sample · preliminary score'):t('Average score')}` : '';
  });
}
export function refreshGlobalScares() {
  if(pending)return pending;
  pending=api<{stats:Stat[]}>('/character-scares').then(data=>{stats=data.stats;loaded=true;paint();}).catch(()=>{
    document.querySelectorAll<HTMLElement>('[data-world-samples]').forEach(el=>{el.textContent=t('Global score unavailable · retrying');});
  }).finally(()=>{pending=undefined;});
  return pending;
}
setInterval(()=>{if(!document.hidden && document.querySelector('[data-reaction-spirit]'))void refreshGlobalScares();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshGlobalScares();});
export async function submitGlobalScare(spirit:string,body:unknown):Promise<boolean> {
  for(let attempt=0;;attempt++){
    try {const result=await api<{counted:boolean}>(`/spirits/${spirit}/scare`,body);await pending;await refreshGlobalScares();return result.counted;}
    catch(error){if(attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}
  }
}
