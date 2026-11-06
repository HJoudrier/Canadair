import test from 'node:test';
import assert from 'node:assert/strict';
import { FireSim, CELL } from '../src/fire/fireSim.js';
import { DIFFICULTY } from '../src/config.js';
import { B } from '../src/world/biomes.js';

/** Petit monde plat entièrement boisé (avec option de roche). */
function flatWorld(cells = 64, fill = B.FOREST) {
  const V = cells + 1;
  return {
    cells, V, cell: 24, size: cells * 24,
    biome: new Uint8Array(V * V).fill(fill),
    height: new Float32Array(V * V),
    buildings: [],
  };
}
const diff = { ...DIFFICULTY.hard, incidentCap: 9999 };
const burned = (f) => {
  const out = [];
  for (let c = 0; c < f.N * f.N; c++) if (f.state[c] === CELL.BURNING || f.state[c] === CELL.BURNT) out.push(c);
  return out;
};

test('le feu se propage dans la forêt', () => {
  const f = new FireSim(flatWorld(), diff, 1);
  f.ignite(32 * 24, 32 * 24, 1);
  const start = f.burningCount;
  for (let t = 0; t < 40; t++) f.update(1);
  assert.ok(burned(f).length > start * 3);
});

test('le vent pousse le feu', () => {
  let east = 0;
  for (const seed of [1, 2, 3]) {
    const f = new FireSim(flatWorld(), diff, seed);
    f.setWind(Math.PI / 2, 1); // vers l'est
    f.ignite(32 * 24, 32 * 24, 1);
    for (let t = 0; t < 45; t++) f.update(1);
    const cells = burned(f);
    const cx = cells.reduce((s, c) => s + (c % f.N), 0) / cells.length;
    east += cx - 32;
  }
  assert.ok(east > 3, `centre du feu décalé vers l'est (${east.toFixed(1)})`);
});

test('la roche ne brûle pas', () => {
  const f = new FireSim(flatWorld(32, B.ROCK), diff, 1);
  f.ignite(16 * 24, 16 * 24, 2);
  assert.equal(f.burningCount, 0);
});

test("l'eau éteint le feu et termine l'incendie", () => {
  const f = new FireSim(flatWorld(), { ...diff, fireSpread: 0 }, 1);
  const inc = f.ignite(32 * 24 + 12, 32 * 24 + 12, 1);
  assert.ok(f.burningCount > 0);
  for (let k = 0; k < 20; k++) f.applyWater(32 * 24 + 12, 32 * 24 + 12, 60, 0.05);
  f.tick(0.2);
  assert.equal(f.burningCount, 0);
  assert.ok(inc.extinguished);
  assert.ok(f.drainEvents().some((e) => e.type === 'extinguished' && e.id === inc.id));
});

test('une bande mouillée freine la propagation (coupe-feu)', () => {
  const run = (wetBand) => {
    let total = 0;
    for (const seed of [1, 2, 3, 4]) {
      const f = new FireSim(flatWorld(), diff, seed);
      f.setWind(Math.PI / 2, 1);
      if (wetBand) for (let z = 0; z < 64; z++) f.applyWater(38 * 24, z * 24 + 12, 30, 0.1);
      f.ignite(30 * 24, 32 * 24, 1);
      for (let t = 0; t < 50; t++) f.update(1);
      total += burned(f).filter((c) => c % f.N > 40).length;
    }
    return total;
  };
  assert.ok(run(true) < run(false) * 0.5);
});

test('les maisons proches du feu peuvent brûler', () => {
  const w = flatWorld();
  w.buildings = [{ x: 32 * 24 + 12, z: 32 * 24 + 12, place: 0 }];
  const f = new FireSim(w, { ...diff, fireSpread: 0, fireGrowth: 1 }, 1);
  f.ignite(32 * 24 + 12, 32 * 24 + 12, 0);
  for (let t = 0; t < 12; t++) f.update(1);
  assert.equal(f.buildingsBurnt, 1);
});
