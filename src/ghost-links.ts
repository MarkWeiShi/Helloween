import {findShareCharacter} from './share-characters';
import {mountHelloTalkUnlock} from './hellotalk-unlock';
import {api,client,escape as e} from './api';
import {t,locale} from './i18n';
import type {Catalog,Player} from './types';
export type GhostLink={inviteId:string;spiritId:string;createdAt:number;friendName:string|null;visits:number;recordings:{receiverId:string;name:string;durationMs:number;createdAt:number}[]};
export function linksPage(player:Player) {
 return `<section class="ghost-links-page"><header class="ghost-links-heading"><div><p class="ghost-eyebrow">${e(t('A little fright, saved for you'))}</p><p>${e(t('All your friends’ voices, in one timeline. Save up to 50 voices.'))}</p></div><a class="button secondary" href="/">${e(t('Explore'))}</a></header><div class="ghost-account"><span>${e(player.account?t('Your links are saved to your account.'):t('These links belong to this browser. Sign in to keep them across devices.'))}</span><button class="button secondary" data-action="${player.account?'signout':'signin'}">${e(t(player.account?'Sign out':'Sign in'))}</button></div><div class="ghost-links-toolbar"><label>${e(t('Filter by ghost'))}<select data-ghost-filter><option value="">${e(t('All ghosts'))}</option></select></label><label>${e(t('Filter by country'))}<select data-country-filter><option value="">${e(t('All countries'))}</option></select></label><button class="button text-button" data-links-refresh>${e(t('Refresh'))}</button></div><p data-voice-capacity role="status"></p><p data-links-status role="status"></p><div class="ghost-links-grid voice-timeline" data-links-grid></div></section>`;
}
type Voice={inviteId:string;receiverId:string;spiritId:string;name:string;country:string|null;durationMs:number;createdAt:number};
export function mountLinks(root:HTMLElement,catalog:Catalog) {
 const playback=mountHelloTalkUnlock(root);
 let recordings:Voice[]=[],busy=false,dead=false;
 const grid=root.querySelector<HTMLElement>('[data-links-grid]')!,status=root.querySelector<HTMLElement>('[data-links-status]')!,filter=root.querySelector<HTMLSelectElement>('[data-ghost-filter]')!,country=root.querySelector<HTMLSelectElement>('[data-country-filter]')!,capacity=root.querySelector<HTMLElement>('[data-voice-capacity]')!;
 const date=(value:number)=>new Date(value).toLocaleString(locale,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const countryName=(code:string)=>catalog.countries.find(c=>c.code===code)?.name || code;
 function draw() {
  const ghost=filter.value,nation=country.value;
  filter.innerHTML=`<option value="">${e(t('All ghosts'))}</option>`+[...new Set(recordings.map(r=>r.spiritId))].map(id=>`<option value="${e(id)}">${e(findShareCharacter(catalog,id)?.name || id)}</option>`).join('');filter.value=ghost;
  country.innerHTML=`<option value="">${e(t('All countries'))}</option>`+[...new Set(recordings.map(r=>r.country).filter((c):c is string=>!!c))].sort().map(code=>`<option value="${e(code)}">${e(countryName(code))}</option>`).join('');country.value=nation;
  const visible=recordings.filter(r=>(!filter.value||r.spiritId===filter.value)&&(!country.value||r.country===country.value));
  capacity.textContent=`${recordings.length} / 50 · ${t(recordings.length>=50?'Storage full. Delete a voice to receive new recordings.':'Voices saved · newest first')}`;
  grid.innerHTML=visible.map(r=>{const spirit=findShareCharacter(catalog,r.spiritId);return `<article class="ghost-link-card"><header>${spirit?.art?`<img src="${e(catalog.assetOrigin+spirit.art.thumb)}" alt="" width="56" height="56">`:''}<div><h2>${e(r.name)}</h2><p>${e(spirit?.name || r.spiritId)}${r.country?` · ${e(countryName(r.country))}`:''}</p><small><time datetime="${new Date(r.createdAt).toISOString()}">${e(date(r.createdAt))}</time> · ${r.durationMs/1000}s</small></div></header><div class="voice-detail"><button class="button secondary" data-unlock-play disabled>${e(t('Play voice'))}</button><audio hidden controls preload="none" data-voice-audio="${e(client.audio.url(r.inviteId,r.receiverId))}" aria-label="${e(r.name)} · ${e(t('Voice reaction'))}"></audio></div><div class="ghost-link-meta"><a href="/i/${e(r.inviteId)}" target="_blank" rel="noopener">${e(t('Open invitation'))} ↗</a><button class="text-button" data-delete-invite="${e(r.inviteId)}" data-receiver="${e(r.receiverId)}">${e(t('Delete voice'))}</button></div></article>`;}).join('');
  if(!visible.length)grid.innerHTML=`<div class="ghost-links-empty"><span aria-hidden="true">👻</span><p>${e(t(recordings.length?'No voices match these filters.':'Choose a ghost and share an invitation. Your friends’ voices will appear here.'))}</p></div>`;
  grid.querySelectorAll<HTMLButtonElement>('[data-delete-invite]').forEach(button=>button.onclick=async()=>{
   if(busy||!window.confirm(t('Delete this voice permanently? This frees space for a new recording.')))return;
   busy=true;button.disabled=true;
   try{await api(`/invites/${button.dataset.deleteInvite}/audio/${button.dataset.receiver}/delete`,{});recordings=recordings.filter(r=>r.inviteId!==button.dataset.deleteInvite||r.receiverId!==button.dataset.receiver);if(!dead)draw();}
   catch(error){if(!dead)status.textContent=(error as Error).message;}
   finally{busy=false;if(!dead)button.disabled=false;}
  });
  playback.refresh();
  grid.querySelectorAll('audio').forEach(audio=>audio.onplay=()=>grid.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));
 }
 async function load() {
  if(busy||dead)return;busy=true;status.textContent=t('Loading your ghost links…');
  try {const data=await api<{recordings:Voice[]}>('/friend-voices');if(dead)return;recordings=data.recordings;draw();status.textContent='';}
  catch(error){if(!dead)status.textContent=(error as Error).message;}
  finally{busy=false;}
 }
 filter.onchange=draw;country.onchange=draw;root.querySelector<HTMLButtonElement>('[data-links-refresh]')!.onclick=()=>void load();void load();
 return ()=>{dead=true;playback.destroy();grid.querySelectorAll('audio').forEach(audio=>audio.pause());};
}
