import {t, msg, html, initLanguage, languageSelector, content as localizedContent, locale} from "./i18n";
import { mountSocialHandoff } from "./social-share";
import { createBgm } from "./bgm";
import { mountPersonalScare, type SharedReaction } from "./personal-scare";
import { pumpkinGreeting } from "./pumpkin-greeting";
import "@fontsource-variable/fredoka/wght.css";
import "@fontsource-variable/dm-sans/wght.css";
import "./style.css";
import { api, escape as e, event } from "./api";
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
  sound = false,
  gate = false;
let boardScope = "players",
  boardMetric = "candies",
  boardTimer: ReturnType<typeof setInterval> | undefined;
let modalCleanup: (() => void) | undefined,
  toastTimer: ReturnType<typeof setTimeout>;
let mic: Awaited<ReturnType<typeof prepareMicrophone>> | undefined;
let gateBusy = false;
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
const bgm = createBgm(() => sound && !gate);
let playbackContext: AudioContext | undefined;
function enablePlayback() {
  playbackContext ??= new AudioContext();
  return playbackContext.resume();
}
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
  return html`<header class="site-header"><a class="brand" href="/" aria-label="Boo Around the World home">${icon("ghost")}<span>boo<span class="brand-dot">.</span><small>around the world</small></span></a><nav class="desktop-nav" aria-label="Main navigation">${navItems()}</nav><div class="header-tools">${""}<button class="home-country" data-action="profile" aria-label="Your parade profile">${player.country ? flag(player.country) : icon("globe")}<span>${player.country ? e(player.name) : t("Your parade")}</span></button><button class="icon-button sound-toggle" data-action="sound" aria-label="${sound ? t("Mute sound") : t("Enable sound")}">${icon(sound ? "sound" : "mute")}</button></div></header>`;
}
function navItems() {
  return [
    ["map", "globe", t("Explore")],
    ["codex", "book", t("My collection")],
    ["boards", "trophy", t("Leaderboards")],
  ]
    .map(
      ([p, i, label]) =>
        html`<button data-page="${p}" class="nav-item ${page === p ? "active" : ""}" ${page === p ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span></button>`,
    )
    .join("");
}
function render() {
  if (gate) return;
  document.body.classList.toggle("explore-screen", page === "map");
  globeCleanup?.();
  globeCleanup = undefined;
  if (boardTimer) {
    clearInterval(boardTimer);
    boardTimer = undefined;
  }
  app.innerHTML = html`<div class="app-shell">${header()}<main id="main-content">${page === "map" ? mapPage() : page === "codex" ? codexPage() : boardsPage()}</main><footer class="site-footer">${hellotalk()}<button class="text-button" data-action="about">About the folklore</button></footer><nav class="mobile-nav" aria-label="Main navigation">${navItems()}</nav></div>${page === "map" ? html`<button class="stats-help" data-action="stats-help" aria-label="What do these numbers mean?">?</button>` : ""}`;
  app.insertAdjacentHTML("beforeend", languageSelector());
  if (page === "map") {
    const host=$(".globe-explorer")!;
    const stopGlobe=mountGlobe(host, region), stopMotions=mountCuteMotions(host);
    globeCleanup=()=>{stopMotions();stopGlobe();};

  }
  if (page === "boards") {
    void loadBoard();
    boardTimer = setInterval(() => {
      if (!document.hidden) void loadBoard();
    }, 60000);
  }
}
function bindCharacterSwipe() {
  const stage = $(".globe-character .character-stage");
  if (!stage) return;
  let start: { x: number; y: number; time: number; id: number } | null = null;
  stage.addEventListener("pointerdown", ev => {
    if ((ev.target as Element).closest("button") || ev.button !== 0) return;
    start = { x: ev.clientX, y: ev.clientY, time: Date.now(), id: ev.pointerId };
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener("pointercancel", () => { start = null; });
  stage.addEventListener("pointerup", ev => {
    if (!start || start.id !== ev.pointerId) return;
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    const elapsed = Date.now() - start.time;
    start = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && elapsed < 1000)
      stage.querySelector<HTMLButtonElement>(dx < 0 ? ".character-next" : ".character-previous")?.click();
  });
  stage.addEventListener("keydown", ev => {
    if (ev.target !== stage || !["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
    ev.preventDefault();
    stage.querySelector<HTMLButtonElement>(ev.key === "ArrowRight" ? ".character-next" : ".character-previous")?.click();
  });
}
function characterAction(emoji: string, label: string, action: string, style: string, accessible = label, id = selected) {
  return html`<button class="spirit-action ${style}" data-id="${e(id)}" data-action="${action}" aria-label="${e(accessible)}"><span class="action-orb" aria-hidden="true">${emoji}</span><span class="action-caption">${e(label)}</span></button>`;
}
function revealCharacter(animate = true, shared?: SharedReaction) {
  characterOpen = true;
  modal(characterPanel());
  const dialog = overlay.querySelector<HTMLDialogElement>("dialog")!;
  dialog.classList.add("character-dialog", "character-immersive");
  dialog.setAttribute("aria-label", t("Folklore character details"));
  dialog.querySelector(".modal-close")?.remove();
  bindCharacterSwipe();
  const current = spirit();
  if (current?.art && current.regionId === region) {
    const previousCleanup = modalCleanup;
    const cleanup = mountPersonalScare(dialog, player.id, current.id, asset(current.art.scare), locked => { characterLocked = locked; }, () => true, undefined, shared);
    modalCleanup = () => { cleanup(); previousCleanup?.(); };
  }
  if (animate && !characterLocked && !reduced.matches) dialog.querySelector(".hero-spirit")?.animate(
    [{transform:"scale(.94)",opacity:.6},{transform:"scale(1)",opacity:1}],
    {duration:240,easing:"cubic-bezier(.23,1,.32,1)"},
  );
  dialog.querySelector<HTMLButtonElement>(".character-close")?.focus({preventScroll:true});
}
function counterFraction(current: number, total: number) {
  return html`<span class="counter-current">${current}</span><span class="counter-slash">/</span><span class="counter-total">${total}</span>`;
}
function mapPage() {
  return '<div class="language-space" aria-hidden="true"></div>'+html`<div class="page-title globe-title"><div><h1 class="halloween-title">Scary <span class="hello-accent">Hello</span>ween</h1><p>Join HelloTalk to Hear Friends Scream</p></div><div class="explore-counters" aria-label="Your parade stats"><button class="parade-counter reaction-inbox" data-action="reactions" aria-label="Friend opens / shares"><span class="counter-icon" aria-hidden="true">🎃</span><span class="counter-value" id="reaction-count">${counterFraction(player.shareVisits || 0, player.shareCount || 0)}</span></button><button class="parade-counter" data-action="collection" aria-label="Released spirits / total spirits"><span class="counter-icon" aria-hidden="true">👻</span><span class="counter-value" id="peace-count">${counterFraction(player.peaceCount, catalog.spirits.length)}</span></button></div></div>
  ${invite ? html`<button class="invite-ribbon" data-action="invite">${icon("share")} ${e(invite.name)} sent you a Halloween surprise ${icon("arrow")}</button>` : ""}
  <div class="explore-layout globe-layout"><section class="globe-explorer" aria-label="Explore cultures on the globe">
    <div class="globe-caption" role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></div>
    <div class="globe-viewport" tabindex="0" role="group" aria-label="Interactive globe. Drag to rotate, or use left and right arrow keys."><span class="globe-spark spark-one">✦</span><span class="globe-spark spark-two">✧</span><span class="globe-spark spark-three">✦</span><canvas aria-hidden="true"></canvas>
    <div class="globe-pins">${catalog.regions.map(r => {
      const friends=catalog.spirits.filter(x=>x.regionId===r.id),preview=regionPreviews[r.id];
      return friends.length ? friends.map(s=>html`<button class="globe-pin ${s.id===selected?'selected':''}" data-region="${r.id}" data-globe-spirit="${s.id}" data-preview-name="${e(s.name)}" data-preview-description="${e(s.shortDescription)}" data-spirit="${s.id}" aria-label="Explore ${e(s.name)} from ${e(r.name)}" hidden>${thumb(s)}</button>`).join('') : html`<button class="globe-pin soon" data-preview-name="${e(preview.name)}" data-preview-description="${e(msg`A folklore friend inspired by ${preview.culture}.`)}" data-region="${r.id}" aria-label="Explore ${e(r.name)}, stories coming soon" hidden><img src="${e(preview.thumb)}" alt="${e(preview.name)} preview" width="144" height="144" loading="lazy" draggable="false"></button>`;
    }).join('')}</div>
    </div>
    <div class="globe-zoom" role="group" aria-label="Globe zoom"><button data-zoom="in" aria-label="Zoom in">➕</button><span class="zoom-level" aria-live="polite">1 / 3</span><button data-zoom="out" aria-label="Zoom out">➖</button></div>
  </section></div>`;
}
function reactionMeter(id: string) {
  const stat=player.reactions?.stats.find(x=>x.spiritId===id);
  const hz=stat?.meanHz ?? null;
  return html`<div class="mini-meter reaction-meter" data-reaction-spirit="${e(id)}"><progress max="100" value="${pitchScore(hz)}" aria-label="Scariness game score"></progress><strong>Scariness ${pitchScore(hz)} / 100</strong></div>`;
}
function actionPair(id:string, preview=false) {
  return html`<div class="reaction-actions"><div>${preview ? html`<button class="spirit-action" disabled><span class="action-orb">🎃</span><span class="action-caption">Trick or Treat!</span></button>` : characterAction('🎃',t("Trick or Treat!"),'share','scare-action',t("Trick or Treat!"),id)}${reactionMeter(id)}</div></div>`;
}
function characterPanel() {
  const s = spirit(), r = catalog.regions.find(r => r.id === region)!;
  const p = progress(), friends = catalog.spirits.filter(x => x.regionId === region);
  const preview = regionPreviews[region];
  const index = friends.findIndex(x => x.id === selected);
  const previous = friends[(index - 1 + friends.length) % friends.length];
  const next = friends[(index + 1) % friends.length];
  const arrows = friends.length ? html`<button class="icon-button character-previous" data-spirit="${previous.id}" aria-label="Previous character in ${e(r.name)}">‹</button><button class="icon-button character-next" data-spirit="${next.id}" aria-label="Next character in ${e(r.name)}">›</button>` : html`<button class="icon-button character-previous" data-action="preview-page" data-direction="-1" aria-label="Previous region character">‹</button><button class="icon-button character-next" data-action="preview-page" data-direction="1" aria-label="Next region character">›</button>`;
  return html`<section class="selected-character globe-character" id="character-focus" tabindex="-1" aria-label="${e(friends.length?s.name:preview.name)}"><div class="character-navigation">${friends.length?html`<button class="icon-button" data-action="lore" aria-label="Read ${e(s.name)}'s story">${icon('book')}</button>`:html`<span></span>`}<div class="character-top-actions">${friends.length ? html`<button class="icon-button character-share" data-action="share" data-id="${e(s.id)}" aria-label="Share this character">${icon('shareCurve')}</button>` : ''}<button class="icon-button character-close" data-action="close-character" aria-label="Close character details">${icon('close')}</button></div></div><div class="character-stage" tabindex="0" role="group" aria-label="Character gallery. Swipe left or right to change character.">${arrows}<span class="stage-orbit"></span>${friends.length ? portrait(s,p?.peaceAt?'peace':'idle','hero-spirit',false) : html`<img class="region-preview-art hero-spirit" src="${e(preview.portrait)}" alt="${e(preview.name)} visual preview">`}${friends.length && s.art ? html`<button class="transformation-replay" data-play-transform aria-label="Replay transformation" hidden>↻</button>`:''}</div><div class="character-info">${friends.length && s.art ? html`<p data-personal-scare role="status" aria-live="polite" class="personal-scare"></p>` : ""}${actionPair(friends.length?s.id:region,!friends.length)}</div></section>`;
}
async function openReactions() {
  const data=await api('/me'); player=data.player;
  modal(html`<div class="modal-heading"><h2>Your friends said Boo!</h2><p>朋友观看变身时的 3 秒声音和本机评分会显示在这里，仅你可播放。名字使用已有昵称，没有昵称时使用你的链接备注或访客编号。</p></div>${player.reactions.recent.length?player.reactions.recent.map(r=>html`<article class="reaction-report"><strong>${e(r.name)} · ${e(spirit(r.spiritId)?.name)}</strong><p>${r.hasAudio?msg`${r.durationMs / 1000} 秒声音 · ${r.score == null ? t("未测得有效评分") : msg`本机评分 ${r.score} / 100`}`:r.meanHz===null?t("No clear voice detected"):msg`Average ${r.meanHz} Hz · Peak ${r.peakHz} Hz · ${e(t(r.level))}`}</p><p>${r.friendName ? msg`链接备注：${e(r.friendName)} · ` : ''}<a href="/i/${e(r.inviteId)}" target="_blank" rel="noopener">对应分享链接 · ${e(r.inviteId.slice(-6))}</a></p><small>${e(new Date(r.createdAt).toLocaleString(locale))}</small>${r.hasAudio?html`<audio controls preload="none" aria-label="${e(r.name)}的惊吓录音" src="/api/invites/${e(r.inviteId)}/audio/${e(r.receiverId)}"></audio>`:""}</article>`).join(''):html`<p>No shared reactions yet. Send a pumpkin surprise to a friend.</p>`}<h3>分享链接</h3>${player.reactions.links.map(link=>html`<article class="reaction-report"><strong>${e(link.friendName || t("未备注朋友"))} · ${e(spirit(link.spiritId)?.name)}</strong><p>${link.visits} 位朋友打开 · ${link.recordings} 条声音</p><a href="/i/${e(link.inviteId)}" target="_blank" rel="noopener">分享链接 · ${e(link.inviteId.slice(-6))}</a></article>`).join('')}`);
  player=(await api('/reactions/read',{})).player;
}
function codexPage() {
  return html`<div class="page-title"><div><h1>Your little<br><span>world of wonders.</span></h1><p>${player.peaceCount} wishes fulfilled. Every story is worth a little kindness.</p></div>${button(msg`${icon("globe")} Explore the map`, "map", "secondary")}</div><div class="codex-grid">${catalog.spirits
    .map((s) => {
      const p = progress(s.id);
      return html`<button class="codex-card ${p?.peaceAt ? "at-peace" : ""}" data-lore="${s.id}"><div class="codex-art">${portrait(s, p?.peaceAt ? "peace" : "idle")}</div><span class="codex-country">${flag(s.originCountry)} ${e(catalog.regions.find((r) => r.id === s.regionId)?.name)}</span><h2>${e(s.name)}</h2><span class="codex-status">${p?.peaceAt ? `${icon("heart")} ${e(s.peaceLabel)}` : msg`${p?.donated || 0} / 100 candies`}</span></button>`;
    })
    .join("")}</div>`;
}
function boardsPage() {
  return html`<div class="page-title"><div><h1>A world full<br><span>of good spirits.</span></h1><p>A little friendly competition. A lot of kindness.</p></div></div><div class="board-controls"><div class="segmented">${["players", "countries"].map((x) => html`<button data-scope="${x}" class="${boardScope === x ? "active" : ""}">${x === "players" ? t("People") : t("Countries & regions")}</button>`).join("")}</div><div class="segmented">${["candies", "peace"].map((x) => html`<button data-metric="${x}" class="${boardMetric === x ? "active" : ""}">${icon(x === "candies" ? "candy" : "heart")}${x === "candies" ? t("Candies collected") : t("Wishes fulfilled")}</button>`).join("")}</div></div><p class="board-note">All-time totals. Giving candy never lowers your candy rank. Tied scores share a rank.</p><div id="board-content" aria-live="polite"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>`;
}
async function loadBoard() {
  try {
    const data = await api(
      `/leaderboards?scope=${boardScope}&metric=${boardMetric}`,
    );
    const node = $("#board-content");
    if (!node || data.scope !== boardScope || data.metric !== boardMetric)
      return;
    const row = (r: any, self = false) =>
      html`<div class="board-row ${self ? "is-you" : ""}"><span class="rank">${r.rank <= 3 ? ["", "①", "②", "③"][r.rank] : r.rank}</span><span class="board-avatar">${boardScope === "countries" ? flag(r.country) : icon("ghost")}</span><span class="board-name"><strong>${boardScope === "countries" ? e(country(r.country)) : e(r.name)}${self ? html` <small>You</small>` : ""}</strong><span>${boardScope === "countries" ? msg`${r.participants} participants in the parade` : e(country(r.country))}</span></span><strong class="board-score">${Number(r.score).toLocaleString(locale)} ${icon(boardMetric === "candies" ? "candy" : "heart")}</strong></div>`;
    node.innerHTML = data.rows.length
      ? html`${data.self ? html`<div class="your-rank">${row(data.self, true)}</div>` : ""}<div class="board-list">${data.rows.map((r: any) => row(r)).join("")}</div><p class="board-note">Updates every minute. Your home is ${e(country(player.country))}.</p>`
      : html`<div class="empty-state">${icon("trophy")}<h2>The parade is just beginning.</h2><p>Choose a folklore friend to collect your first candies.</p>${button(t("Join the parade"), "map", "primary")}</div>`;
  } catch (err) {
    const n = $("#board-content");
    if (n)
      n.innerHTML = html`<div class="empty-state"><p>${e((err as Error).message)}</p>${button(t("Try again"), "reload-board", "secondary")}</div>`;
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
      html`<div class="modal-heading">${icon("ghost")}<h2>${e(player.name)}'s parade</h2><p>${flag(player.country!)} ${e(country(player.country))}</p></div><div class="personal-stats"><div><strong>${player.wallet}</strong><span>Candies to give</span></div><div><strong>${player.candies}</strong><span>Total collected</span></div><div><strong>${player.peaceCount}</strong><span>Wishes fulfilled</span></div></div><p class="fine-print">Your country stays fixed after your first candy. Your progress belongs to this browser. Clearing its cookies or opening another browser starts a new visit.</p>${button(t("Back to the world"), "close", "primary full")}`,
    );
    return;
  }
  modal(
    html`<div class="modal-heading">${icon("ghost")}<h2>Make yourself<br>at ghost.</h2><p>No account needed. A name, a home, and a little imagination.</p></div><form id="join-form"><label>Your parade name<input name="name" maxlength="24" autocomplete="nickname" value="${e(player.name)}" required></label><label>Your country or region<select name="country" required><option value="">Choose your home</option>${catalog.countries.map((c) => html`<option value="${c.code}">${e(c.name)}</option>`).join("")}</select></label><div class="join-character">${thumb(spirit())}<span>Your first folklore friend<strong>${e(spirit().name)}</strong></span><span class="welcome-candy">${icon("candy")} +30</span></div><p class="form-error" role="alert"></p><button class="button primary full" type="submit">Join the parade ${icon("arrow")}</button><p class="fine-print">Your country is fixed once you receive your welcome candies. You can explore characters from every culture.</p></form>`,
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
      toast(t("Welcome to the parade! 30 candies are in your bag."));
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
    burst($(".story-scene"), frame === 2 ? "candy" : "light");
  };
  show();
}
function openInvite() {
  if (!invite) return;
  const s = spirit(invite.spiritId);
  const invitation = invite;
  modal(html`<div class="invitation-film"><div class="invitation-stage"><div class="invitation-consent">${pumpkinGreeting()}<p>${e(invitation.name)} 邀请你观看 ${e(s.name)} 变身。</p><button class="button primary full" data-invite-play ${invitation.expired ? 'disabled' : ''}>${invitation.expired ? t("邀请已过期") : t("接受朋友的万圣节邀请")}</button></div></div></div>`);
  const dialog = overlay.querySelector<HTMLDialogElement>('dialog')!;
  dialog.classList.add('invitation-result', 'invitation-cinema');
  dialog.querySelector<HTMLButtonElement>('[data-invite-play]')!.onclick = () => {
    selected = s.id;
    region = s.regionId;
    revealCharacter(false, {inviteId:invitation.id});
  };
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
        data.receiverReward
          ? msg`Boo received! ${data.receiverReward} candies are in your bag.`
          : msg`Your Boo is on its way back to ${name}.`,
      );
    } catch (err) {
      toast((err as Error).message);
    }
  });
}
function openShare(id = selected) {
  const s = spirit(id);
  requirePlayer(() => {
    modal(
      html`<button class="icon-button modal-close share-shortcut" aria-label="Choose a sharing app">${icon("shareCurve")}</button><div class="share-preview"><div>${portrait(s, "scare")}<span>Boo from ${e(s.culture)}!</span></div><h2>A little fright.<br>A world of friendship.</h2></div><div class="modal-heading"><h2>Who needs a little Boo?</h2><p>Send ${e(s.name)} on a friendly Halloween visit.</p></div><label>Friend’s name / 朋友备注（可选）<input id="share-friend-name" maxlength="24" placeholder="例如：小明"></label><p class="fine-print">每次分享生成独立链接。备注仅你可见，可用来识别朋友的声音；朋友无需填写名字。</p><div class="share-options">${[
        ["x", t("Scare X Friends")],
        ["line", t("Scare Line Friends")],
        ["facebook", t("Scare Messenger Friends")],
        ["kakao", t("Scare Kakao Friends")],
        ["wechat", t("Scare Wechat Friends")],
        ["copy", t("Copy link")],
      ]
        .map(([channel, label]) =>
          button(
            `${channel === "copy" ? icon("copy") : icon("share")} ${label}`,
            "send-share",
            "secondary",
            `data-channel="${channel}" data-id="${id}"`,
          ),
        )
        .join(
          "",
        )}</div><p class="fine-print">${catalog.inviteRewards ? t("X, LINE and eligible direct invitations can earn a first-visit candy bonus. Facebook sharing has no invitation bonus.") : t("Invitation bonuses are currently paused. Every friend can still play and collect candies.")} Rewards follow a friend's in-game response, not opening a share panel.</p><div id="share-link"></div>${s.art ? button(msg`${icon("download")} Save the character card`, "download", "text-button full", `data-id="${id}"`) : ""}`,
    );
    overlay.querySelector<HTMLButtonElement>('.share-shortcut')!.onclick = () => {
      overlay.querySelector<HTMLButtonElement>('[data-action="send-share"]')?.focus();
      overlay.querySelector('.share-options')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    };
  });
}
let shareRequest = 0;
async function sendShare(id: string, channel: string, btn: HTMLButtonElement) {
  const request = ++shareRequest;
  btn.disabled = true;
  const node = $("#share-link");
  try {
    const friendName = $("#share-friend-name") as HTMLInputElement | null;
    const data = await api("/invites", { spiritId: id, channel, friendName: friendName?.value.trim() || "" });
    if (!node?.isConnected || request !== shareRequest) return;
    if (channel === 'copy') {
      node.innerHTML = html`<label class="share-link-label">Your invitation link<input readonly aria-label="Invitation link" value="${e(data.url)}"></label>`;
      await copyLink(data.url);
    } else {
      await mountSocialHandoff(node, channel, data.url, msg`Boo! ${spirit(id).name} has a little Halloween surprise for you.`, asset(spirit(id).art?.share || '/art/world-map.webp'));
    }
  } catch (err) { toast((err as Error).message); }
  finally { btn.disabled = false; }
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
    html`<div class="modal-heading">${icon("globe")}<h2>Many cultures.<br>A little shared kindness.</h2></div><p>This parade brings together ghosts, spirits, creatures and figures from folklore and literature. They do not all represent the souls of people who have died.</p><p>Each character's cultural background has its own source links. The warm three-part endings are new Halloween stories written for this game, not claims about the original traditions.</p><p>Countries on the leaderboard are chosen by players. Folklore can belong to several communities, and a map marker never means exclusive ownership.</p><h3>Your visit</h3><p>We store a guest identifier in this browser, your chosen nickname and country, game progress, reward records and aggregate activity counts. There is no SNS login, contact-list import or cross-device account.</p><p>If you enable the microphone, your first character transformation samples your voice on your device for 3 seconds. Volume and pitch produce a playful personal scariness score, saved per character in this browser; ordinary exploration does not save or upload raw audio. This is a game score, not a measurement of fear. For invitations, your nickname, average and peak pitch, game level and response time are shared with the inviter. When you unlock an invitation visit, the unlock confirmation explains that watching the invited transformation records three seconds and automatically uploads the recording and local game score for the inviter alone to play. The server uses your existing nickname, the inviter’s link label, or your guest identifier; no name entry is required. These labels are not verified SNS identities. Other microphone pitch checks store numeric results only. Silence and unclear sound are marked as unmeasured. Microphone access is required to unlock play. Confirm the brief gameplay and microphone notice after tapping unlock; there is no separate invitation consent form.</p><p class="fine-print">No cash prizes or purchases. Clearing browser cookies loses access to this guest's progress.</p>${hellotalk()}<div class="store-links"><a href="https://apps.apple.com/us/app/hellotalk-language-learning/id557130558" target="_blank" rel="noopener noreferrer" data-ht="store">App Store</a><a href="https://play.google.com/store/apps/details?id=com.hellotalk" target="_blank" rel="noopener noreferrer" data-ht="store">Google Play</a></div>`,
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
  modal(html`<div class="modal-heading"><h2 id="unlock-title">开始前，了解一下</h2></div><ul class="unlock-points" id="unlock-points"><li>探索地球，观看小鬼变身。</li><li>开启麦克风，采集 3 秒声音，在本机计算游戏评分。</li><li>${invite && !invite.expired ? msg`此次邀请的录音与评分会自动上传，仅邀请人 ${e(invite.name)} 可播放。` : t("普通探索不上传声音；朋友邀请中的录音与评分会自动上传，仅邀请人可播放。")}</li><li>录音中可随时取消或关闭。</li></ul><p class="unlock-acceptance">点击确认，即表示接受以上玩法与授权。</p><button class="button primary full" data-confirm-unlock>确认并开启麦克风</button>`);
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
  mic?.stop();mic=undefined;gateBusy=false;gate=false;
  app.querySelector('.play-lock')?.remove();
  const shell=app.querySelector<HTMLElement>('.app-shell');if(shell)shell.inert=false;
  if(invite)openInvite();
  if(playbackContext)bgm.start(playbackContext);
}
async function enterGate() {
  if(!gate||gateBusy)return;
  gateBusy=true;
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
    if(status)status.textContent=t("Allow microphone access in your browser, then tap to try again. The game is still locked.");
  }
}
document.addEventListener("click", async (ev) => {
  const target = (ev.target as HTMLElement).closest<HTMLElement>(
    "button,[data-ht]",
  );
  if (!target) return;
  if (characterLocked) return;
  if (gate && !["enter", "stats-help", "close"].includes(target.dataset.action || "")) return;
  if (target.dataset.ht) {
    event("hellotalk_clicked", target.dataset.ht);
    return;
  }
  if (target.hasAttribute("disabled")) return;
  try {
    if (target.dataset.page) {
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
    if (target.dataset.scope) {
      boardScope = target.dataset.scope;
      render();
      return;
    }
    if (target.dataset.metric) {
      boardMetric = target.dataset.metric;
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
      case "stats-help":
        modal(html`<div class="sheet-handle" aria-hidden="true"></div><div class="stats-sheet-heading"><span aria-hidden="true">✦ 🎃 ✦</span><h2 id="stats-sheet-title">Your Halloween magic</h2></div><div class="stats-guide"><section><span aria-hidden="true">🎃</span><div><h3>Friend opens / Shares</h3><p>Unique friend visits / share links created.</p></div></section><section><span aria-hidden="true">👻</span><div><h3>Released / Total spirits</h3><p>Wishes completed / spirits to discover.</p></div></section></div><p class="stats-sheet-note">Repeat visits to the same link count once. A share link is not a confirmed send.</p>`);
        overlay.querySelector('dialog')!.classList.add('stats-sheet');
        overlay.querySelector('dialog')!.setAttribute('aria-labelledby','stats-sheet-title');
        break;
      case "reactions":
        await openReactions();
        break;
      case "preview-page": {
        const regions = catalog.regions;
        const i = regions.findIndex(r=>r.id === region);
        region = regions[(i + Number(target.dataset.direction) + regions.length) % regions.length].id;
        const first = catalog.spirits.find(x=>x.regionId===region);
        if(first) selected=first.id;
        render(); revealCharacter(); break;
      }
      case "collection":
        closeModal();
        page = "codex";
        render();
        break;
      case "map":
        closeModal();
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
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("page-hidden", document.hidden);
  if (!document.hidden && player?.initialized) {
    void api("/me")
      .then((d) => {
        player = d.player;
        if (!overlay.querySelector("dialog") && !gate) render();
      })
      .catch(() => {});
  }
});
setInterval(() => {
  if (!document.hidden && player?.initialized && !gate)
    void api('/me').then(d=>{
      player=d.player;
      const unread=player.reactions.recent.filter(r=>!r.seenAt);
      for(const r of unread) {
        const key=r.inviteId+r.receiverId;
        if(notified.has(key))continue;notified.add(key);
        toast(msg`${r.name}: ${r.hasAudio?msg`sent a ${r.durationMs / 1000}-second voice reaction`:r.meanHz===null?t("no clear voice"):msg`peak ${r.peakHz} Hz · ${t(r.level)}`} — open Friend reactions`);
      }
      const count=$('#reaction-count'); if(count)count.innerHTML=counterFraction(player.shareVisits || 0, player.shareCount || 0);
      const peace=$('#peace-count');if(peace)peace.innerHTML=counterFraction(player.peaceCount, catalog.spirits.length);
      const meter=overlay.querySelector<HTMLElement>('[data-reaction-spirit]');
      if(meter)meter.outerHTML=reactionMeter(meter.dataset.reactionSpirit!);
    }).catch(()=>{});
}, 15000);
async function boot() {
  try {
    await initLanguage();
    Object.assign(regionPreviews, localizedContent(regionPreviews));
    const [content, session] = await Promise.all([
      api<Catalog>("/catalog"),
      api("/session", {}),
    ]);
    catalog = content;
    player = session.player;
    selected = player.selected || "kappa";
    region = spirit().regionId;
    const token = location.pathname.match(/^\/i\/([\w-]+)$/)?.[1];
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
    showGate();
  } catch (err) {
    app.innerHTML = html`<main class="boot"><span>${icon("moon")}</span><h1>The lanterns need a moment.</h1><p>${e((err as Error).message)}</p>${button(t("Light them again"), "retry", "primary")}</main>`;
  }
}
void boot();
