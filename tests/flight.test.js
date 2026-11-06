import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, terrainHeight, surfaceHeight } from '../src/world/terrain.js';
import { createPlane, updatePlane, emptyInput } from '../src/plane/flight.js';
import { DropSystem, predictImpact } from '../src/plane/drops.js';
import { FireSim } from '../src/fire/fireSim.js';
import { DIFFICULTY, FLIGHT } from '../src/config.js';

const w = generateWorld(42);
const step = (p, inp, secs, diff, onEvent) => {
  for (let t = 0; t < secs; t += 1 / 60) {
    updatePlane(p, inp, 1 / 60, w, diff);
    if (onEvent) for (const e of p.events) onEvent(e, p);
    inp.dropPressed = false; inp.go = false;
  }
};

test("l'avion attend sur la piste sans action", () => {
  const p = createPlane(w, 0);
  step(p, emptyInput(), 5, DIFFICULTY.easy);
  assert.ok(p.onGround);
  assert.equal(p.speed, 0);
});

test('décollage seulement après la vitesse de rotation', () => {
  for (const name of ['easy', 'hard']) {
    const p = createPlane(w, 0);
    let takeoffSpeed = null;
    const inp = emptyInput();
    inp.go = true;
    inp.throttle = name === 'hard' ? 1 : 0;
    for (let t = 0; t < 30 && takeoffSpeed === null; t += 1 / 60) {
      inp.pitch = name === 'hard' ? 0.5 : 0;
      updatePlane(p, inp, 1 / 60, w, DIFFICULTY[name]);
      if (p.events.includes('takeoff')) takeoffSpeed = p.speed;
      inp.go = false;
    }
    assert.ok(takeoffSpeed !== null, `${name} : décollage`);
    assert.ok(takeoffSpeed >= FLIGHT.vRotate - 0.01, `${name} : vitesse ${takeoffSpeed}`);
    step(p, inp, 6, DIFFICULTY[name]);
    assert.ok(!p.onGround && p.alt > 15, `${name} : en l'air (${p.alt.toFixed(0)} m)`);
  }
});

function airborneOver(x, z, alt, heading = 0) {
  const p = createPlane(w, 0);
  p.onGround = false;
  p.x = x; p.z = z;
  p.y = surfaceHeight(w, x, z) + alt;
  p.heading = heading;
  p.speed = 45;
  return p;
}

test("écopage seulement au ras de l'eau", () => {
  const wp = w.waterPoints.reduce((a, b) => (b.open > a.open ? b : a));
  const low = airborneOver(wp.x, wp.z, 3);
  step(low, emptyInput(), 0.5, DIFFICULTY.hard);
  assert.ok(low.tank > 0, 'réservoir qui se remplit');
  const high = airborneOver(wp.x, wp.z, 80);
  step(high, emptyInput(), 0.5, DIFFICULTY.hard);
  assert.equal(high.tank, 0, 'trop haut : rien');
  const ap = w.airport;
  const land = airborneOver(ap.x + ap.lx * 400, ap.z + ap.lz * 400, 3);
  step(land, emptyInput(), 0.3, DIFFICULTY.easy);
  assert.equal(land.tank, 0, 'au-dessus de la terre : rien');
});

test('Petit pilote : jamais de crash, même vers la montagne', () => {
  let peak = 0, px = 0, pz = 0;
  for (let v = 0; v < w.V * w.V; v++) if (w.height[v] > peak) { peak = w.height[v]; px = (v % w.V) * w.cell; pz = Math.floor(v / w.V) * w.cell; }
  const sx = px - 1200, sz = pz;
  const p = airborneOver(sx, sz, 20, Math.PI / 2);
  let crashes = 0, minClear = Infinity;
  step(p, emptyInput(), 60, DIFFICULTY.easy, (e, pl) => { if (e === 'crash') crashes++; });
  for (let t = 0; t < 30; t += 1 / 60) {
    updatePlane(p, emptyInput(), 1 / 60, w, DIFFICULTY.easy);
    minClear = Math.min(minClear, p.y - terrainHeight(w, p.x, p.z));
  }
  assert.equal(crashes, 0);
  assert.ok(minClear > 0);
});

test('Grand pilote : piquer vers le sol = crash puis retour à la base', () => {
  const ap = w.airport;
  const p = airborneOver(ap.x + ap.lx * 500, ap.z + ap.lz * 500, 40);
  const inp = emptyInput();
  inp.pitch = -1;
  const events = [];
  step(p, inp, 12, DIFFICULTY.hard, (e) => events.push(e));
  assert.ok(events.includes('crash'));
  assert.ok(events.includes('respawn'));
  assert.ok(p.onGround);
});

test("le largage vide le réservoir et l'eau éteint le feu", () => {
  const fire = new FireSim(w, { ...DIFFICULTY.easy, fireSpread: 0 }, 1);
  // Case de forêt loin de l'aérodrome
  let target = -1;
  for (let c = 0; c < fire.N * fire.N && target < 0; c += 37) {
    const q = fire.cellCenter(c);
    const inside = q.x > w.bounds.min + 800 && q.x < w.bounds.max - 300 && q.z > w.bounds.min + 300 && q.z < w.bounds.max - 300;
    if (inside && fire.fuel0[c] >= 1 && Math.hypot(q.x - w.airport.x, q.z - w.airport.z) > 1000) target = c;
  }
  const tp = fire.cellCenter(target);
  fire.ignite(tp.x, tp.z, 2);
  for (let k = 0; k < 20; k++) fire.tick(0.2);
  const before = fire.burningCount;
  const p = airborneOver(tp.x - 600, tp.z, 50, Math.PI / 2);
  p.tank = 1;
  const drops = new DropSystem(w, fire);
  const diff = { ...DIFFICULTY.easy, minClearance: 0 };
  let dropped = false;
  for (let t = 0; t < 25; t += 1 / 60) {
    const inp = emptyInput();
    const im = predictImpact(w, p);
    if (!dropped && im && im.x > tp.x - 30) { inp.dropPressed = true; dropped = true; }
    updatePlane(p, inp, 1 / 60, w, diff);
    drops.emit(p, diff);
    drops.update(1 / 60);
  }
  assert.ok(dropped && p.tank === 0, 'réservoir vidé');
  assert.ok(drops.totalExtinguished > 0, `cases éteintes : ${drops.totalExtinguished}`);
  assert.ok(fire.burningCount < before);
});
