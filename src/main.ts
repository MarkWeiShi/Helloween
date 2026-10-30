import {showShareLoading,startShareButtonLoading} from './share-loading';
import {prepareSocialShare,loadShareConfig} from './social-share';
import {watchShareReturn} from './share-return';
import {loadCatalog} from './static-content';
import {previewTransformations} from '../shared/preview-transformations.mjs';
import {showAccount} from "./account";
import {linksPage,mountLinks} from "./ghost-links";
import {t, msg, html, initLanguage, languageSelector, content as localizedContent, locale} from "./i18n";
import { mountSocialHandoff } from "./social-share";
import { createBgm } from "./bgm";
import { mountPersonalScare, readScare, scareLabel, type SharedReaction } from "./personal-scare";
import { pumpkinGreeting } from "./pumpkin-greeting";
import "@fontsource-variable/fredoka/wght.css";
import "@fontsource-variable/dm-sans/wght.css";
import "./style.css";
import { api, GhostApiError, escape as e, event } from "./api";
import { icon } from "./icons";
import { burst } from "./effects";
import { mountGlobe } from "./globe";
import { mountCuteMotions } from "./cute-motions";
import { regionPreviews } from "./region-previews";
import { pitchLevel, pitchScore } from "../shared/reactions.mjs";
import { prepareMicrophone } from "./microphone";
import type { Catalog, Player, Spirit, Invite } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay-root")!;
let catalog: Catalog,
  player: Player,
  invite: Invite | null = null;
let characterOpen = false;
let characterLocked = false;
let soundPreferenceSet = false;
function toggleTransformationSound() {
  sound = !sound; soundPreferenceSet = true;
  window.dispatchEvent(new Event('boo:sound'));
}
let globeCleanup: (() => void) | undefined;
let region = "JP",
  selected = "kappa",
  page = "map",
  sound = true,
  gate = false;
let boardGroup = "players";
let boardScope = "trick",
  boardTimer: ReturnType<typeof setInterval> | undefined;
let modalCleanup: (() => void) | undefined,
  toastTimer: ReturnType<typeof setTimeout>;
let mic: Awaited<ReturnType<typeof prepareMicrophone>> | undefined;
let gateBusy = false;
let microphoneUnlocked = false;
const unlockStorageKey = 'boo:play-unlocked:v1';
function hasSavedUnlock() {
  try { return localStorage.getItem(unlockStorageKey) === 'true'; }
  catch { return false; }
}
const notified = new Set<string>();
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const $ = <T extends Element = HTMLElement>(q: string) =>
  document.querySelector<T>(q);
const spirit = (id = selected) => catalog.spirits.find((s) => s.id === id)!;
const country = (id: string | null) =>
  catalog.countries.find((c) => c.code === id)?.name || t("Choose your home");
const progress = (id = selected) =>
  player.progress.find((p) => p.spiritId === id);
const asset = (path: string) => `${catalog.assetOrigin}${path}`;
const flag = (code: string) =>
  code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
function portrait(
  s: Spirit,
  pose: "idle" | "scare" | "peace" = "idle",
  className = "",
  lazy = true,
) {
  return s.art
    ? html`<img class="spirit-art ${className}" src="${e(asset(s.art[pose]))}" alt="${e(s.name)}" width="480" height="480" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" data-motion="${s.animation}">`
    : html`<span class="spirit-art art-pending ${className}" aria-label="${e(s.name)}">${icon("ghost")}</span>`;
}
function thumb(s: Spirit) {
  return s.art
    ? html`<img data-cute-id="${e(s.id)}" src="${e(asset(s.art.thumb))}" alt="" width="112" height="112" loading="lazy" decoding="async">`
    : icon("ghost");
}
function button(label: string, action: string, cls = "primary", extra = "") {
  return html`<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
}
function toast(text: string) {
  const t = $("#toast")!;
  t.textContent = text;
  t.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("visible"), 4200);
}
const bgm = createBgm(() => sound && page === 'map' && !gateBusy);
let playbackContext: AudioContext | undefined;
function enablePlayback() {
  playbackContext ??= new AudioContext();
  bgm.start(playbackContext);
  return playbackContext.resume();
}
function tryBackgroundMusic() {
  if (!sound) return;
  try { void enablePlayback().then(() => bgm.sync()).catch(() => {}); } catch {}
}
// Browser autoplay permission varies; retry inside a real user gesture.
document.addEventListener('click', tryBackgroundMusic, {capture:true});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') tryBackgroundMusic();
}, {capture:true});
function playUnlock() {
  const context=playbackContext;if(!context||context.state!=='running')return;
  const time=context.currentTime;
  // Two short metallic transients: latch click, then a bright spring release.
  [0,.085].forEach((delay,index)=>{
    const gain=context.createGain();gain.connect(context.destination);
    gain.gain.setValueAtTime(.0001,time+delay);
    gain.gain.exponentialRampToValueAtTime(index?.045:.065,time+delay+.003);
    gain.gain.exponentialRampToValueAtTime(.0001,time+delay+.13);
    [1800,3100,4700].forEach((frequency,i)=>{
      const osc=context.createOscillator();osc.type='triangle';osc.frequency.setValueAtTime(frequency*(index?1.2:1),time+delay);osc.frequency.exponentialRampToValueAtTime(frequency*.65,time+delay+.1);osc.connect(gain);osc.start(time+delay);osc.stop(time+delay+.14);
    });
    setTimeout(()=>gain.disconnect(),400);
  });
}
function playTone(kind = "tap") {
  if (!sound) return;
  try {
    const context = playbackContext;
    if (!context || context.state !== "running") return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    gain.connect(context.destination);
    [0, 0.08, 0.16].forEach((delay, i) => {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value =
        (kind === "peace" ? 440 : kind === "boo" ? 180 : 330) *
        [1, 1.25, 1.5][i];
      osc.connect(gain);
      osc.start(context.currentTime + delay);
      osc.stop(context.currentTime + delay + 0.2);
    });
    setTimeout(() => gain.disconnect(), 700);
  } catch {}
}
function closeModal() {
  if (characterLocked) return;
  modalCleanup?.();
  modalCleanup = undefined;
  overlay.querySelector("dialog")?.close();
  overlay.innerHTML = "";
  document.body.classList.remove("modal-open");
}
function modal(content: string, wide = false, onClose?: () => void) {
  closeModal();
  const previous = document.activeElement as HTMLElement;
  overlay.innerHTML = html`<dialog class="modal ${wide ? "wide" : ""}"><button class="icon-button modal-close" data-action="close" aria-label="Close">${icon("close")}</button>${content}</dialog>`;
  const dialog = overlay.querySelector("dialog")!;
  document.body.classList.add("modal-open");
  dialog.showModal();
  dialog.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeModal();
  });
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        (ev as MouseEvent).clientX < r.left ||
        (ev as MouseEvent).clientX > r.right ||
        (ev as MouseEvent).clientY < r.top ||
        (ev as MouseEvent).clientY > r.bottom
      )
        closeModal();
    }
  });
  modalCleanup = () => {
    onClose?.();
    previous?.focus?.();
  };
}
function hellotalk(where = "map") {
  return html`<a class="hellotalk" href="https://www.hellotalk.com/en/download" target="_blank" rel="noopener noreferrer" data-ht="${where}"><span class="ht-mark">Hi</span><span>Meet the world on <strong>HelloTalk</strong></span>${icon("arrow")}</a>`;
}
function header() {
  if(page === 'links' || page === 'boards') return html`<header class="site-header screams-header"><h1>${e(page === "boards" ? t("Scream rankings") : t("Friends’ screams"))}</h1><nav class="desktop-nav" aria-label="Main navigation">${navItems()}</nav></header>`;

  return html`<header class="site-header"><a class="brand" href="/" aria-label="Boo Around the World home">${icon("ghost")}<span>boo<span class="brand-dot">.</span><small>around the world</small></span></a><nav class="desktop-nav" aria-label="Main navigation">${navItems()}</nav><div class="header-tools">${""}<button class="home-country" data-action="profile" aria-label="Your parade profile">${player.country ? flag(player.country) : icon("globe")}<span>${player.country ? e(player.name) : t("Your parade")}</span></button><button class="icon-button sound-toggle" data-action="sound" aria-label="${sound ? t("Mute sound") : t("Enable sound")}">${icon(sound ? "sound" : "mute")}</button></div></header>`;
}
function navItems() {
  return [
    ["map", "pumpkin", t("Explore ghosts")],
    ["links", "ghost", t("Friends’ screams")],
    ["boards", "trophy", t("Scream rankings")],
  ]
    .map(
      ([p, , label]) =>
        html`<button data-page="${p}" class="nav-item ${page === p ? "active" : ""}" ${page === p ? 'aria-current="page"' : ""}>${p === "map" || p === "links" ? `<span class="screams-nav-symbol" aria-hidden="true">${p === "map" ? "🎃" : "👻"}</span>` : '<img class="screams-nav-trophy" src="/art/ui/scream-trophy.webp" width="26" height="26" alt="" aria-hidden="true">'}<span>${label}</span></button>`,
    )
    .join("");
}
function render() {
  if (gate) return;
  document.body.classList.toggle("explore-screen", page === "map");
  document.body.classList.toggle("rankings-screen", page === "boards");
  globeCleanup?.();
  globeCleanup = undefined;
  if (boardTimer) {
    clearInterval(boardTimer);
    boardTimer = undefined;
  }
  app.innerHTML = html`<div class="app-shell">${header()}<main id="main-content">${page === "map" ? mapPage() : page === "codex" ? codexPage() : page === "links" ? linksPage(player) : boardsPage()}</main><footer class="site-footer">${hellotalk()}<button class="text-button" data-action="about">About the folklore</button></footer></div><nav class="mobile-nav" aria-label="Main navigation">${navItems()}</nav>${page === "map" || page === "boards" ? html`<button class="stats-help" data-action="${page === "boards" ? "rankings-help" : "stats-help"}" aria-label="What do these numbers mean?"><img class="corner-ui-icon" src="/art/ui/help-question.webp" width="30" height="30" alt="" aria-hidden="true"></button>` : ""}`;
  app.insertAdjacentHTML("beforeend", languageSelector());
  if (page === "map") {
    const host=$(".globe-explorer")!;
    const stopGlobe=mountGlobe(host, region), stopMotions=mountCuteMotions(host);
    globeCleanup=()=>{stopMotions();stopGlobe();};

  }
  if (page === "links") globeCleanup=mountLinks(app,catalog);
  if (page === "boards") {
    void loadBoard();
    boardTimer = setInterval(() => {
      if (!document.hidden) void loadBoard();
    }, 60000);
  }
  bgm.sync();
}
function characterAction(emoji: string, label: string, action: string, style: string, accessible = label, id = selected) {
  return html`<button class="spirit-action ${style}" data-id="${e(id)}" data-action="${action}" aria-label="${e(accessible)}"><span class="action-orb" aria-hidden="true">${emoji}</span><span class="action-caption">${e(label)}</span></button>`;
}
function revealCharacter(animate = true, shared?: SharedReaction, requireComplete = false) {
  characterOpen = true;
  modal(characterPanel());
  const dialog = overlay.querySelector<HTMLDialogElement>("dialog")!;
  dialog.classList.add("character-dialog", "character-immersive");
  dialog.setAttribute("aria-label", t("Folklore character details"));
  dialog.querySelector(".modal-close")?.remove();
  const current = spirit();
  const previewId = previewTransformations[region as keyof typeof previewTransformations];
  const hasCharacter = current?.art && current.regionId === region;
  if (hasCharacter || previewId) {
    const previousCleanup = modalCleanup;
    const cleanup = mountPersonalScare(dialog, player.id, hasCharacter ? current.id : previewId!, hasCharacter ? asset(current.art!.scare) : "", locked => { characterLocked = locked; }, () => true, undefined, shared, requireComplete);
    modalCleanup = () => { cleanup(); previousCleanup?.(); };
  }
  if (animate && !characterLocked && !reduced.matches) dialog.querySelector(".hero-spirit")?.animate(
    [{transform:"scale(.94)",opacity:.6},{transform:"scale(1)",opacity:1}],
    {duration:240,easing:"cubic-bezier(.23,1,.32,1)"},
  );
  dialog.querySelector<HTMLButtonElement>(".character-close")?.focus({preventScroll:true});
}
function counterNumber(current: number) {
  return html`<span class="counter-current">${current}</span>`;
}
function folklorePreview(s: Spirit) {
  // Use the already localized, source-informed folklore rather than the playful tagline.
  const sentence = [...new Intl.Segmenter(locale, {granularity:'sentence'}).segment(s.folklore)][0]?.segment.trim() || s.shortDescription;
  const origin = new Intl.DisplayNames([locale], {type:'region'}).of(s.originCountry) || s.culture;
  return sentence.toLocaleLowerCase(locale).includes(origin.toLocaleLowerCase(locale)) ? sentence : `${origin} · ${sentence}`;
}
function mapPage() {
  return '<div class="language-space" aria-hidden="true"></div>'+html`<div class="page-title globe-title"><div><h1 class="halloween-title halloween-image-title" translate="no" lang="en"><img class="halloween-title-image" src="/art/ui/halloween-tricks-title.webp" width="2126" height="403" alt="${"Halloween Tricks by HelloTalk"}" fetchpriority="high"></h1><p class="campaign-subtitle"><img class="campaign-subtitle-image" src="/art/ui/subtitles/${e(locale)}.webp" alt="${e(t("Join HelloTalk to Hear Friends Scream"))}" fetchpriority="high"></p></div><div class="explore-counters" aria-label="Your parade stats"><button class="parade-counter reaction-inbox" data-action="reactions" aria-label="Friend visits"><span class="counter-icon" aria-hidden="true">🎃</span><span class="counter-value" id="reaction-count">${counterNumber(player.shareVisits || 0)}</span></button><button class="parade-counter" data-action="reactions" aria-label="Friends’ scream score"><span class="counter-icon" aria-hidden="true">👻</span><span class="counter-value" id="friend-scream-score">${counterNumber(player.friendScreamScore ?? 0)}</span></button></div></div>
  ${invite ? html`<button class="invite-ribbon" data-action="invite">${icon("share")} ${e(invite.name)} sent you a Halloween surprise ${icon("arrow")}</button>` : ""}
  <div class="explore-layout globe-layout"><div class="globe-caption" role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></div><section class="globe-explorer" aria-label="Explore cultures on the globe">
    <div class="globe-viewport" tabindex="0" role="group" aria-label="Interactive globe. Drag to rotate, or use left and right arrow keys."><span class="globe-spark spark-one">✦</span><span class="globe-spark spark-two">✧</span><span class="globe-spark spark-three">✦</span><canvas aria-hidden="true"></canvas>
    <div class="globe-pins">${catalog.regions.map(r => {
      const friends=catalog.spirits.filter(x=>x.regionId===r.id),preview=regionPreviews[r.id];
      const previewId=previewTransformations[r.id as keyof typeof previewTransformations];
      return friends.length ? friends.map(s=>html`<button class="globe-pin ${s.id===selected?'selected':''}" data-region="${r.id}" data-globe-spirit="${s.id}" data-preview-name="${e(s.name)}" data-preview-description="${e(folklorePreview(s))}" data-spirit="${s.id}" aria-label="Explore ${e(s.name)} from ${e(r.name)}" hidden>${thumb(s)}</button>`).join('') : previewId ? html`<button class="globe-pin" data-preview-transform="${previewId}" data-preview-name="${e(preview.name)}" data-preview-description="${e(msg`A folklore friend inspired by ${preview.culture}.`)}" data-region="${r.id}" aria-label="Explore ${e(preview.name)} from ${e(r.name)}" hidden><img data-cute-id="${previewId}" src="${e(preview.thumb)}" alt="${e(preview.name)} preview" width="144" height="144" loading="lazy" draggable="false"></button>` : '';
    }).join('')}</div>
    </div>
    <div class="globe-zoom" role="group" aria-label="Globe zoom"><button data-zoom="in" aria-label="Zoom in">➕</button><span class="zoom-level" aria-live="polite">1 / 3</span><button data-zoom="out" aria-label="Zoom out">➖</button></div>
  </section></div>`;
}
function reactionMeter(id: string) {
  const stat=player.reactions?.stats.find(x=>x.spiritId===id);
  const score=pitchScore(stat?.meanHz ?? null);
  return html`<div class="mini-meter reaction-meter" data-reaction-spirit="${e(id)}"><progress max="100" value="${score}" aria-label="Scariness game score"></progress><div class="scariness-row"><strong data-world-scariness>${e(msg`World Scariness ${score} / 100`)}</strong><p data-personal-scare role="status" aria-live="polite" class="personal-scare">${e(scareLabel(readScare(player.id,id)))}</p></div></div>`;
}
function actionPair(id:string, preview=false) {
  return html`<div class="reaction-actions"><div>${preview ? html`<button class="spirit-action" disabled><span class="action-orb">🎃</span><span class="action-caption">Trick or Treat!</span></button>` : characterAction('🎃',t("Trick or Treat!"),'share','scare-action',t("Trick or Treat!"),id)}${reactionMeter(id)}</div></div>`;
}
function characterPanel() {
  const s = spirit();
  const p = progress(), friends = catalog.spirits.filter(x => x.regionId === region);
  const preview = regionPreviews[region];
  const previewId = previewTransformations[region as keyof typeof previewTransformations];
  const hasTransformation = !!(friends.length ? s.art : previewId);
  return html`<section class="selected-character globe-character" id="character-focus" tabindex="-1" aria-label="${e(friends.length?s.name:preview.name)}"><div class="character-navigation">${friends.length?html`<button class="icon-button" data-action="lore" aria-label="Read ${e(s.name)}'s story">${icon('book')}</button>`:html`<span></span>`}<div class="character-top-actions">${friends.length ? directShareButtons(s.id) : ''}${friends.length ? html`<button class="icon-button character-share" data-action="share" data-id="${e(s.id)}" aria-label="Share this character">${icon('shareCurve')}</button>` : ''}<button class="icon-button character-close" data-action="close-character" aria-label="Close character details">${icon('close')}</button></div></div><div class="character-stage" tabindex="0" role="group" aria-label="Folklore character details"><span class="stage-orbit"></span>${friends.length ? portrait(s,p?.peaceAt?'peace':'idle','hero-spirit',false) : html`<img class="region-preview-art hero-spirit" src="${e(preview.portrait)}" alt="${e(preview.name)} visual preview">`}${hasTransformation ? html`<button class="transformation-replay" data-play-transform aria-label="Replay transformation" hidden>↻</button>`:''}</div><div class="character-info">${actionPair(friends.length?s.id:(previewId || region),!friends.length)}</div></section>`;
}
async function openReactions() {
  player=(await api('/me')).player;
  closeModal();gate=false;page='links';history.replaceState(null,'','/my-links');render();
  await api('/reactions/read',{});
}
async function signIn() {
  await showAccount(modal,()=>{location.assign('/my-links?signin=success');});
}
function codexPage() {
  return html`<div class="page-title"><div><h1>Your little<br><span>world of wonders.</span></h1><p>${player.peaceCount} wishes fulfilled. Every story is worth a little kindness.</p></div>${button(msg`${icon("globe")} Explore the map`, "map", "secondary")}</div><div class="codex-grid">${catalog.spirits
    .map((s) => {
      const p = progress(s.id);
      return html`<button class="codex-card ${p?.peaceAt ? "at-peace" : ""}" data-lore="${s.id}"><div class="codex-art">${portrait(s, p?.peaceAt ? "peace" : "idle")}</div><span class="codex-country">${flag(s.originCountry)} ${e(catalog.regions.find((r) => r.id === s.regionId)?.name)}</span><h2>${e(s.name)}</h2><span class="codex-status">${p?.peaceAt ? `${icon("heart")} ${e(s.peaceLabel)}` : e(s.culture)}</span></button>`;
    })
    .join("")}</div>`;
}
function boardsPage() {
  return html`<section class="scream-rankings"><div class="board-controls"><div class="segmented">${['trick','intensity'].map(scope=>html`<button data-scope="${scope}" class="${boardScope===scope?'active':''}" aria-pressed="${boardScope===scope}">${scope==='trick'?t('Trick rankings'):t('Scream rankings')}</button>`).join('')}</div><div class="segmented board-groups">${['players','countries'].map(group=>html`<button data-board-group="${group}" class="${boardGroup===group?'active':''}" aria-pressed="${boardGroup===group}">${group==='players'?t('Individuals'):t('Countries')}</button>`).join('')}</div></div><p class="board-note">${boardScope==='trick'?t('Ranked by recordings received through shared links.'):t('Ranked by friends’ combined volume and pitch scores.')} ${t('Countries are grouped by the sharer’s country.')} ${t('Ties share a rank.')}</p><div id="board-content" aria-live="polite"><div class="skeleton-row"></div></div></section>`;
}
async function loadBoard() {
  const scope=boardScope, group=boardGroup;
  try {
    const data=await api(`/scream-rankings?scope=${scope}&group=${group}`);
    const node=$('#board-content');
    if(!node || scope!==boardScope || group!==boardGroup)return;
    const names=new Intl.DisplayNames([locale],{type:'region'});
    const row=(r:any,self=false)=>html`<div class="board-row ${self?'is-you':''}"><span class="rank">${r.rank}</span><span class="board-avatar" aria-hidden="true">${group==='countries'?flag(r.id):scope==='trick'?'🎃':'👻'}</span><span class="board-name"><strong>${e(group==='countries'?names.of(r.id)||r.id:r.name)}${self?html` <small>${group==='countries'?t('Your country'):t('You')}</small>`:''}</strong><span>${r.recordings} ${t('recordings')} · ${r.participants} ${t('participants')}</span></span><strong class="board-score">${Number(r.score).toLocaleString(locale,{maximumFractionDigits:2})}${scope==='intensity'?' / 100':''}</strong></div>`;
    node.innerHTML=data.rows.length?`${data.self?`<div class="your-rank">${row(data.self,true)}</div>`:''}<div class="board-list">${data.rows.map((r:any)=>row(r)).join('')}</div>`:html`<p class="rank-empty">${scope==='trick'?t('No recordings received yet.'):t('No eligible scream scores yet.')}</p>`;
  } catch(err) {
    const node=$('#board-content');if(node && scope===boardScope && group===boardGroup)node.innerHTML=html`<p>${e((err as Error).message)}</p>${button(t('Try again'),'reload-board','secondary')}`;
  }
}
function openLore(id = selected) {
  const s = spirit(id),
    p = progress(id);
  modal(
    html`<div class="lore-top" style="--character-color:${s.color}">${portrait(s, p?.peaceAt ? "peace" : "idle")}<span>${flag(s.originCountry)} ${e(s.culture)}</span><h2>${e(s.name)}</h2><p class="native-name">${e(s.nativeName)}</p></div><div class="lore-copy"><h3>From the folklore</h3><p>${e(s.folklore)}</p>${s.artNote ? html`<p class="fine-print">${e(s.artNote)}</p>` : ""}<details><summary>Explore the sources</summary><ul>${s.sources.map((source) => html`<li><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ${icon("arrow")}</a></li>`).join("")}</ul></details><div class="wish-excerpt">${icon("heart")}<div><h3>Our Halloween wish</h3><p>${e(s.wish)}</p><small>A new story imagined for this game.</small></div></div>${button(msg`${icon("ghost")} Join the parade as ${e(s.name)}`, "equip", "primary full", `data-id="${s.id}"`)}${p?.peaceAt ? button(msg`${icon("book")} Revisit the ending`, "story", "secondary full", `data-id="${s.id}"`) : ""}</div>`,
  );
}
function requirePlayer(next: () => void | Promise<void>) {
  if (player.initialized) {
    void next();
    return;
  }
  openProfile(next);
}
function openProfile(next?: () => void | Promise<void>) {
  if (player.initialized) {
    modal(
      html`<div class="modal-heading">${icon("ghost")}<h2>${e(player.name)}'s parade</h2><p>${flag(player.country!)} ${e(country(player.country))}</p></div>${button(t("Back to the world"), "close", "primary full")}`,
    );
    return;
  }
  modal(
    html`<div class="modal-heading">${icon("ghost")}<h2>Make yourself<br>at ghost.</h2><p>No account needed. A name, a home, and a little imagination.</p></div><form id="join-form"><label>Your parade name<input name="name" maxlength="24" autocomplete="nickname" value="${e(player.name)}" required></label><label>Your country or region<select name="country" required><option value="">Choose your home</option>${catalog.countries.map((c) => html`<option value="${c.code}">${e(c.name)}</option>`).join("")}</select></label><div class="join-character">${thumb(spirit())}<span>Your first folklore friend<strong>${e(spirit().name)}</strong></span></div><p class="form-error" role="alert"></p><button class="button primary full" type="submit">Join the parade ${icon("arrow")}</button></form>`,
  );
  $("#join-form")!.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement,
      submit = form.querySelector("button")!;
    submit.disabled = true;
    try {
      const values = new FormData(form);
      const data = await api("/onboard", {
        name: values.get("name"),
        country: values.get("country"),
        spiritId: selected,
      });
      player = data.player;
      closeModal();
      render();

      playTone();
      await next?.();
    } catch (err) {
      form.querySelector(".form-error")!.textContent = (err as Error).message;
      submit.disabled = false;
    }
  });
}
async function openStory(id = selected) {
  const s = spirit(id);
  if (!progress(id)?.peaceAt) {
    return;
  }
  if (!s.story) {
    try {
      s.story = (await api(`/spirits/${id}/story`)).story;
    } catch (error) {
      toast((error as Error).message);
      return;
    }
  }
  let frame = 0;
  const show = () => {
    const part = s.story![frame];
    modal(
      html`<div class="story-scene scene-${frame}" style="--character-color:${s.color}"><div class="story-halo"></div>${portrait(s, frame === 2 ? "peace" : frame === 1 ? "scare" : "idle", "story-spirit", false)}<div class="story-sparkles">✦<span>✧</span>✦</div></div><div class="story-copy"><span class="story-label">Our Halloween tale · ${e(s.name)}</span><h2>${e(part.title)}</h2><p>${e(part.text)}</p><div class="story-dots" aria-label="Part ${frame + 1} of 3">${[0, 1, 2].map((i) => html`<span class="${i === frame ? "active" : ""}"></span>`).join("")}</div>${frame < 2 ? html`<button class="button primary full" id="story-next">Turn the page ` + icon("arrow") + html`</button>` : html`<div class="peace-message">${icon("heart")} ${e(s.peaceLabel)}</div>${button(msg`${icon("share")} Share this little happy ending`, "share", "primary full", `data-id="${id}"`)}${button(t("Meet another folklore friend"), "close", "text-button full")}${hellotalk("story")}`}</div>`,
    );
    if (frame < 2)
      $("#story-next")!.addEventListener("click", () => {
        frame++;
        playTone(frame === 2 ? "peace" : "tap");
        show();
      });
    else event("story_read", id);
    burst($(".story-scene"), "light");
  };
  show();
}
function openInvite(accepted = false) {
  if (!invite) return;
  const s = spirit(invite.spiritId);
  const invitation = invite;
  const play = () => {
    if (invitation.expired) return;
    selected = s.id;
    region = s.regionId;
    revealCharacter(false, {inviteId:invitation.id}, true);
  };
  // Unlock already explains and accepts invitation playback and recording.
  if (accepted && !invitation.expired) {
    play();
    return;
  }
  modal(html`<div class="invitation-film"><div class="invitation-stage"><div class="invitation-consent">${pumpkinGreeting()}<p>${e(invitation.name)} 邀请你观看 ${e(s.name)} 变身。</p><button class="button primary full" data-invite-play ${invitation.expired ? 'disabled' : ''}>${invitation.expired ? t("邀请已过期") : t("接受朋友的万圣节邀请")}</button></div></div></div>`);
  const dialog = overlay.querySelector<HTMLDialogElement>('dialog')!;
  dialog.classList.add('invitation-result', 'invitation-cinema');
  dialog.querySelector<HTMLButtonElement>('[data-invite-play]')!.onclick = play;
}

async function respondInvite() {
  if (!invite) return;
  requirePlayer(async () => {
    try {
      const data = await api(`/invites/${invite!.id}/respond`, {});
      player = data.player;
      const name = invite!.name;
      invite = null;
      closeModal();
      render();
      toast(
        msg`Your Boo is on its way back to ${name}.`,
      );
    } catch (err) {
      toast((err as Error).message);
    }
  });
}
function shareChannelIcon(channel: string) {
  const logos: Record<string,string> = {x:'x',line:'line',facebook:'facebook',kakao:'kakaotalk',wechat:'wechat'};
  return channel === 'copy' ? icon('copy') : `<img class="social-logo" src="/icons/social/${logos[channel]}.svg" alt="" aria-hidden="true" width="24" height="24">`;
}
function directShareButtons(id:string) {
  return `<div class="character-sns" role="group" aria-label="${e(t('Choose a sharing app'))}">${[['x','X'],['line','LINE'],['facebook','Facebook'],['kakao','KakaoTalk']].map(([channel,name])=>`<button class="icon-button" data-action="send-share" data-channel="${channel}" data-id="${e(id)}" aria-label="${e(name)}" title="${e(name)}">${shareChannelIcon(channel)}</button>`).join('')}</div>`;
}
function openShare(id = selected) {
  prepareSocialShare(id);
  modal(`<h2>${e(t('Choose a sharing app'))}</h2><div class="share-options">${[['x','X'],['line','LINE'],['facebook','Facebook'],['kakao','KakaoTalk'],['wechat','WeChat'],['copy',t('Copy link')]].map(([channel,label])=>button(`${shareChannelIcon(channel)}<span>${e(label)}</span>`,'send-share','secondary',`data-channel="${channel}" data-id="${id}"`)).join('')}</div>`);
  overlay.querySelector('dialog')!.classList.add('compact-share');
}
let shareRequest = 0;
async function sendShare(id: string, channel: string, btn?: HTMLButtonElement, resumed=false) {
  if(btn?.disabled)return;
  if(channel==='x') {
    if(!player.account){sessionStorage.setItem('boo:pending-share',JSON.stringify({id,channel}));await signIn();return;}
    const finishLoading=startShareButtonLoading(btn);
    // Reserve the window within the click gesture; OAuth resumes use an explicit link.
    const destination=resumed?null:window.open('about:blank','_blank');
    if(destination)destination.opener=null;
    try {
      const data=await api('/invites',{spiritId:id,channel});
      const shareUrl=new URL(`/api/share/card/${encodeURIComponent(data.id)}?lang=${encodeURIComponent(locale)}`,data.url).href;
      const target='https://x.com/intent/post?'+new URLSearchParams({text:msg`Boo! ${spirit(id).name} has a little Halloween surprise for you.`,url:shareUrl});
      if(destination && !destination.closed){watchShareReturn();destination.location.href=target;closeModal();}
      else {
        modal(`<h2>X</h2><a class="button primary full" data-open-x href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(t('Continue to {{1}}').replace('{{1}}','X'))}</a>`);
        overlay.querySelector<HTMLAnchorElement>('[data-open-x]')!.onclick=()=>watchShareReturn();
      }
    }catch(error){destination?.close();toast((error as Error).message);}
    finally{finishLoading();}
    return;
  }
  if(channel==='line' || (channel==='facebook' && player.initialized)) {
    const finishLoading=startShareButtonLoading(btn);
    const destination=channel==='facebook'?window.open('about:blank','_blank'):null;
    if(destination)destination.opener=null;
    try {
      if(channel==='line') {
        const config=await loadShareConfig();
        if(config.lineLiffId){
          const data=await api('/invites',{spiritId:id,channel});
          const target=`https://liff.line.me/${encodeURIComponent(config.lineLiffId)}?invite=${encodeURIComponent(data.id)}&lang=${encodeURIComponent(locale)}`;
          modal(`<h2>LINE</h2><a class="button primary full" data-line-app href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(locale==='zh'?'在 LINE 中打开':'Open in LINE')}</a><p class="fine-print">${e(locale==='zh'?'发送后，使用左上角 Safari 返回游戏。':'After sharing, use the Safari return link to resume the game.')}</p>`);
          overlay.querySelector<HTMLAnchorElement>('[data-line-app]')!.onclick=()=>watchShareReturn();return;
        }
      } else {
        const data=await api('/invites',{spiritId:id,channel});
        const card=new URL(`/api/share/facebook/${encodeURIComponent(data.id)}?lang=${encodeURIComponent(locale)}`,data.url);
        const target=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(card.href)}`;
        if(destination){watchShareReturn();destination.location.href=target;}else{modal(`<a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">Facebook</a>`);}
        return;
      }
    }catch(error){destination?.close();toast((error as Error).message);return;}
    finally{finishLoading();}
  }
  const request=++shareRequest;
  modal(`<h2>${e(channel==='copy'?t('Copy link'):`Share with ${channel==='x'?'X':channel==='kakao'?'KakaoTalk':channel==='facebook'?'Facebook':channel.toUpperCase()}`)}</h2>${!player.initialized?`<div class="share-profile"><label>${e(t('Your parade name'))}<input id="share-name" maxlength="24" value="${e(player.name)}"></label><label>${e(t('Your country or region'))}<select id="share-country"><option value="">${e(t('Choose your home'))}</option>${catalog.countries.map(c=>`<option value="${c.code}">${e(c.name)}</option>`).join('')}</select></label></div>`:''}<div id="share-link"></div>`);
  overlay.querySelector('dialog')!.classList.add('compact-share');
  const node=$('#share-link')!;
  showShareLoading(node,'invite');
  prepareSocialShare(id);
  const beforeConfirm=()=>{
    if(!player.initialized)return api('/onboard',{name:($('#share-name') as HTMLInputElement).value,country:($('#share-country') as HTMLSelectElement).value,spiritId:id}).then(result=>{player=result.player;});
  };
  try {
    const data=await api('/invites',{spiritId:id,channel});
    if(!node.isConnected || request!==shareRequest)return;
    if(channel==='copy'){node.innerHTML=`<button class="button primary full" data-copy-confirm>${e(t('Copy link'))}</button>`;node.querySelector<HTMLButtonElement>('button')!.onclick=async()=>{try{await beforeConfirm();await copyLink(data.url);}catch(error){toast((error as Error).message);}};}
    else await mountSocialHandoff(node,channel,data.url,msg`Boo! ${spirit(id).name} has a little Halloween surprise for you.`,asset(spirit(id).art?.share || '/art/world-map.webp'),id,beforeConfirm);
  }catch(err){node.textContent=(err as Error).message;}
}
async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast(t("Invitation link copied. Send it to someone who needs a smile."));
  } catch {
    toast(t("Your invitation is ready. Select and copy the link below."));
  }
}
async function downloadCard(id: string) {
  const art = spirit(id).art;
  if (!art) return;
  try {
    const res = await fetch(asset(art.share));
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boo-${id}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    window.open(asset(art.share), "_blank", "noopener,noreferrer");
  }
}
function openAbout() {
  modal(
    html`<div class="modal-heading">${icon("globe")}<h2>Many cultures.<br>A little shared kindness.</h2></div><p>This parade brings together ghosts, spirits, creatures and figures from folklore and literature. They do not all represent the souls of people who have died.</p><p>Each character's cultural background has its own source links. The warm three-part endings are new Halloween stories written for this game, not claims about the original traditions.</p><p>Countries on the leaderboard are chosen by players. Folklore can belong to several communities, and a map marker never means exclusive ownership.</p><h3>Your visit</h3><p>We store a guest identifier in this browser, your chosen nickname and country, game progress and aggregate activity counts. Signing in saves your invitation links to your account for access across devices. We do not import contact lists.</p><p>If you enable the microphone, your first character transformation samples your voice on your device for 6 seconds. Volume and pitch produce a playful personal scariness score, saved per character in this browser; ordinary exploration does not save or upload raw audio. This is a game score, not a measurement of fear. For invitations, your nickname, average and peak pitch, game level and response time are shared with the inviter. When you unlock an invitation visit, the unlock confirmation explains that watching the invited transformation records six seconds starting at video second 3 and automatically uploads the recording and local game score for the inviter alone to play. The server uses your existing nickname, the inviter’s link label, or your guest identifier; no name entry is required. These labels are not verified SNS identities. Other microphone pitch checks store numeric results only. Silence and unclear sound are marked as unmeasured. Microphone access is required to unlock play. Confirm the brief gameplay and microphone notice after tapping unlock; there is no separate invitation consent form.</p><p class="fine-print">No cash prizes or purchases. Sign in before sharing to keep access to your links after changing devices.</p>${hellotalk()}<div class="store-links"><a href="https://apps.apple.com/us/app/hellotalk-language-learning/id557130558" target="_blank" rel="noopener noreferrer" data-ht="store">App Store</a><a href="https://play.google.com/store/apps/details?id=com.hellotalk" target="_blank" rel="noopener noreferrer" data-ht="store">Google Play</a></div>`,
  );
}
function showGate() {
  // Render the actual live world once, then lock its interaction with an inert shell.
  gate=false;page='map';render();gate=true;
  app.querySelector<HTMLElement>('.app-shell')!.inert=true;
  app.insertAdjacentHTML('beforeend',html`<section class="play-lock" aria-label="Unlock the game"><div class="play-lock-content"><button class="button primary play-unlock" data-action="enter"><svg class="unlock-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path class="lock-shackle" d="M10 14V9a6 6 0 0 1 12 0v5"/><rect x="6" y="14" width="20" height="15" rx="4"/><path d="M16 20v3"/></svg><span>Enable Mic &amp; Play</span></button><p class="mic-status" role="status" aria-live="polite"></p></div></section>`);
  app.querySelector<HTMLButtonElement>('.play-unlock')!.focus({preventScroll:true});
}
function openUnlockConsent() {
  if (!gate || gateBusy) return;
  modal(html`<div class="modal-heading"><h2 id="unlock-title">开始前，了解一下</h2></div><ul class="unlock-points" id="unlock-points"><li>探索地球，观看小鬼变身。</li><li>${t("Recording starts at 3 seconds into the video and lasts 6 seconds.")}</li><li>${invite?.recordingFull ? t("Your friend’s storage is full (50 voices). Recording is shared only with the inviter. Keep this page open and retry sending after they delete a voice.") : invite && !invite.expired ? msg`此次邀请的录音与评分会自动上传，仅邀请人 ${e(invite.name)} 可播放。` : t("普通探索不上传声音；朋友邀请中的录音与评分会自动上传，仅邀请人可播放。")}</li>${invite && !invite.expired ? "" : html`<li>录音中可随时取消或关闭。</li>`}</ul><p class="unlock-acceptance">点击确认，即表示接受以上玩法与授权。</p><button class="button primary full" data-confirm-unlock>确认并开启麦克风</button>`);
  const dialog = overlay.querySelector<HTMLDialogElement>('dialog')!;
  dialog.classList.add('unlock-consent');
  dialog.setAttribute('aria-labelledby', 'unlock-title');
  dialog.setAttribute('aria-describedby', 'unlock-points');
  dialog.querySelector<HTMLButtonElement>('[data-confirm-unlock]')!.onclick = () => {
    closeModal();
    void enterGate();
  };
}
function finishGate() {
  microphoneUnlocked=true;
  try { localStorage.setItem(unlockStorageKey, 'true'); } catch {}
  mic?.stop();mic=undefined;gateBusy=false;gate=false;
  app.querySelector('.play-lock')?.remove();
  const shell=app.querySelector<HTMLElement>('.app-shell');if(shell)shell.inert=false;
  if(invite)openInvite(true);
  if(playbackContext)bgm.start(playbackContext);
}
async function enterGate() {
  if(!gate||gateBusy)return;
  gateBusy=true;
  bgm.sync();
  const btn=$<HTMLButtonElement>('.play-unlock')!,status=$('.mic-status');
  btn.disabled=true;
  // Start audio resumption directly in the click gesture, before the permission await.
  try {
    const audioReady=enablePlayback();
    void audioReady.catch(()=>{});
    const capture=await prepareMicrophone();mic=capture;
    await audioReady;
    if(!gate){capture.stop();return;}
    // Permission is requested only from the explicit confirmation click.
    capture.stop();mic=undefined;if (!soundPreferenceSet) sound=true;
    document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(button=>{button.setAttribute('aria-label',sound?t("Mute sound"):t("Enable sound"));button.innerHTML=icon(sound?'sound':'mute');});
    $('.play-lock')?.classList.add('unlocked');
    btn.querySelector('span')!.textContent=t("Unlocked!");
    playUnlock();
    await new Promise<void>(resolve=>setTimeout(resolve,reduced.matches?180:700));
    if(gate)finishGate();
  }catch(error){
    console.warn("Unlock unavailable:", error instanceof Error ? error.message : "audio access failed");
    mic?.stop();mic=undefined;gateBusy=false;btn.disabled=false;
    bgm.sync();
    if(status)status.textContent=t("Allow microphone access in your browser, then tap to try again. The game is still locked.");
  }
}
document.addEventListener("click", async (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>(
    "button,[data-ht]",
  );
  if (!target) return;
  if (characterLocked) return;
  if(gate && !gateBusy && ['links','boards'].includes(target.dataset.page || ''))gate=false;
  if (gate && !["enter", "stats-help", "close", "sound"].includes(target.dataset.action || "")) return;
  if (gateBusy && target.dataset.action === 'sound') return;
  if (target.dataset.ht) {
    event("hellotalk_clicked", target.dataset.ht);
    return;
  }
  if (target.hasAttribute("disabled")) return;
  try {
    if(target.dataset.action==='signin'){await signIn();return;}
    if(target.dataset.action==='signout'){await api("/auth/logout",{});location.assign("/my-links");return;}
    if (target.dataset.page) {
      if(target.dataset.page==='links'){await openReactions();return;}
      history.replaceState(null,'',target.dataset.page==='boards'?'/rankings':'/');
      if(target.dataset.page==='map' && !microphoneUnlocked){showGate();return;}
      page = target.dataset.page;
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    if (target.dataset.region && !target.dataset.globeSpirit) {
      characterOpen = true;
      region = target.dataset.region;
      const first = catalog.spirits.find((s) => s.regionId === region);
      if (first && spirit().regionId !== region) selected = first.id;
      if (first && player.initialized)
        player = (await api("/select", { spiritId: selected })).player;
      render();
      revealCharacter(ev.detail !== 0);
      return;
    }
    if (target.dataset.spirit) {
      characterOpen = true;
      selected = target.dataset.spirit;
      region = spirit().regionId;
      if (player.initialized)
        player = (await api("/select", { spiritId: selected })).player;
      render();
      revealCharacter(ev.detail !== 0);
      return;
    }
    if (target.dataset.lore) {
      openLore(target.dataset.lore);
      return;
    }
    if (target.dataset.boardGroup) {
      boardGroup = target.dataset.boardGroup;
      render();
      return;
    }
    if (target.dataset.scope) {
      boardScope = target.dataset.scope;
      render();
      return;
    }
    switch (target.dataset.action) {
      case "close-character":
        characterOpen = false;
        closeModal();
        $(".globe-viewport")?.focus({ preventScroll: true });
        break;
      case "enter":
        openUnlockConsent();
        break;
      case "sound":
        toggleTransformationSound();
        playTone();
        if (gate) showGate();
        else render();
        toast(sound ? t("Sound on") : t("Sound off"));
        break;
      case "close":
        closeModal();
        break;
      case "join":
        openProfile();
        break;
      case "profile":
        openProfile();
        break;
      case "lore":
        openLore();
        break;
      case "about":
        openAbout();
        break;
      case "equip":
        characterOpen = true;
        selected = target.dataset.id!;
        region = spirit().regionId;
        if (player.initialized)
          player = (await api("/select", { spiritId: selected })).player;
        closeModal();
        page = "map";
        render();
        if (!player.initialized) openProfile();
        break;
      case "story":
        openStory(target.dataset.id || selected);
        break;
      case "share":
        openShare(target.dataset.id || selected);
        break;
      case "send-share":
        await sendShare(
          target.dataset.id!,
          target.dataset.channel!,
          target as HTMLButtonElement,
        );
        break;
      case "download":
        await downloadCard(target.dataset.id!);
        break;
      case "invite":
        openInvite();
        break;
      case "respond":
        await respondInvite();
        break;
      case "rankings-help":
        modal(html`<div class="sheet-handle" aria-hidden="true"></div><div class="stats-sheet-heading"><span aria-hidden="true">✦ 🏆 ✦</span><h2 id="rankings-sheet-title">How rankings work</h2></div><div class="stats-guide"><section><span aria-hidden="true">🎃</span><div><h3>Trick rankings</h3><p>Count recordings successfully received after friends open shared links. Opening a link alone does not count. Repeat uploads by the same friend to the same link count once.</p></div></section><section><span aria-hidden="true">👻</span><div><h3>Scream rankings</h3><p>We request echo cancellation and noise suppression to reduce video sound in the microphone. Valid voice samples produce a 0–100 game score: 50% pitch and 50% logarithmic volume. Pitch maps 70–1200 Hz and volume maps −40–0 dB to the score range.</p><p>Average each friend’s valid scores first, then average across friends within each individual or country. This ranks who gives friends the biggest fright, not who records the most.</p></div></section><section><span aria-hidden="true">🌍</span><div><h3>Individuals and countries</h3><p>Individuals are the people sharing links. Countries use the sharer’s chosen country, not the visitor’s country or interface language. Country Trick scores add all received recordings; country Scream scores average friends’ scores across that country’s sharers.</p></div></section></div><p class="stats-sheet-note">All-time rankings, top 100. Ties share a rank. Self-feedback is excluded. Historical recordings without the new measurements, undetected voices, and samples without confirmed echo cancellation do not enter Scream rankings. Echo reduction is imperfect and devices affect scores; this is a playful reaction score, not a psychological measurement.</p>`);
        overlay.querySelector('dialog')!.classList.add('stats-sheet');
        overlay.querySelector('dialog')!.setAttribute('aria-labelledby','rankings-sheet-title');
        break;
      case "stats-help":
        modal(html`<div class="sheet-handle" aria-hidden="true"></div><div class="stats-sheet-heading"><span aria-hidden="true">✦ 🎃 ✦</span><h2 id="stats-sheet-title">Your Halloween magic</h2></div><div class="stats-guide"><section><span aria-hidden="true">🎃</span><div><h3>Friend visits</h3><p>Friends who opened your links. Repeat visits to the same link count once.</p></div></section><section><span aria-hidden="true">👻</span><div><h3>Friends’ scream score</h3><p>Overall scream score after friends watch your videos (0–100). Average each friend’s valid recordings, then average across friends. No valid scores yet: 0.</p></div></section></div><p class="stats-sheet-note">Repeat visits to the same link count once. A share link is not a confirmed send.</p>`);
        overlay.querySelector('dialog')!.classList.add('stats-sheet');
        overlay.querySelector('dialog')!.setAttribute('aria-labelledby','stats-sheet-title');
        break;
      case "reactions":
        await openReactions();
        break;
      case "collection":
        closeModal();
        page = "codex";
        render();
        break;
      case "map":
        closeModal();
        if(!microphoneUnlocked){showGate();break;}
        page = "map";
        render();
        break;
      case "reload-board":
        await loadBoard();
        break;
      case "retry":
        location.reload();
        break;
    }
  } catch (err) {
    toast((err as Error).message);
  }
});
window.addEventListener("pagehide", () => { mic?.stop(); void playbackContext?.close(); playbackContext=undefined; });
let refreshTimer:ReturnType<typeof setTimeout>|undefined;
let refreshing=false, refreshFailures=0, refreshAfter=0;
function scheduleRefresh(delay=15000) {
  clearTimeout(refreshTimer);
  if(!document.hidden)refreshTimer=setTimeout(()=>void refreshPlayer(),Math.max(delay,refreshAfter-Date.now())+Math.random()*3000);
}
async function refreshPlayer() {
  if(refreshing)return;
  if(document.hidden || !player?.initialized || gate){scheduleRefresh();return;}
  refreshing=true;
  let delay=15000;
  try {
    const d=await api<{player:Player}>('/me');player=d.player;refreshFailures=0;refreshAfter=0;
      const unread=player.reactions.recent.filter(r=>!r.seenAt);
      for(const r of unread) {
        const key=r.inviteId+r.receiverId;
        if(notified.has(key))continue;notified.add(key);
        toast(msg`${r.name}: ${r.hasAudio?msg`sent a ${r.durationMs / 1000}-second voice reaction`:r.meanHz===null?t("no clear voice"):msg`peak ${r.peakHz} Hz · ${t(r.level)}`} — open Friend reactions`);
      }
      const count=$('#reaction-count'); if(count)count.innerHTML=counterNumber(player.shareVisits || 0);
      const scream=$('#friend-scream-score');if(scream)scream.innerHTML=counterNumber(player.friendScreamScore ?? 0);
      const meter=overlay.querySelector<HTMLElement>('[data-reaction-spirit]');
      if(meter){
        const score=pitchScore(player.reactions?.stats.find(x=>x.spiritId===meter.dataset.reactionSpirit)?.meanHz ?? null);
        meter.querySelector('progress')!.value=score;
        meter.querySelector('[data-world-scariness]')!.textContent=msg`World Scariness ${score} / 100`;
      }

  }catch(error){
    refreshFailures++;
    delay=Math.max(Math.min(120000,15000*2**Math.min(refreshFailures,3)),error instanceof GhostApiError?error.retryAfterMs:0);
    refreshAfter=Date.now()+delay;
  }finally{refreshing=false;scheduleRefresh(delay);}
}
document.addEventListener('visibilitychange',()=>{
  document.body.classList.toggle('page-hidden',document.hidden);
  if(document.hidden)clearTimeout(refreshTimer);else scheduleRefresh(1000);
});
scheduleRefresh();
async function boot() {
  try {
    await initLanguage();
    Object.assign(regionPreviews, localizedContent(regionPreviews));
    const [content, session, config] = await Promise.all([
      loadCatalog(),
      api("/session", {}),
      api("/config"),
    ]);
    catalog = localizedContent(content);
    player = session.player;
    selected = player.selected || "kappa";
    region = spirit().regionId;
    const token = location.pathname.match(/^\/i\/([\w-]+)$/)?.[1] || new URL(location.href).searchParams.get('invite');
    if (token) {
      try {
        invite = await api<Invite>(`/invites/${token}`);
        document.title=msg`${invite.name} sent ${spirit(invite.spiritId).name} to say Boo!`;
        if(!invite.expired)void api(`/invites/${token}/visit`, {}).catch(()=>{});
      } catch {
        toast(
          t("This invitation is no longer available. The parade is still open."),
        );
      }
    }
    event("entered");
    microphoneUnlocked = hasSavedUnlock();
    if(location.pathname==='/my-links') {
      page='links';render();
      const signInResult=new URL(location.href).searchParams.get('signin');
      if(new URL(location.href).searchParams.get('shareLogin')==='1' && !player.account)await signIn();
      if(signInResult==='failed')toast(t('Sign-in failed. Please try again.'));
      if(player.account && signInResult==='success') {
        const pending=sessionStorage.getItem('boo:pending-share');sessionStorage.removeItem('boo:pending-share');
        if(pending){try{const saved=JSON.parse(pending);if(saved.id && saved.channel)await sendShare(saved.id,saved.channel,undefined,true);}catch{}}
      }
      history.replaceState(null,'','/my-links');
    } else if(location.pathname==='/rankings'){page='boards';render();} else {
      if (microphoneUnlocked) {
        render();
        // Keep invitation playback on a gesture when reopening the browser.
        if (invite) openInvite();
      } else {
        showGate();
        if(invite && !invite.expired)openUnlockConsent();
      }
    }
    tryBackgroundMusic();
  } catch (err) {
    app.innerHTML = html`<main class="boot"><span>${icon("moon")}</span><h1>The lanterns need a moment.</h1><p>${e((err as Error).message)}</p>${button(t("Light them again"), "retry", "primary")}</main>`;
  }
}
void boot();

document.addEventListener('boo:share-return',()=>{closeModal();});
