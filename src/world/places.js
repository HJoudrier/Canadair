// Aérodrome, villages, villes, bâtiments et routes.
import { smoothstep, lerp, dist2 } from '../core/math.js';
import { WATER } from './biomes.js';
import { sampleArea, collectWaterPoints, nearestWaterPoint } from './hydrology.js';
import { makePlaceName } from '../i18n/names.js';

export const ZONE = { NONE: 0, TOWN: 1, AIRFIELD: 2 };

function heightAtGrid(w, x, z) {
  const { cell, V, height } = w;
  const fx = Math.min(Math.max(x / cell, 0), V - 1.001);
  const fz = Math.min(Math.max(z / cell, 0), V - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const v = j * V + i;
  const a = height[v], b = height[v + 1], c = height[v + V], d = height[v + V + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
function waterTypeNear(w, x, z) {
  const i = Math.round(x / w.cell), j = Math.round(z / w.cell);
  if (i < 0 || j < 0 || i >= w.V || j >= w.V) return WATER.SEA;
  return w.waterType[j * w.V + i];
}

export function runwayLocal(ap, x, z) {
  const dx = x - ap.x, dz = z - ap.z;
  return { u: dx * ap.fx + dz * ap.fz, v: dx * ap.lx + dz * ap.lz };
}

export function placeAirport(w, rng) {
  const L = 680, W = 46;
  const { min, max } = w.bounds;
  const center = (min + max) / 2;
  const waterPts = collectWaterPoints(w, 4);
  let best = null;
  for (let a = 0; a < 600; a++) {
    const x = rng.range(min + 700, max - 700);
    const z = rng.range(min + 700, max - 700);
    const heading = rng.int(0, 3) * (Math.PI / 4) + rng.range(-0.25, 0.25);
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    const lx = -fz, lz = fx;
    let hmin = Infinity, hmax = -Infinity, sum = 0, n = 0, bad = false;
    for (let u = -L / 2 - 100; u <= L / 2 + 100 && !bad; u += 24) {
      for (let v = -70; v <= 70; v += 35) {
        const px = x + fx * u + lx * v, pz = z + fz * u + lz * v;
        if (waterTypeNear(w, px, pz) !== WATER.NONE) { bad = true; break; }
        const h = heightAtGrid(w, px, pz);
        hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); sum += h; n++;
      }
    }
    if (bad || hmin < 2.5 || hmax - hmin > 32) continue;
    const near = nearestWaterPoint(waterPts, x, z);
    const dW = near ? near.dist : 5000;
    const score = (hmax - hmin) + Math.hypot(x - center, z - center) * 0.006
      + (dW > 1400 ? 35 : 0) + (dW < 400 ? 25 : 0) + rng.float() * 4;
    if (!best || score < best.score) best = { x, z, heading, fx, fz, lx, lz, h: sum / n, score };
  }
  if (!best) {
    // Repli : on prend le point terrestre le plus central et on aplanit
    const heading = 0;
    let x = center, z = center;
    for (let a = 0; a < 400; a++) {
      const px = rng.range(min + 800, max - 800), pz = rng.range(min + 800, max - 800);
      if (heightAtGrid(w, px, pz) > 4 && waterTypeNear(w, px, pz) === WATER.NONE) { x = px; z = pz; break; }
    }
    best = { x, z, heading, fx: 0, fz: -1, lx: 1, lz: 0, h: Math.max(4, heightAtGrid(w, x, z)) };
  }
  const ap = { ...best, length: L, width: W };
  delete ap.score;
  ap.h = Math.max(2.5, ap.h);

  // Aplanissement de la plate-forme
  const { cell, V, height, waterType, water } = w;
  const reach = L / 2 + 260;
  const i0 = Math.max(0, Math.floor((ap.x - reach) / cell)), i1 = Math.min(V - 1, Math.ceil((ap.x + reach) / cell));
  const j0 = Math.max(0, Math.floor((ap.z - reach) / cell)), j1 = Math.min(V - 1, Math.ceil((ap.z + reach) / cell));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = j * V + i;
      const { u, v: lat } = runwayLocal(ap, i * cell, j * cell);
      const du = Math.max(0, Math.abs(u) - (L / 2 + 70));
      const dv = Math.max(0, Math.abs(lat) - 110);
      const dd = Math.hypot(du, dv);
      const f = 1 - smoothstep(0, 160, dd);
      if (f <= 0) continue;
      height[v] = lerp(height[v], ap.h, f);
      if (dd === 0) {
        w.zone[v] = ZONE.AIRFIELD;
        if (waterType[v] !== WATER.NONE) { waterType[v] = WATER.NONE; water[v] = NaN; }
      }
    }
  }
  // Points utiles
  const at = (u, v) => ({ x: ap.x + ap.fx * u + ap.lx * v, z: ap.z + ap.fz * u + ap.lz * v });
  ap.starts = [at(-L / 2 + 110, 0), at(-L / 2 + 35, 0)];
  ap.hangar = at(-140, 82);
  ap.tower = at(60, 85);
  ap.parking = at(-60, 70);
  return ap;
}

function contextFor(w, x, z, lakes, rivers, mean) {
  let sea = Infinity;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    for (let r = 100; r <= 800; r += 100) {
      const t = waterTypeNear(w, x + Math.cos(ang) * r, z + Math.sin(ang) * r);
      if (t === WATER.SEA) { sea = Math.min(sea, r); break; }
    }
  }
  if (sea < 800) return 'sea';
  if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 500)) return 'lake';
  for (const r of rivers) if (r.points.some((p) => dist2(p.x, p.z, x, z) < 450 * 450)) return 'river';
  if (mean > 160) return 'mountain';
  return 'forest';
}

export function placeTowns(w, rng, ap, lakes, rivers) {
  const places = [];
  const buildings = [];
  const used = new Set();
  const { min, max } = w.bounds;
  const waterPts = collectWaterPoints(w, 4);
  const nCity = w.template === 'island' ? rng.int(0, 1) : rng.int(1, 2);
  const nVillage = rng.int(4, 6);
  const kinds = [...Array(nCity).fill('city'), ...Array(nVillage).fill('village')];

  for (const kind of kinds) {
    const R = kind === 'city' ? rng.range(210, 260) : rng.range(95, 130);
    let best = null;
    for (let a = 0; a < 300; a++) {
      const x = rng.range(min + R + 120, max - R - 120);
      const z = rng.range(min + R + 120, max - R - 120);
      if (Math.hypot(x - ap.x, z - ap.z) < 650 + R + ap.length / 2) continue;
      if (places.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + R + 550)) continue;
      const s = sampleArea(w, x, z, R + 40);
      if (s.water || s.zone || s.min < 2.5) continue;
      if (s.mean > (kind === 'city' ? 140 : 260)) continue;
      if (s.range > (kind === 'city' ? 45 : 60)) continue;
      const near = nearestWaterPoint(waterPts, x, z);
      const dW = near ? near.dist : 5000;
      const score = s.range * 0.8 + (dW < 700 ? -18 : 0) + s.mean * 0.04 + rng.float() * 12;
      if (!best || score < best.score) best = { x, z, score, mean: s.mean };
    }
    if (!best) continue;
    const { x, z, mean } = best;
    flattenTown(w, x, z, R, mean);
    const context = contextFor(w, x, z, lakes, rivers, mean);
    const place = {
      id: places.length, kind, x, z, r: R, name: makePlaceName(rng, context, used), context,
      buildings: [],
    };
    if (kind === 'city') genCity(w, rng, place, buildings);
    else genVillage(w, rng, place, buildings);
    places.push(place);
  }
  return { places, buildings };
}

function flattenTown(w, cx, cz, R, mean) {
  const { cell, V, height, waterType } = w;
  const reach = R * 1.3;
  const i0 = Math.max(0, Math.floor((cx - reach) / cell)), i1 = Math.min(V - 1, Math.ceil((cx + reach) / cell));
  const j0 = Math.max(0, Math.floor((cz - reach) / cell)), j1 = Math.min(V - 1, Math.ceil((cz + reach) / cell));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = j * V + i;
      if (waterType[v] !== WATER.NONE) continue;
      const d = Math.hypot(i * cell - cx, j * cell - cz);
      const f = 1 - smoothstep(R * 0.7, reach, d);
      if (f <= 0) continue;
      height[v] = lerp(height[v], Math.max(mean, 3), f * 0.9);
      if (d < R) w.zone[v] = ZONE.TOWN;
    }
  }
}

const HOUSE_WALLS = [0xfff3d6, 0xffe0b2, 0xf8d7da, 0xe3f2fd, 0xfff9c4, 0xe8f5e9, 0xffffff];
const ROOFS = [0xd9534f, 0xe0703a, 0xb5523b, 0x8e5b3e, 0x5b7fb5];
const BLOCKS = [0xf2efe6, 0xd8e2ef, 0xf6dcc4, 0xe3e3e3, 0xc9d6c3, 0xf3e5ab];

function okSpot(w, x, z, list, minGap) {
  if (waterTypeNear(w, x, z) !== WATER.NONE) return false;
  for (const b of list) if ((b.x - x) ** 2 + (b.z - z) ** 2 < minGap * minGap) return false;
  return true;
}

function genVillage(w, rng, place, buildings) {
  const local = [];
  const rot0 = rng.range(0, Math.PI);
  // Église au centre
  const church = { kind: 'church', x: place.x, z: place.z, w: 12, d: 22, h: 11, rot: rot0, wall: 0xfff3d6, roof: 0x8e5b3e, place: place.id };
  local.push(church);
  const n = rng.int(8, 15);
  for (let a = 0; a < n * 8 && local.length < n + 1; a++) {
    const ang = rng.range(0, Math.PI * 2);
    const r = place.r * (0.25 + 0.7 * Math.sqrt(rng.float()));
    const x = place.x + Math.cos(ang) * r, z = place.z + Math.sin(ang) * r;
    if (!okSpot(w, x, z, local, 22)) continue;
    local.push({
      kind: 'house', x, z, w: rng.range(9, 12), d: rng.range(10, 14), h: rng.range(5.5, 8),
      rot: rot0 + (rng.chance(0.5) ? 0 : Math.PI / 2) + rng.range(-0.15, 0.15),
      wall: rng.pick(HOUSE_WALLS), roof: rng.pick(ROOFS), place: place.id,
    });
  }
  for (const b of local) { place.buildings.push(buildings.length); buildings.push(b); }
}

function genCity(w, rng, place, buildings) {
  const local = [];
  const rot = rng.range(0, Math.PI / 2);
  const c = Math.cos(rot), s = Math.sin(rot);
  const step = 46;
  const R = place.r;
  for (let gx = -R; gx <= R; gx += step) {
    for (let gz = -R; gz <= R; gz += step) {
      const d = Math.hypot(gx, gz);
      if (d > R * 0.95 || rng.chance(0.12)) continue;
      const x = place.x + gx * c - gz * s, z = place.z + gx * s + gz * c;
      if (!okSpot(w, x, z, [], 0)) continue;
      const t = 1 - d / R;
      if (d > R * 0.72) {
        local.push({
          kind: 'house', x, z, w: rng.range(10, 14), d: rng.range(11, 15), h: rng.range(6, 9),
          rot, wall: rng.pick(HOUSE_WALLS), roof: rng.pick(ROOFS), place: place.id,
        });
      } else {
        local.push({
          kind: 'block', x, z, w: rng.range(22, 32), d: rng.range(22, 32),
          h: lerp(14, 62, t) * rng.range(0.6, 1.2), rot,
          wall: rng.pick(BLOCKS), roof: 0x8a8f99, place: place.id,
        });
      }
    }
  }
  for (const b of local) { place.buildings.push(buildings.length); buildings.push(b); }
}

/** Routes : arbre couvrant minimal entre l'aérodrome et les lieux habités. */
export function buildRoads(w, ap, places) {
  const nodes = [{ x: ap.parking.x, z: ap.parking.z }, ...places.map((p) => ({ x: p.x, z: p.z }))];
  const inTree = [0];
  const roads = [];
  const remaining = new Set(nodes.map((_, i) => i).slice(1));
  while (remaining.size) {
    let best = null;
    for (const a of inTree) {
      for (const b of remaining) {
        const d = dist2(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    remaining.delete(best.b);
    inTree.push(best.b);
    const A = nodes[best.a], Bn = nodes[best.b];
    const len = Math.sqrt(best.d);
    let sea = 0, n = 0;
    for (let t = 0; t <= len; t += 30) {
      const x = A.x + ((Bn.x - A.x) * t) / len, z = A.z + ((Bn.z - A.z) * t) / len;
      if (waterTypeNear(w, x, z) === WATER.SEA) sea++;
      n++;
    }
    if (sea / n > 0.05) continue;
    roads.push({ ax: A.x, az: A.z, bx: Bn.x, bz: Bn.z });
  }
  return roads;
}
