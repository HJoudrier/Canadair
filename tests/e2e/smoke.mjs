// Test de fumée de bout en bout dans Chromium (Playwright) avec captures d'écran.
// Usage : node tests/e2e/smoke.mjs [dossier-captures]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'tests/e2e/screenshots'));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failures++; };

async function open(query, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...opts.context });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + 'index.html?voice=0&quality=low&' + query, { waitUntil: 'load' });
  return { ctx, page, errors };
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const waitGame = (page) => page.waitForFunction(() => window.__game && window.__app.state === 'playing', null, { timeout: 30000 });

/** Avance la simulation sans attendre le rendu (beaucoup plus rapide en headless). */
async function ff(page, seconds, until = null) {
  return page.evaluate(([sec, cond]) => {
    const g = window.__game;
    const test = cond ? new Function('g', 'return ' + cond) : null;
    for (let t = 0; t < sec; t += 1 / 30) {
      g.devices.gamepads.poll();
      g.frame(1 / 30);
      if (test && test(g)) break;
    }
    g.render();
    const p = g.planes[0];
    return { t: g.time, alt: p.alt, onGround: p.onGround, tank: p.tank, drops: p.stats.drops, ext: g.drops.totalExtinguished, burning: g.fire.burningCount, fires: g.activeFires.length, complete: g.mission.complete };
  }, [seconds, until]);
}

const AUTOPILOT = () => {
  window.__game.autopilot = (g) => {
    const p = g.planes[0];
    const pl = g.players[0];
    const out = { steer: 0, pitch: 0, go: true };
    const tg = pl.target;
    if (!p.onGround && tg) {
      const h = Math.atan2(tg.x - p.x, -(tg.z - p.z));
      let d = h - p.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      out.steer = Math.max(-1, Math.min(1, d * 2));
      if (tg.kind === 'fire' && p.tank > 0.9 && pl.marker.visible) {
        const dd = Math.hypot(pl.marker.position.x - tg.x, pl.marker.position.z - tg.z);
        if (dd < 60) { out.dropPressed = true; out.drop = true; }
      }
    }
    return out;
  };
};

// 1. Menu et navigation
console.log('Menu');
{
  const { ctx, page, errors } = await open('lang=fr');
  await page.waitForTimeout(800);
  await shot(page, '01-menu-fr');
  await page.click('[data-action="solo"]');
  await page.waitForTimeout(300);
  await shot(page, '02-difficulte');
  check(await page.isVisible('#screen-diff'), 'écran de choix du niveau');
  await page.click('[data-diff="easy"]');
  await waitGame(page);
  check(true, 'partie lancée depuis le menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.isVisible('#screen-pause'), 'pause avec Échap');
  await shot(page, '03-pause');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 2. Mission solo complète en accéléré (Petit pilote)
console.log('Solo Petit pilote');
{
  const { ctx, page, errors } = await open('auto=1&mode=solo&diff=easy&seed=42&lang=fr');
  await waitGame(page);
  await page.waitForTimeout(500);
  await shot(page, '04-piste');
  await page.evaluate(AUTOPILOT);
  let s = await ff(page, 20, '!g.planes[0].onGround && g.planes[0].alt > 30');
  check(!s.onGround, `décollage (alt ${s.alt.toFixed(0)} m)`);
  await shot(page, '05-vol');
  s = await ff(page, 120, 'g.planes[0].scooping');
  check(s.tank > 0, `écopage commencé (réservoir ${(s.tank * 100).toFixed(0)} %)`);
  await shot(page, '06-ecopage');
  s = await ff(page, 20, 'g.planes[0].tank >= 1');
  check(s.tank >= 0.99, 'réservoir plein');
  s = await ff(page, 150, 'g.planes[0].stats.drops > 0');
  check(s.drops > 0, 'largage effectué');
  await ff(page, 0.6);
  await shot(page, '07-largage');
  s = await ff(page, 5);
  check(s.ext > 0, `cases éteintes : ${s.ext}`);
  await shot(page, '08-apres-largage');
  s = await ff(page, 600, 'g.mission.complete');
  console.log('    état après 10 min :', JSON.stringify(s));
  check(s.ext > 10, 'plusieurs largages efficaces');
  // Vue cockpit
  await page.evaluate(() => { window.__game.players[0].camCtl.toggle(); });
  await ff(page, 0.2);
  await shot(page, '09-cockpit');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 3. Écran partagé avec deux manettes simulées
const FAKE_PADS = () => {
  const mk = (index) => ({
    index, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: { playEffect: () => Promise.resolve('complete') },
  });
  window.__pads = [mk(0), mk(1)];
  navigator.getGamepads = () => window.__pads;
};
console.log('Écran partagé');
{
  const { ctx, page, errors } = await open('auto=1&mode=split&diff=easy&seed=7&lang=fr', { init: FAKE_PADS });
  await waitGame(page);
  const n = await page.evaluate(() => window.__game.players.length);
  check(n === 2, 'deux avions');
  await page.evaluate(() => { window.__pads[0].buttons[0].pressed = true; window.__pads[1].buttons[7].value = 1; window.__pads[1].buttons[7].pressed = true; });
  await ff(page, 0.1);
  await page.evaluate(() => { window.__pads[0].buttons[0].pressed = false; });
  await ff(page, 12);
  await page.evaluate(() => { window.__pads[0].axes[0] = -0.8; window.__pads[1].axes[0] = 0.8; });
  const s = await ff(page, 6);
  const both = await page.evaluate(() => window.__game.planes.map((p) => ({ g: p.onGround, h: p.heading })));
  check(!both[0].g && !both[1].g, 'les deux avions ont décollé');
  check(both[0].h !== both[1].h, 'chaque manette pilote son avion');
  void s;
  await page.waitForTimeout(300);
  await shot(page, '10-ecran-partage');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 4. Avion commun : le copilote (LB) prend la main
console.log('Avion commun');
{
  const { ctx, page, errors } = await open('auto=1&mode=shared&diff=easy&seed=9&lang=fr', { init: FAKE_PADS });
  await waitGame(page);
  const mixed = await page.evaluate(() => {
    const g = window.__game;
    window.__pads[0].axes[0] = 1;          // l'enfant tourne à fond à droite
    window.__pads[1].axes[0] = -0.6;       // l'adulte corrige à gauche
    g.devices.gamepads.poll();
    const a = g.collectInputs()[0].steer;
    window.__pads[1].buttons[4].pressed = true; // LB : le copilote prend la main
    g.devices.gamepads.poll();
    const b = g.collectInputs()[0].steer;
    return { a, b, cop: g.copilotOn };
  });
  check(Math.abs(mixed.a - 0.4) < 0.1, `commandes additionnées (${mixed.a.toFixed(2)})`);
  check(mixed.b < -0.4 && mixed.cop, `copilote prioritaire avec LB (${mixed.b.toFixed(2)})`);
  await page.evaluate(() => { window.__pads[0].buttons[0].pressed = true; });
  await ff(page, 0.1);
  await page.evaluate(() => { window.__pads[0].buttons[0].pressed = false; });
  await ff(page, 15);
  await page.waitForTimeout(300);
  await shot(page, '11-avion-commun');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 5. Téléphone en paysage avec gyroscope simulé
console.log('Téléphone');
{
  const phone = devices['Pixel 7'];
  const { ctx, page, errors } = await open('auto=1&mode=solo&diff=easy&seed=11&lang=fr', {
    context: { ...phone, viewport: { width: phone.viewport.height, height: phone.viewport.width }, isMobile: true, hasTouch: true },
    // Chromium sans capteurs n'expose pas toujours l'API : on la simule
    init: () => { if (!('DeviceOrientationEvent' in window)) window.DeviceOrientationEvent = function DeviceOrientationEvent() {}; },
  });
  await waitGame(page);
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const gyro = g.devices.gyro;
    await gyro.enable();
    const fire = (beta, gamma) => {
      const e = new Event('deviceorientation');
      Object.assign(e, { alpha: 0, beta, gamma });
      window.dispatchEvent(e);
    };
    fire(0, -50);                     // téléphone en paysage, incliné vers soi
    gyro.calibrate();
    fire(20, -50);                    // on tourne comme un volant
    const inp = { steer: 0, pitch: 0 };
    gyro.read(inp);
    return { steer: inp.steer, avail: gyro.available, touch: g.devices.touch.visible };
  });
  check(res.avail && Math.abs(res.steer) > 0.3, `gyroscope → virage (${res.steer.toFixed(2)})`);
  check(res.touch, 'commandes tactiles visibles');
  await page.waitForTimeout(500);
  await shot(page, '12-telephone');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 6. Bouton VR (WebXR simulé) et anglais
console.log('VR et anglais');
{
  const { ctx, page, errors } = await open('lang=en', {
    init: () => { Object.defineProperty(navigator, 'xr', { value: { isSessionSupported: () => Promise.resolve(true), requestSession: () => Promise.reject(new Error('mock')) } }); },
  });
  await page.waitForTimeout(800);
  check(await page.isVisible('[data-action="vr"]'), 'bouton « Play in VR » affiché');
  check((await page.textContent('[data-action="solo"] b')).includes('Play solo'), 'menu en anglais');
  await shot(page, '13-menu-en-vr');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

// 7. Écran de fin
console.log('Fin de mission');
{
  const { ctx, page, errors } = await open('auto=1&mode=solo&diff=hard&seed=5&lang=fr');
  await waitGame(page);
  await ff(page, 2);
  await page.evaluate(() => window.__game.onMissionEnd(true));
  await page.waitForTimeout(1200);
  check(await page.isVisible('#screen-end'), 'écran de fin');
  await shot(page, '14-fin');
  check(errors.length === 0, 'aucune erreur JS ' + (errors[0] || ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert ✔');
process.exit(failures ? 1 : 0);
