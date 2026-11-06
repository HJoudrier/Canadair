// Lacs et fleuves : creusement du relief et niveaux d'eau.
import { TAU, smoothstep, lerp } from '../core/math.js';
import { WATER } from './biomes.js';

/** Statistiques du relief dans un disque (pour trouver des zones plates). */
export function sampleArea(w, cx, cz, radius) {
  const { cell, V, height, waterType } = w;
  const i0 = Math.max(0, Math.floor((cx - radius) / cell));
  const i1 = Math.min(V - 1, Math.ceil((cx + radius) / cell));
  const j0 = Math.max(0, Math.floor((cz - radius) / cell));
  const j1 = Math.min(V - 1, Math.ceil((cz + radius) / cell));
  let min = Infinity, max = -Infinity, sum = 0, n = 0, water = false, zone = false;
  const r2 = radius * radius;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i * cell - cx, dz = j * cell - cz;
      if (dx * dx + dz * dz > r2) continue;
      const v = j * V + i;
      const h = height[v];
      if (h < min) min = h;
      if (h > max) max = h;
      sum += h; n++;
      if (waterType[v] !== WATER.NONE) water = true;
      if (w.zone[v] !== 0) zone = true;
    }
  }
  return { min, max, mean: n ? sum / n : 0, range: max - min, water, zone, n };
}

/** Creuse un lac de forme irrégulière ; renvoie sa description. */
export function carveLake(w, rng, cx, cz, R) {
  const { cell, V, height, water, waterType } = w;
  const ph = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
  const amp = [rng.range(0.08, 0.2), rng.range(0.05, 0.14), 0.05];
  const shape = (th) => R * (1 + amp[0] * Math.sin(2 * th + ph[0]) + amp[1] * Math.sin(3 * th + ph[1]) + amp[2] * Math.sin(5 * th + ph[2]));
  const reach = R * 1.5 + cell * 5;
  const i0 = Math.max(1, Math.floor((cx - reach) / cell));
  const i1 = Math.min(V - 2, Math.ceil((cx + reach) / cell));
  const j0 = Math.max(1, Math.floor((cz - reach) / cell));
  const j1 = Math.min(V - 2, Math.ceil((cz + reach) / cell));

  let rimMin = Infinity;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i * cell - cx, dz = j * cell - cz;
      const d = Math.hypot(dx, dz);
      const rr = shape(Math.atan2(dz, dx));
      if (d >= rr && d <= rr + cell * 1.6) rimMin = Math.min(rimMin, height[j * V + i]);
    }
  }
  if (!isFinite(rimMin)) rimMin = 5;
  const level = Math.max(0.6, rimMin - 0.8);

  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = j * V + i;
      if (waterType[v] === WATER.SEA) continue;
      const dx = i * cell - cx, dz = j * cell - cz;
      const d = Math.hypot(dx, dz);
      const rr = shape(Math.atan2(dz, dx));
      if (d < rr) {
        const t = d / rr;
        height[v] = Math.min(height[v], level - (2.5 + 9 * (1 - t * t)));
        waterType[v] = WATER.LAKE;
        water[v] = level;
      } else if (d < rr + cell * 4 && waterType[v] === WATER.NONE) {
        // Berges en pente douce
        const s = smoothstep(0, 1, (d - rr) / (cell * 4));
        height[v] = Math.max(level + 0.8, lerp(level + 0.8, height[v], s));
      }
    }
  }
  return { x: cx, z: cz, r: R, level };
}

export function carveLakes(w, rng, count, { bigFirst = false } = {}) {
  const lakes = [];
  const { min, max } = w.bounds;
  for (let k = 0; k < count; k++) {
    const big = bigFirst && k === 0;
    let best = null;
    for (let a = 0; a < 160; a++) {
      const R = big ? rng.range(330, 460) : rng.range(140, 260);
      const x = rng.range(min + R + 150, max - R - 150);
      const z = rng.range(min + R + 150, max - R - 150);
      if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + R + 300)) continue;
      const s = sampleArea(w, x, z, R + 60);
      if (s.water || s.min < 3 || s.mean > 260) continue;
      const score = s.range / R + rng.float() * 0.15;
      if (!best || score < best.score) best = { x, z, R, score };
    }
    if (best) lakes.push(carveLake(w, rng, best.x, best.z, best.R));
  }
  return lakes;
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** Petit tas binaire (min) pour le remplissage par priorité. */
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/**
 * Remplissage par priorité (« priority flood ») depuis tous les plans d'eau :
 * chaque case terrestre reçoit la case aval vers laquelle l'eau s'écoule,
 * sans jamais rester bloquée dans une cuvette.
 */
function computeDrainage(w, rng) {
  const { V, height, waterType } = w;
  const parent = new Int32Array(V * V).fill(-1);
  const done = new Uint8Array(V * V);
  const fill = new Float32Array(height);
  const heap = new MinHeap();
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const v = j * V + i;
      const edge = i === 0 || j === 0 || i === V - 1 || j === V - 1;
      if (waterType[v] !== WATER.NONE || edge) { heap.push(height[v], v); done[v] = 1; }
    }
  }
  while (heap.size) {
    const c = heap.pop();
    const ci = c % V, cj = (c - ci) / V;
    for (const [di, dj] of N8) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= V || nj >= V) continue;
      const n = nj * V + ni;
      if (done[n]) continue;
      done[n] = 1;
      parent[n] = c;
      fill[n] = Math.max(height[n], fill[c] + 0.01);
      heap.push(fill[n] + rng.float() * 0.3, n); // un peu de hasard = méandres
    }
  }
  return parent;
}

function traceRiver(w, parent, si, sj) {
  const { V, waterType } = w;
  const path = [];
  let v = sj * V + si;
  for (let step = 0; step < 2000 && v >= 0; step++) {
    const i = v % V, j = (v - i) / V;
    path.push([i, j]);
    if (step > 0 && waterType[v] !== WATER.NONE) break;
    v = parent[v];
  }
  return path;
}

function carveRiverPath(w, path) {
  const { cell, V, height, water, waterType } = w;
  const n = path.length;
  const levels = new Float32Array(n);
  let s = height[path[0][1] * V + path[0][0]] - 1.5;
  for (let k = 0; k < n; k++) {
    const [i, j] = path[k];
    const v = j * V + i;
    s = Math.min(s, height[v] - 1.5);
    levels[k] = s;
  }
  // Raccord avec le plan d'eau d'arrivée
  const last = path[n - 1];
  const lv = last[1] * V + last[0];
  const endLevel = waterType[lv] !== WATER.NONE ? water[lv] : 0;
  for (let k = 0; k < n; k++) levels[k] = Math.max(levels[k], endLevel);

  const bestD = new Map();
  const pts = [];
  for (let k = 0; k < n; k++) {
    const [pi, pj] = path[k];
    const px = pi * cell, pz = pj * cell;
    const r = cell * (0.9 + 1.5 * (k / n));
    const reach = r + cell * 2;
    const lvl = levels[k];
    if (k % 3 === 0) pts.push({ x: px, z: pz, r, level: lvl });
    const i0 = Math.max(1, Math.floor((px - reach) / cell));
    const i1 = Math.min(V - 2, Math.ceil((px + reach) / cell));
    const j0 = Math.max(1, Math.floor((pz - reach) / cell));
    const j1 = Math.min(V - 2, Math.ceil((pz + reach) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = j * V + i;
        const wt = waterType[v];
        if (wt === WATER.SEA || wt === WATER.LAKE) continue;
        const d = Math.hypot(i * cell - px, j * cell - pz);
        if (d < r) {
          const prev = bestD.get(v);
          if (prev === undefined || d < prev) {
            bestD.set(v, d);
            water[v] = lvl;
          }
          waterType[v] = WATER.RIVER;
          height[v] = Math.min(height[v], lvl - (1.5 + 2.5 * (1 - d / r)));
        } else if (d < reach && wt === WATER.NONE) {
          height[v] = Math.max(height[v], lvl + 0.8); // petite levée de terre
        }
      }
    }
  }
  return pts;
}

export function carveRivers(w, rng, count) {
  const rivers = [];
  const { V, height, waterType, cell } = w;
  const bmin = Math.ceil(w.bounds.min / cell), bmax = Math.floor(w.bounds.max / cell);
  const sources = [];
  for (let k = 0; k < count + 4 && rivers.length < count; k++) {
    const parent = computeDrainage(w, rng);
    let best = null;
    for (let a = 0; a < 300; a++) {
      const i = rng.int(bmin, bmax), j = rng.int(bmin, bmax);
      const v = j * V + i;
      const h = height[v];
      if (h < 70 || h > 430 || waterType[v] !== WATER.NONE) continue;
      if (sources.some((s) => Math.hypot(s[0] - i, s[1] - j) < 45)) continue;
      const score = h + rng.float() * 120;
      if (!best || score > best.score) best = { i, j, score };
    }
    if (!best) break;
    sources.push([best.i, best.j]);
    const path = traceRiver(w, parent, best.i, best.j);
    if (path.length < 40) continue;
    rivers.push({ points: carveRiverPath(w, path) });
  }
  return rivers;
}

/** Points d'eau écopables (pour les flèches et l'IA de navigation). */
export function collectWaterPoints(w, step = 3) {
  const { V, cell, waterType, water } = w;
  const pts = [];
  const { min, max } = w.bounds;
  for (let j = step; j < V - step; j += step) {
    for (let i = step; i < V - step; i += step) {
      const v = j * V + i;
      const t = waterType[v];
      if (t === WATER.NONE) continue;
      const x = i * cell, z = j * cell;
      if (x < min + 100 || x > max - 100 || z < min + 100 || z > max - 100) continue;
      // Il faut de l'eau tout autour (pas une berge étroite)
      let ok = true;
      for (const [di, dj] of N8) {
        if (waterType[(j + dj) * V + (i + di)] === WATER.NONE) { ok = false; break; }
      }
      if (!ok) continue;
      // Étendue d'eau autour (0..1) : on préfère viser les grands plans d'eau
      let wet = 0, tot = 0;
      for (let dj = -5; dj <= 5; dj++) {
        for (let di = -5; di <= 5; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= V || jj >= V || di * di + dj * dj > 25) continue;
          tot++;
          if (waterType[jj * V + ii] !== WATER.NONE) wet++;
        }
      }
      pts.push({ x, z, type: t, level: water[v], open: wet / tot });
    }
  }
  return pts;
}

export function nearestWaterPoint(points, x, z, preferOpen = 0) {
  let best = null, bs = Infinity, bd = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.z - z);
    const s = d - preferOpen * (p.open ?? 0);
    if (s < bs) { bs = s; best = p; bd = d; }
  }
  return best ? { point: best, dist: bd } : null;
}

/** Garantit un plan d'eau proche de l'aérodrome (sinon on creuse un lac). */
export function ensureWaterNear(w, rng, ap, maxDist, lakes) {
  const pts = collectWaterPoints(w);
  const near = nearestWaterPoint(pts, ap.x, ap.z);
  if (near && near.dist <= maxDist) return null;
  const { min, max } = w.bounds;
  for (let a = 0; a < 200; a++) {
    const ang = rng.range(0, TAU);
    const r = rng.range(650, 1150);
    const R = rng.range(180, 240);
    const x = ap.x + Math.cos(ang) * r, z = ap.z + Math.sin(ang) * r;
    if (x < min + R + 120 || x > max - R - 120 || z < min + R + 120 || z > max - R - 120) continue;
    const s = sampleArea(w, x, z, R + 80);
    if (s.zone || s.water) continue;
    const lake = carveLake(w, rng, x, z, R);
    lakes.push(lake);
    return lake;
  }
  // Dernier recours : plus près
  const lake = carveLake(w, rng, ap.x + ap.lx * 420, ap.z + ap.lz * 420, 170);
  lakes.push(lake);
  return lake;
}
