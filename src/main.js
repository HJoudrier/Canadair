// Point d'entrée : rendu, menus, appareils d'entrée, lancement des parties (solo, coop, VR).
import * as THREE from 'three';
import { Keyboard } from './input/keyboard.js';
import { Gamepads } from './input/gamepad.js';
import { TouchControls, isTouchDevice } from './input/touch.js';
import { Gyro } from './input/gyro.js';
import { XRInput } from './input/xrInput.js';
import { Sfx } from './audio/sfx.js';
import { Radio } from './audio/radio.js';
import { Menu, translateDom } from './ui/menu.js';
import { Game } from './game/game.js';
import { setLang, detectLang, t } from './i18n/index.js';
import { randomSeed } from './core/rng.js';

// ---------- Réglages ----------
const params = new URLSearchParams(location.search);
const DEFAULTS = {
  lang: detectLang(), arrows: true, voice: true, volume: 0.8, invert: false,
  quality: 'auto', stick: false, mission: 'mission', seed: randomSeed(),
};
const KEY = 'canadair.settings.v1';
function loadSettings() {
  let s = { ...DEFAULTS };
  try { s = { ...s, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { /* stockage indisponible */ }
  if (params.get('lang')) s.lang = params.get('lang');
  if (params.get('seed')) s.seed = Number(params.get('seed')) || s.seed;
  if (params.get('quality')) s.quality = params.get('quality');
  if (params.get('mission')) s.mission = params.get('mission');
  if (params.get('voice') === '0') s.voice = false;
  return s;
}
const settings = loadSettings();
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* rien */ } }
setLang(settings.lang);
document.documentElement.lang = settings.lang;

// ---------- Appareil ----------
// Edge sur Xbox : par défaut la manette simule une souris/un clavier et la page ne voit aucune
// manette. `gamepadInputEmulation = 'gamepad'` rend les boutons à l'API Gamepad. On le réaffirme
// souvent (démarrage, focus, clic, événements manette) car certaines versions l'ignorent au chargement.
const isXbox = /Xbox/i.test(navigator.userAgent);
function applyPadEmulation() {
  try {
    if ('gamepadInputEmulation' in navigator || isXbox) navigator.gamepadInputEmulation = 'gamepad';
  } catch (_) { /* autres navigateurs */ }
}
applyPadEmulation();
for (const ev of ['focus', 'pointerdown', 'click', 'keydown', 'gamepadconnected', 'visibilitychange']) {
  window.addEventListener(ev, applyPadEmulation);
}
// L'Xbox annonce parfois un écran tactile : ce n'est pas un téléphone.
const touch = !isXbox && isTouchDevice();
const isQuest = /OculusBrowser|Quest|Pacific/i.test(navigator.userAgent);
const isMobile = touch && Math.min(screen.width, screen.height) < 900;
document.body.classList.toggle('touch', touch);

const PRESETS = {
  low: { pixelRatio: 1, trees: 1, flames: 200, smoke: 140, clouds: 12, fogFar: 2600, drops: 300, splash: 200 },
  medium: { pixelRatio: 1.25, trees: 1, flames: 260, smoke: 200, clouds: 18, fogFar: 3000, drops: 360, splash: 260 },
  high: { pixelRatio: 2, trees: 2, flames: 360, smoke: 260, clouds: 26, fogFar: 3400, drops: 420, splash: 320 },
};
function quality() {
  if (settings.quality === 'low') return PRESETS.low;
  if (settings.quality === 'high') return PRESETS.high;
  if (isQuest) return PRESETS.medium;
  return isMobile ? PRESETS.low : PRESETS.high;
}

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality().pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xbfe6ff);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.domElement.id = 'view';
document.getElementById('app').prepend(renderer.domElement);
window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (game) game.layout();
});

// ---------- Sons, radio, entrées ----------
const sfx = new Sfx();
sfx.setVolume(settings.volume);
const radioEl = document.getElementById('radio');
const radio = new Radio(sfx, (text) => {
  radioEl.classList.toggle('hidden', !text);
  if (text) radioEl.querySelector('.radio-text').textContent = text;
});
radio.voiceOn = settings.voice;
const devices = {
  keyboard: new Keyboard(),
  gamepads: new Gamepads(),
  touch: new TouchControls(document.getElementById('touch'), t),
  gyro: new Gyro(),
  xr: new XRInput(renderer),
  console: isXbox,
};
const menu = new Menu(sfx);
const hudRoot = document.getElementById('hud');

// ---------- État ----------
let game = null;
let state = 'menu';            // menu | loading | playing | paused | end
const sel = { mode: 'solo', difficulty: 'easy', controls: [] };
let gyroCheckT = 0;

function toast(text, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ---------- Textes ----------
function settingLabel(k) {
  const onoff = (v) => (v ? t('on') : t('off'));
  switch (k) {
    case 'lang': return `🌍 ${t('settings.lang')} : ${settings.lang === 'fr' ? 'Français' : 'English'}`;
    case 'arrows': return `➡️ ${t('settings.arrows')} : ${onoff(settings.arrows)}`;
    case 'voice': return `📻 ${t('settings.voice')} : ${onoff(settings.voice)}`;
    case 'volume': return `🔊 ${t('settings.volume')} : ${Math.round(settings.volume * 100)} %`;
    case 'invert': return `↕️ ${t('settings.invert')} : ${onoff(settings.invert)}`;
    case 'quality': return `✨ ${t('settings.quality')} : ${t('q.' + settings.quality)}`;
    case 'stick': return `🕹️ ${t('settings.stick')} : ${onoff(settings.stick)}`;
    case 'mission': return `🎯 ${t('settings.mission')} : ${t('mode.' + settings.mission)}`;
    case 'seed': return `🗺️ ${t('settings.seed')} ${settings.seed} — ${t('settings.newSeed')}`;
    default: return k;
  }
}

function refreshTexts() {
  translateDom();
  for (const b of document.querySelectorAll('[data-setting]')) b.textContent = settingLabel(b.dataset.setting);
  document.querySelector('.lang-flag').textContent = settings.lang === 'fr' ? '🇫🇷 Français' : '🇬🇧 English';
  devices.touch.updateLabels();
  if (game) for (const pl of game.players) pl.hud.relabel();
}

function changeSetting(k, dir = 1) {
  const cycle = (arr, v) => arr[(arr.indexOf(v) + dir + arr.length) % arr.length];
  switch (k) {
    case 'lang': settings.lang = settings.lang === 'fr' ? 'en' : 'fr'; setLang(settings.lang); document.documentElement.lang = settings.lang; break;
    case 'arrows': settings.arrows = !settings.arrows; break;
    case 'voice': settings.voice = !settings.voice; radio.voiceOn = settings.voice; break;
    case 'volume': settings.volume = cycle([0, 0.25, 0.5, 0.75, 1], settings.volume); sfx.setVolume(settings.volume); break;
    case 'invert': settings.invert = !settings.invert; break;
    case 'quality': settings.quality = cycle(['auto', 'low', 'high'], settings.quality); break;
    case 'stick': settings.stick = !settings.stick; break;
    case 'mission': settings.mission = settings.mission === 'mission' ? 'free' : 'mission'; break;
    case 'seed': settings.seed = randomSeed(); break;
    default: break;
  }
  sfx.click();
  saveSettings();
  refreshTexts();
}

for (const b of document.querySelectorAll('[data-setting]')) {
  b.addEventListener('click', () => changeSetting(b.dataset.setting, 1));
  b.addEventListener('cycle', (e) => changeSetting(b.dataset.setting, e.detail));
}

// ---------- Préparation téléphone (dans le geste de l'utilisateur) ----------
function preparePhone() {
  if (!touch) return;
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }
  if (!settings.stick) devices.gyro.enable();
}

// ---------- Actions des menus ----------
function on(screen, action, fn) {
  for (const b of menu.el(screen).querySelectorAll(`[data-action="${action}"]`)) b.addEventListener('click', fn);
}

function chooseMode(mode) {
  sfx.init();
  sel.mode = mode;
  menu.show('diff');
}
on('title', 'solo', () => chooseMode('solo'));
on('title', 'split', () => chooseMode('split'));
on('title', 'shared', () => chooseMode('shared'));
on('title', 'vr', () => chooseMode('vr'));
on('title', 'settings', () => { sfx.init(); menu.show('settings'); });
on('title', 'lang', () => changeSetting('lang'));
on('diff', 'back', () => menu.show('title'));
on('join', 'back', () => menu.show('diff'));
on('settings', 'back', () => menu.show('title'));
menu.onBack('diff', () => menu.show('title'));
menu.onBack('join', () => menu.show('diff'));
menu.onBack('settings', () => menu.show('title'));
menu.onBack('pause', () => resume());

for (const card of menu.el('diff').querySelectorAll('[data-diff]')) {
  card.addEventListener('click', () => {
    sel.difficulty = card.dataset.diff;
    sfx.init();
    if (sel.mode === 'vr') { startVR(); return; }
    if (sel.mode === 'solo') { preparePhone(); sel.controls = [{ kind: 'any' }]; startGame(); return; }
    menu.show('join');
    updateJoin();
  });
}

/** Affecte les appareils aux deux joueurs (manettes d'abord, puis clavier). */
function assignControls() {
  const n = devices.gamepads.count;
  const kb = !touch;
  const list = [];
  for (let k = 0; k < Math.min(2, n); k++) list.push({ kind: 'pad', slot: k });
  if (list.length < 2 && kb) list.push({ kind: 'keyboard' });
  return list;
}

function updateJoin() {
  const c = assignControls();
  const shared = sel.mode === 'shared';
  const slots = menu.el('join').querySelectorAll('.slot');
  slots.forEach((el, i) => {
    el.querySelector('.slot-name').textContent = shared ? t(i ? 'join.copilot' : 'join.pilot') : t(i ? 'join.p2' : 'join.p1');
    const d = c[i];
    el.classList.toggle('ready', !!d);
    el.querySelector('.slot-ico').textContent = d ? (d.kind === 'pad' ? '🎮' : '⌨️') : '❔';
    el.querySelector('.slot-state').textContent = d ? (d.kind === 'pad' ? `#${d.slot + 1} ${t('join.ready')}` : `${t('join.keyboard')} ${t('join.ready')}`) : t('join.press');
  });
  const ok = c.length >= 2 || (shared && c.length >= 1);
  menu.el('join').querySelector('.join-help').classList.toggle('hidden', c.length >= 2);
  menu.el('join').querySelector('[data-action="startJoin"]').disabled = !ok;
  sel.controls = c;
}
on('join', 'startJoin', () => { updateJoin(); startGame(); });

on('pause', 'resume', () => resume());
on('pause', 'camera', () => { if (game) { for (const pl of game.players) pl.camCtl.toggle(); } resume(); });
on('pause', 'calibrate', () => { devices.gyro.calibrate(); toast('📱 ✓', 1200); resume(); });
on('pause', 'quit', () => quitToMenu());
on('end', 'replay', () => startGame());
on('end', 'newmap', () => { settings.seed = randomSeed(); saveSettings(); refreshTexts(); startGame(); });
on('end', 'menu', () => quitToMenu());

// ---------- Parties ----------
function startGame() {
  sfx.init();
  state = 'loading';
  if (sel.mode !== 'vr') menu.show('loading');
  setTimeout(buildGame, 60);
}

function buildGame() {
  if (game) { game.dispose(); game = null; }
  const q = quality();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  game = new Game({
    renderer, sfx, radio, devices, settings, hudRoot, quality: q,
    mode: sel.mode, difficulty: sel.difficulty, seed: settings.seed, missionType: settings.mission,
    controls: sel.controls.length ? sel.controls : [{ kind: 'any' }],
    onEnd: (stats) => endGame(stats),
    onPause: () => pause(),
  });
  game.build();
  const solo = sel.mode === 'solo';
  devices.touch.configure({
    visible: touch && solo,
    useStick: touch && solo && (settings.stick || !devices.gyro.enabled),
    showThrottle: touch && solo && sel.difficulty === 'hard',
  });
  gyroCheckT = 2.5;
  menu.hide();
  document.body.classList.add('playing');
  state = 'playing';
  game.start();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  if (game && game.vr) { game.paused = true; return; }
  menu.el('pause').querySelector('.gyro-only').classList.toggle('hidden', !devices.gyro.enabled);
  menu.show('pause');
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  if (game) game.paused = false;
  menu.hide();
}

function quitToMenu() {
  if (renderer.xr.isPresenting) { const s = renderer.xr.getSession(); if (s) s.end(); }
  if (game) { game.dispose(); game = null; }
  devices.touch.configure({ visible: false, useStick: false, showThrottle: false });
  document.body.classList.remove('playing');
  state = 'menu';
  menu.show('title');
}

function endGame(stats) {
  state = 'end';
  const el = menu.el('end');
  el.querySelector('.end-title').textContent = stats.win ? '🎉 ' + t('end.win') : '🔥 ' + t('end.fail');
  el.querySelectorAll('.stars span').forEach((s, i) => s.classList.toggle('on', i < stats.stars));
  const fmtTime = `${Math.floor(stats.time / 60)}:${String(stats.time % 60).padStart(2, '0')}`;
  el.querySelector('.end-stats').innerHTML = [
    ['🌲', t('end.forest'), stats.forest + ' %'],
    ['🏠', t('end.houses'), stats.housesSaved + ' %'],
    ['🔥', t('end.fires'), stats.fires],
    ['💧', t('end.drops'), stats.drops],
    ['🚿', t('end.liters'), stats.liters.toLocaleString(settings.lang)],
    ['⏱️', t('end.time'), fmtTime],
  ].map(([i, l, v]) => `<div class="stat"><span class="si">${i}</span><span class="sl">${l}</span><b>${v}</b></div>`).join('');
  if (renderer.xr.isPresenting) { const s = renderer.xr.getSession(); if (s) s.end(); }
  menu.show('end');
}

// ---------- VR ----------
async function checkVR() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return;
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    menu.el('title').querySelector('[data-action="vr"]').classList.toggle('hidden', !ok);
    if (ok && isQuest) menu.el('title').querySelector('[data-action="vr"]').classList.add('primary');
  } catch (_) { /* pas de VR */ }
}

async function startVR() {
  if (!navigator.xr) { toast(t('vr.unsupported')); return; }
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    session.addEventListener('end', () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (state === 'playing' || state === 'paused' || state === 'loading') quitToMenu();
    });
    sel.controls = [{ kind: 'any' }];
    startGame();
  } catch (e) {
    toast(t('vr.unsupported'));
  }
}

// ---------- Boucle principale ----------
let last = performance.now();
let lastEmu = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  devices.gamepads.poll();
  if (devices.gamepads.count === 0 && now - lastEmu > 1000) { applyPadEmulation(); lastEmu = now; }
  const menuOpen = !!menu.current;
  const nav = [...devices.keyboard.nav(), ...devices.gamepads.nav()];

  if (state === 'playing' && game) {
    game.frame(dt);
    game.render();
    if (gyroCheckT > 0) {
      gyroCheckT -= dt;
      if (gyroCheckT <= 0 && devices.touch.visible && devices.gyro.enabled && !devices.gyro.available) {
        devices.touch.configure({ visible: true, useStick: true, showThrottle: sel.difficulty === 'hard' });
        toast(t('gyro.denied'));
      }
    }
  } else if (game && (state === 'paused' || state === 'end')) {
    if (state === 'paused' && game.vr) {
      const inp = game.collectInputs();
      if (inp.some((i) => i.pause)) resume();
      game.updateHud(dt);
    }
    game.render();
  } else if (renderer.xr.isPresenting) {
    renderer.clear();
  }

  if (menuOpen) {
    if (menu.current === 'pause' && nav.includes('start')) resume();
    else menu.handle(nav);
    if (menu.current === 'join') updateJoin();
    if (menu.current === 'title') {
      const n = devices.gamepads.count;
      const el = menu.el('title').querySelector('.pads-status');
      const txt = n ? '🎮 ' + t('menu.pads', { n }) : (isXbox ? '🎮 ' + t('menu.padsHint') : '');
      if (el.textContent !== txt) el.textContent = txt;
    }
  }
  radio.update(dt);
  devices.keyboard.endFrame();
});

// ---------- Démarrage ----------
refreshTexts();
checkVR();
menu.show('title');

// Lancement direct pour les tests : ?auto=1&mode=solo&diff=easy&seed=42
if (params.get('auto') === '1') {
  devices.gamepads.poll();
  sel.mode = params.get('mode') || 'solo';
  sel.difficulty = params.get('diff') || 'easy';
  sel.controls = sel.mode === 'solo' ? [{ kind: 'any' }] : assignControls();
  startGame();
}
window.__app = { settings, devices, menu, get game() { return game; }, get state() { return state; }, startGame, sel };
