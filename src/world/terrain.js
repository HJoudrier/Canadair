// Génération procédurale complète de la carte + fonctions de requête (hauteur, eau…).
import { Rng } from '../core/rng.js';
import { createNoise2D, fbm, ridged } from '../core/noise.js';
import { smoothstep, TAU } from '../core/math.js';
import { WORLD } from '../config.js';
import { B, WATER } from './biomes.js';
import { carveLakes, carveRivers, ensureWaterNear, collectWaterPoints } from './hydrology.js';
import { placeAirport, placeTowns, buildRoads, ZONE } from './places.js';

export const TEMPLATES = ['coast', 'island', 'lakes'];

function createGrid(cells, cell) {
  const V = cells + 1;
  return {
    cells, V, cell, size: cells * cell,
    height: new Float32Array(V * V),
    water: new Float32Array(V * V).fill(NaN),
    waterType: new Uint8Array(V * V),
    biome: new Uint8Array(V * V),
    zone: new Uint8Array(V * V),
    shade: new Float32Array(V * V), // petite variation de couleur
  };
}

export function generateWorld(seed, opts = {}) {
  const rng = new Rng(seed);
  const cells = opts.cells ?? WORLD.cells;
  const cell = opts.cell ?? WORLD.cell;
  const w = createGrid(cells, cell);
  w.seed = seed;
  const margin = opts.margin ?? WORLD.margin;
  w.bounds = { min: margin, max: w.size - margin };
  w.template = opts.template ?? rng.pick(['coast', 'island', 'lakes', 'coast']);

  const nBase = createNoise2D(rng.int(1, 1e9));
  const nDetail = createNoise2D(rng.int(1, 1e9));
  const nHill = createNoise2D(rng.int(1, 1e9));
  const nMount = createNoise2D(rng.int(1, 1e9));
  const nMoist = createNoise2D(rng.int(1, 1e9));
  const nWarp = createNoise2D(rng.int(1, 1e9));

  const seaAng = rng.range(0, TAU);
  const ux = Math.cos(seaAng), uz = Math.sin(seaAng);
  const coastOffset = rng.range(0.1, 0.2);
  // Un massif montagneux garanti dans la zone de jeu, côté terre
  const bm = margin / w.size;
  let mcx = rng.range(bm + 0.12, 1 - bm - 0.12), mcz = rng.range(bm + 0.12, 1 - bm - 0.12);
  if (w.template === 'coast') { mcx = 0.5 - ux * 0.22 + rng.range(-0.15, 0.15); mcz = 0.5 - uz * 0.22 + rng.range(-0.15, 0.15); }
  if (w.template === 'island') { mcx = 0.5 + rng.range(-0.08, 0.08); mcz = 0.5 + rng.range(-0.08, 0.08); }
  const mR = rng.range(0.1, 0.15);

  const { V, height } = w;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const nx = i / cells, nz = j / cells;
      const edge = Math.min(nx, 1 - nx, nz, 1 - nz);
      const outer = smoothstep(0.0, 0.1, edge);
      const warp = fbm(nWarp, nx * 2.2, nz * 2.2, 2) * 0.12;
      let mask;
      if (w.template === 'coast') {
        const t = (nx - 0.5) * ux + (nz - 0.5) * uz + warp;
        mask = (coastOffset - t) * 3.2;
      } else if (w.template === 'island') {
        const r = Math.hypot(nx - 0.5, nz - 0.5) + warp;
        mask = (0.37 - r) * 3.4;
      } else {
        mask = 0.65 + warp;
      }
      let land = mask + fbm(nBase, nx * 3, nz * 3, 4) * 0.35;
      land = land * outer - (1 - outer) * 0.6;

      let h;
      if (land <= 0) {
        h = Math.max(-45, land * 90) - 1;
      } else {
        const coastBlend = smoothstep(0, 0.22, land);
        const plains = 3 + land * 22 + (fbm(nDetail, nx * 10, nz * 10, 3) * 0.5 + 0.5) * 8;
        const hillMask = smoothstep(-0.05, 0.45, fbm(nHill, nx * 2.2 + 3.7, nz * 2.2 - 1.3, 2));
        const hills = (fbm(nHill, nx * 7 + 11, nz * 7 + 5, 3) * 0.5 + 0.5) * 120 * hillMask;
        const dm = Math.hypot(nx - mcx, nz - mcz);
        let mountMask = smoothstep(0.12, 0.5, fbm(nMount, nx * 1.7 + 9.1, nz * 1.7 + 4.2, 3));
        mountMask = Math.max(mountMask, Math.exp(-(dm * dm) / (2 * mR * mR)));
        mountMask *= smoothstep(0.1, 0.5, land);
        const mount = Math.pow(ridged(nMount, nx * 4.5, nz * 4.5, 5), 1.5) * 720 * mountMask;
        h = 1.0 + (plains + hills + mount - 1.0) * coastBlend;
      }
      height[j * V + i] = h;
      w.shade[j * V + i] = fbm(nDetail, nx * 40, nz * 40, 2);
    }
  }

  // Mer
  for (let v = 0; v < V * V; v++) {
    if (height[v] < 0) { w.waterType[v] = WATER.SEA; w.water[v] = 0; }
  }

  // Lacs et fleuves
  const lakeCount = w.template === 'lakes' ? rng.int(3, 5) : rng.int(1, 2);
  const lakes = carveLakes(w, rng, lakeCount, { bigFirst: w.template === 'lakes' });
  const riverCount = w.template === 'island' ? rng.int(1, 2) : rng.int(2, 3);
  const rivers = carveRivers(w, rng, riverCount);

  // Aérodrome, eau proche garantie, villes et villages
  const airport = placeAirport(w, rng);
  ensureWaterNear(w, rng, airport, 1500, lakes);
  const { places, buildings } = placeTowns(w, rng, airport, lakes, rivers);
  const roads = buildRoads(w, airport, places);

  assignBiomes(w, nMoist, nDetail, places);

  w.lakes = lakes;
  w.rivers = rivers;
  w.airport = airport;
  w.places = places;
  w.buildings = buildings;
  w.roads = roads;
  w.waterPoints = collectWaterPoints(w, 3);
  for (const b of buildings) b.y = terrainHeight(w, b.x, b.z);
  return w;
}

function assignBiomes(w, nMoist, nDetail, places) {
  const { V, cells, cell, height, waterType, zone, biome } = w;
  const forestFrac = w.template === 'island' ? 0.45 : 0.4;
  const score = new Float32Array(V * V).fill(-99);
  const slope = new Float32Array(V * V);
  const candidates = [];
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const v = j * V + i;
      const h = height[v];
      const hx = height[j * V + Math.min(V - 1, i + 1)] - height[j * V + Math.max(0, i - 1)];
      const hz = height[Math.min(V - 1, j + 1) * V + i] - height[Math.max(0, j - 1) * V + i];
      slope[v] = Math.hypot(hx, hz) / (2 * cell);
      if (waterType[v] !== WATER.NONE || zone[v] !== ZONE.NONE || h < 2.6) continue;
      const nx = i / cells, nz = j / cells;
      let s = fbm(nMoist, nx * 3.2, nz * 3.2, 3) * 0.5 + 0.5 + fbm(nDetail, nx * 14 + 7, nz * 14 + 3, 2) * 0.18;
      s -= slope[v] * 0.35 + Math.max(0, h - 360) / 250;
      // Clairière autour des villages
      for (const p of places) {
        const d = Math.hypot(i * cell - p.x, j * cell - p.z);
        if (d < p.r * 1.4) s -= 0.5 * (1 - d / (p.r * 1.4));
      }
      score[v] = s;
      candidates.push(s);
    }
  }
  candidates.sort((a, b) => a - b);
  const threshold = candidates.length ? candidates[Math.floor(candidates.length * (1 - forestFrac))] : 1;

  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const v = j * V + i;
      const h = height[v];
      const wt = waterType[v];
      const sh = w.shade[v];
      let b;
      if (wt === WATER.SEA) b = B.SEA;
      else if (wt === WATER.LAKE) b = B.LAKE;
      else if (wt === WATER.RIVER) b = B.RIVER;
      else if (zone[v] === ZONE.TOWN) b = B.TOWN;
      else if (zone[v] === ZONE.AIRFIELD) b = B.AIRFIELD;
      else if (h > 470 + sh * 50) b = B.SNOW;
      else if (h > 340 + sh * 50 || slope[v] > 1.05) b = B.ROCK;
      else if (h < 2.6) b = B.BEACH;
      else if (score[v] >= threshold) b = h > 150 + sh * 50 ? B.PINE : B.FOREST;
      else {
        b = B.GRASS;
        const x = i * cell, z = j * cell;
        for (const p of places) {
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < p.r * 2.8 && h < 180) {
            const patch = Math.sin(x * 0.012 + p.id) * Math.cos(z * 0.014 - p.id);
            if (patch > -0.1) { b = B.FIELD; break; }
          }
        }
      }
      biome[v] = b;
    }
  }
}

// ---------- Requêtes ----------

export function terrainHeight(w, x, z) {
  const { cell, V, height } = w;
  const fx = x / cell, fz = z / cell;
  if (fx < 0 || fz < 0 || fx > V - 1 || fz > V - 1) return -40;
  const i = Math.min(Math.floor(fx), V - 2), j = Math.min(Math.floor(fz), V - 2);
  const tx = fx - i, tz = fz - j;
  const v = j * V + i;
  // Interpolation cohérente avec les deux triangles de chaque case du maillage
  if (tx + tz <= 1) {
    return height[v] + (height[v + 1] - height[v]) * tx + (height[v + V] - height[v]) * tz;
  }
  return height[v + V + 1] + (height[v + V] - height[v + V + 1]) * (1 - tx) + (height[v + 1] - height[v + V + 1]) * (1 - tz);
}

/** Niveau de l'eau sous (x, z) ou NaN s'il n'y a pas d'eau. */
export function waterLevel(w, x, z) {
  const { cell, V, waterType, water } = w;
  const fx = x / cell, fz = z / cell;
  if (fx < 0 || fz < 0 || fx > V - 1 || fz > V - 1) return 0;
  const i = Math.min(Math.floor(fx), V - 2), j = Math.min(Math.floor(fz), V - 2);
  const v = j * V + i;
  let level = -Infinity;
  const corners = [v, v + 1, v + V, v + V + 1];
  for (const c of corners) if (waterType[c] !== WATER.NONE && water[c] > level) level = water[c];
  if (level === -Infinity) return NaN;
  return terrainHeight(w, x, z) <= level + 0.2 ? level : NaN;
}

export function waterTypeAt(w, x, z) {
  const i = Math.round(x / w.cell), j = Math.round(z / w.cell);
  if (i < 0 || j < 0 || i >= w.V || j >= w.V) return WATER.SEA;
  return w.waterType[j * w.V + i];
}

export function surfaceHeight(w, x, z) {
  const t = terrainHeight(w, x, z);
  const l = waterLevel(w, x, z);
  return Number.isNaN(l) ? t : Math.max(t, l);
}

export function biomeAt(w, x, z) {
  const i = Math.round(x / w.cell), j = Math.round(z / w.cell);
  if (i < 0 || j < 0 || i >= w.V || j >= w.V) return B.SEA;
  return w.biome[j * w.V + i];
}

export function inBounds(w, x, z, pad = 0) {
  return x > w.bounds.min + pad && x < w.bounds.max - pad && z > w.bounds.min + pad && z < w.bounds.max - pad;
}

