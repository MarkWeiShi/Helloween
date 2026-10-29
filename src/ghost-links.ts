import {api,escape as e} from './api';
import {t,locale} from './i18n';
import type {Catalog,Player} from './types';
export type GhostLink={inviteId:string;spiritId:string;createdAt:number;friendName:string|null;visits:number;recordings:{receiverId:string;name:string;durationMs:number;createdAt:number}[]};
export function linksPage(player:Player) {
 return `<section class="ghost-links-page"><header class="ghost-links-heading"><div><p class="ghost-eyebrow">${e(t('A little fright, saved for you'))}</p><p>${e(t('Every ghost. Every invitation. The first five voices, just for you.'))}</p></div><a class="button secondary" href="/">${e(t('Explore'))}</a></header><div class="ghost-account"><span>${e(player.account?t('Your links are saved to your account.'):t('These links belong to this browser. Sign in to keep them across devices.'))}</span><button class="button secondary" data-action="${player.account?'signout':'signin'}">${e(t(player.account?'Sign out':'Sign in'))}</button></div><div class="ghost-links-toolbar"><label>${e(t('Filter by ghost'))}<select data-ghost-filter><option value="">${e(t('All ghosts'))}</option></select></label><button class="button text-button" data-links-refresh>${e(t('Refresh'))}</button></div><p data-links-status role="status"></p><div class="ghost-links-grid" data-links-grid></div><button class="button secondary" data-links-more hidden>${e(t('Load more links'))}</button></section>`;
}
export function mountLinks(root:HTMLElement,catalog:Catalog) {
 let links:GhostLink[]=[],spirits:string[]=[],offset=0,busy=false,dead=false;
 const grid=root.querySelector<HTMLElement>('[data-links-grid]')!,status=root.querySelector<HTMLElement>('[data-links-status]')!,filter=root.querySelector<HTMLSelectElement>('[data-ghost-filter]')!,more=root.querySelector<HTMLButtonElement>('[data-links-more]')!;
 const date=(value:number)=>new Date(value).toLocaleString(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function draw() {
  const options=spirits;const chosen=filter.value;
  filter.innerHTML=`<option value="">${e(t('All ghosts'))}</option>`+options.map(id=>`<option value="${e(id)}">${e(catalog.spirits.find(s=>s.id===id)?.name || id)}</option>`).join('');filter.value=chosen;
  const visible=links;
  grid.innerHTML=visible.map(link=>{const spirit=catalog.spirits.find(s=>s.id===link.spiritId);return `<article class="ghost-link-card"><header>${spirit?.art?`<img src="${e(catalog.assetOrigin+spirit.art.thumb)}" alt="" width="72" height="72">`:''}<div><h2>${e(spirit?.name || link.spiritId)}</h2><p>${e(link.friendName || t('An invitation to a friend'))}</p><small>${e(date(link.createdAt))}</small></div><strong class="ghost-link-count">${link.recordings.length}<span>/5</span></strong></header><div class="ghost-link-meta"><span>${link.visits} ${e(t('visits'))}</span><a href="/i/${e(link.inviteId)}" target="_blank" rel="noopener">${e(t('Open invitation'))} ↗</a><button class="text-button" data-copy-invite="${e(link.inviteId)}">${e(t('Copy link'))}</button></div><ol class="ghost-voice-slots">${Array.from({length:5},(_,i)=>{const r=link.recordings[i];return `<li class="${r?'filled':'waiting'}"><span class="voice-number">${String(i+1).padStart(2,'0')}</span>${r?`<div class="voice-detail"><div><strong>${e(r.name)}</strong><small>${r.durationMs/1000}s · ${e(date(r.createdAt))}</small></div><audio controls preload="none" aria-label="${e(r.name)} · ${e(t('Voice reaction'))}" src="/api/invites/${e(link.inviteId)}/audio/${e(r.receiverId)}"></audio></div>`:`<span>${e(t('Waiting for a friend’s voice'))}</span>`}</li>`;}).join('')}</ol></article>`;}).join('');
  if(!links.length)grid.innerHTML=`<div class="ghost-links-empty"><span aria-hidden="true">👻</span><h2>${e(t('Your first Boo is waiting'))}</h2><p>${e(t('Choose a ghost and share an invitation. Your friends’ voices will appear here.'))}</p><a class="button primary" href="/">${e(t('Find a ghost'))}</a></div>`;
  grid.querySelectorAll<HTMLButtonElement>('[data-copy-invite]').forEach(button=>button.onclick=async()=>{const url=new URL('/i/'+button.dataset.copyInvite,location.origin).href;try{await navigator.clipboard.writeText(url);status.textContent=t('Link copied.');}catch{status.textContent=url;}});
  grid.querySelectorAll('audio').forEach(audio=>audio.onplay=()=>grid.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));
 }
 async function load(reset=false) {
  if(busy)return;busy=true;filter.disabled=true;more.disabled=true;status.textContent=t('Loading your ghost links…');
  try {const data=await api<{links:GhostLink[];hasMore:boolean;spirits:string[]}>(`/my-links?offset=${reset?0:offset}&spirit=${encodeURIComponent(filter.value)}`);if(dead)return;spirits=data.spirits;links=reset?data.links:[...links,...data.links];offset=links.length;more.hidden=!data.hasMore;draw();status.textContent='';}
  catch(error){if(!dead)status.textContent=(error as Error).message;}
  finally{busy=false;filter.disabled=false;more.disabled=false;}
 }
 filter.onchange=()=>void load(true);more.onclick=()=>void load();root.querySelector<HTMLButtonElement>('[data-links-refresh]')!.onclick=()=>void load(true);void load();
 return ()=>{dead=true;grid.querySelectorAll('audio').forEach(audio=>audio.pause());};
}
