import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, terrainHeight, waterLevel } from '../src/world/terrain.js';
import { nearestWaterPoint } from '../src/world/hydrology.js';
import { runwayLocal } from '../src/world/places.js';
import { B, WATER } from '../src/world/biomes.js';

const worlds = new Map();
const world = (seed, template) => {
  const k = seed + ':' + template;
  if (!worlds.has(k)) worlds.set(k, generateWorld(seed, template ? { template } : {}));
  return worlds.get(k);
};

test('même graine = même carte', () => {
  const a = generateWorld(1234);
  const b = generateWorld(1234);
  assert.deepEqual(Array.from(a.height.slice(0, 2000)), Array.from(b.height.slice(0, 2000)));
  assert.deepEqual(a.places.map((p) => p.name.fr), b.places.map((p) => p.name.fr));
  assert.equal(a.template, b.template);
});

test('graines différentes = cartes différentes', () => {
  const mid = (w) => Array.from(w.height.slice(w.V * 128, w.V * 128 + 500));
  assert.notDeepEqual(mid(world(1)), mid(world(2)));
});

for (const template of ['coast', 'island', 'lakes']) {
  test(`modèle « ${template} » : environnements variés et jouables`, () => {
    const w = world(7, template);
    const count = (b) => w.biome.reduce((n, x) => n + (x === b), 0);
    assert.ok(count(B.SEA) > 0, 'mer présente');
    assert.ok(count(B.FOREST) + count(B.PINE) > 3000, 'forêts');
    assert.ok(count(B.ROCK) + count(B.SNOW) > 50, 'montagnes');
    assert.ok(count(B.GRASS) + count(B.FIELD) > 1000, 'plaines');
    assert.ok(w.lakes.length + w.rivers.length > 0, 'lacs ou fleuves');
    assert.ok(w.places.length >= 3, 'villages / villes');
    assert.ok(w.buildings.length > 20, 'maisons');
    assert.ok(w.waterPoints.length > 0, "points d'eau écopables");
  });
}

test("l'aérodrome est plat, sec et proche de l'eau", () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    const w = world(seed);
    const ap = w.airport;
    for (let u = -ap.length / 2; u <= ap.length / 2; u += 40) {
      const x = ap.x + ap.fx * u, z = ap.z + ap.fz * u;
      assert.ok(Math.abs(terrainHeight(w, x, z) - ap.h) < 1.5, `piste plate (graine ${seed}, u=${u})`);
      assert.ok(Number.isNaN(waterLevel(w, x, z)), `piste hors de l'eau (graine ${seed})`);
      assert.ok(Math.abs(runwayLocal(ap, x, z).v) < 1e-6);
    }
    const near = nearestWaterPoint(w.waterPoints, ap.x, ap.z);
    assert.ok(near && near.dist < 1700, `eau à moins de 1,7 km (graine ${seed} : ${near && near.dist.toFixed(0)} m)`);
  }
});

test('les fleuves descendent vers la mer ou un lac', () => {
  const w = world(1);
  for (const r of w.rivers) {
    for (let k = 1; k < r.points.length; k++) assert.ok(r.points[k].level <= r.points[k - 1].level + 1e-6);
  }
});

test("l'eau est au-dessus du fond partout où elle est déclarée", () => {
  const w = world(3);
  for (let v = 0; v < w.V * w.V; v += 7) {
    if (w.waterType[v] === WATER.NONE) continue;
    assert.ok(w.height[v] <= w.water[v] + 1e-3);
  }
});
