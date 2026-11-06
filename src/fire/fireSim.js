// Simulation du feu : automate cellulaire sur la grille du terrain (sans Three.js).
import { Rng } from '../core/rng.js';
import { FIRE } from '../config.js';
import { FUEL, B } from '../world/biomes.js';

export const CELL = { NONE: 0, FUEL: 1, BURNING: 2, BURNT: 3 };

const N8 = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 0.7], [-1, 1, 0.7], [1, -1, 0.7], [-1, -1, 0.7],
];

export class FireSim {
  constructor(world, diff, seed = 1) {
    this.w = world;
    this.diff = diff;
    this.rng = new Rng(seed);
    const N = (this.N = world.cells);
    this.cellSize = world.cell;
    this.fuel0 = new Float32Array(N * N);
    this.fuel = new Float32Array(N * N);
    this.intensity = new Float32Array(N * N);
    this.wet = new Float32Array(N * N);
    this.state = new Uint8Array(N * N);
    this.fireId = new Uint16Array(N * N);
    this.heat = new Float32Array(N * N);   // temps passé à brûler fort (pour les maisons)
    this.cellH = new Float32Array(N * N);
    this.burning = [];                     // indices des cases en feu
    this.incidents = new Map();
    this.nextId = 1;
    this.events = [];
    this.acc = 0;
    this.wind = { x: 0, z: 0, speed: 0 };
    this.burnableForest = 0;
    this.forestBurnt = 0;
    this.burntCells = [];                  // pour mettre à jour l'affichage
    this.changedCells = [];

    const { V, biome, height } = world;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v = j * V + i;
        const c = j * N + i;
        const corners = [v, v + 1, v + V, v + V + 1];
        let f = 0, h = 0, forest = 0;
        for (const k of corners) {
          f += FUEL[biome[k]];
          h += height[k];
          if (biome[k] === B.FOREST || biome[k] === B.PINE) forest++;
        }
        f /= 4;
        this.fuel0[c] = this.fuel[c] = f;
        this.cellH[c] = h / 4;
        this.state[c] = f > 0.05 ? CELL.FUEL : CELL.NONE;
        if (forest >= 3) this.burnableForest++;
      }
    }
    // Maisons : case -> liste de bâtiments
    this.buildingCells = new Map();
    this.buildingBurnt = new Uint8Array(world.buildings ? world.buildings.length : 0);
    (world.buildings || []).forEach((b, idx) => {
      const c = this.cellIndexAt(b.x, b.z);
      if (c < 0) return;
      if (!this.buildingCells.has(c)) this.buildingCells.set(c, []);
      this.buildingCells.get(c).push(idx);
      // Les maisons et jardins brûlent un peu
      if (this.state[c] === CELL.NONE) { this.state[c] = CELL.FUEL; this.fuel0[c] = this.fuel[c] = 0.3; }
    });
  }

  cellIndexAt(x, z) {
    const i = Math.floor(x / this.cellSize), j = Math.floor(z / this.cellSize);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return -1;
    return j * this.N + i;
  }
  cellCenter(c) {
    const i = c % this.N, j = (c - i) / this.N;
    return { x: (i + 0.5) * this.cellSize, z: (j + 0.5) * this.cellSize };
  }
  isForest(c) { return this.fuel0[c] >= 0.75; }

  setWind(angle, speed) {
    // angle = direction VERS laquelle souffle le vent (cap)
    this.wind = { x: Math.sin(angle), z: -Math.cos(angle), speed, angle };
  }

  /** Démarre un incendie ; renvoie l'incident créé. */
  ignite(x, z, radiusCells = 1, meta = {}) {
    const id = this.nextId++;
    const inc = { id, x, z, burning: 0, total: 0, extinguished: false, startedAt: meta.time ?? 0, ...meta };
    this.incidents.set(id, inc);
    const c0 = this.cellIndexAt(x, z);
    if (c0 < 0) return inc;
    const i0 = c0 % this.N, j0 = (c0 - i0) / this.N;
    for (let dj = -radiusCells; dj <= radiusCells; dj++) {
      for (let di = -radiusCells; di <= radiusCells; di++) {
        if (di * di + dj * dj > radiusCells * radiusCells + 0.5) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue;
        this.igniteCell(j * this.N + i, id, 0.45);
      }
    }
    return inc;
  }

  igniteCell(c, id, intensity = 0.15) {
    if (this.state[c] !== CELL.FUEL || this.fuel[c] <= 0.05) return false;
    this.state[c] = CELL.BURNING;
    this.intensity[c] = intensity;
    this.fireId[c] = id;
    this.wet[c] = 0;
    this.burning.push(c);
    this.changedCells.push(c);
    const inc = this.incidents.get(id);
    if (inc) { inc.burning++; inc.total++; }
    return true;
  }

  update(dt) {
    this.acc += dt;
    const step = 1 / FIRE.tickRate;
    while (this.acc >= step) {
      this.acc -= step;
      this.tick(step);
    }
  }

  tick(dt) {
    const { N, state, intensity, fuel, wet, fireId, cellH, rng, diff, wind } = this;
    const growth = diff.fireGrowth;
    const spread = diff.fireSpread;
    const cap = diff.incidentCap;
    const next = [];
    // Évaporation de l'humidité (seulement les cases mouillées, échantillonnées)
    if (this.wetCells) {
      const keep = [];
      for (const c of this.wetCells) {
        wet[c] -= FIRE.wetDecay * dt;
        if (wet[c] > 0) keep.push(c); else wet[c] = 0;
      }
      this.wetCells = keep;
    }
    const newly = [];
    for (const c of this.burning) {
      if (state[c] !== CELL.BURNING) continue;
      let I = intensity[c];
      if (fuel[c] > 0.05) {
        I += growth * dt * (1 - I);
        fuel[c] -= FIRE.burnRate * (0.4 + I) * dt;
      } else {
        I -= 0.12 * dt;
      }
      intensity[c] = I;
      if (I > 0.5) {
        this.heat[c] += dt;
        if (this.heat[c] > 6 && this.buildingCells.has(c)) {
          for (const b of this.buildingCells.get(c)) {
            if (!this.buildingBurnt[b]) {
              this.buildingBurnt[b] = 1;
              this.events.push({ type: 'building', index: b, cell: c, fireId: fireId[c] });
            }
          }
        }
      }
      if (I <= 0.04) {
        this.burnOut(c);
        continue;
      }
      next.push(c);
      const inc = this.incidents.get(fireId[c]);
      if (inc && inc.burning >= cap) continue;
      const i = c % N, j = (c - i) / N;
      for (const [di, dj, diag] of N8) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (state[n] !== CELL.FUEL) continue;
        const len = diag < 1 ? Math.SQRT2 : 1;
        const dot = (di * wind.x + dj * wind.z) / len;
        const windF = Math.max(0.15, 1 + 2.2 * wind.speed * dot);
        const slope = (cellH[n] - cellH[c]) / (this.cellSize * len);
        const slopeF = Math.min(2.5, Math.max(0.4, 1 + slope * 1.5));
        const w = 1 - wet[n];
        const p = spread * I * this.fuel[n] * windF * slopeF * w * w * diag * dt;
        if (rng.float() < p) newly.push([n, fireId[c]]);
      }
    }
    this.burning = next;
    for (const [n, id] of newly) {
      const inc = this.incidents.get(id);
      if (inc && inc.burning >= cap) continue;
      this.igniteCell(n, id);
    }
    this.checkIncidents();
  }

  burnOut(c) {
    this.state[c] = CELL.BURNT;
    this.intensity[c] = 0;
    this.fuel[c] = 0;
    if (this.isForest(c)) this.forestBurnt++;
    this.burntCells.push(c);
    this.changedCells.push(c);
    const inc = this.incidents.get(this.fireId[c]);
    if (inc) inc.burning--;
  }

  checkIncidents() {
    for (const inc of this.incidents.values()) {
      if (!inc.extinguished && inc.burning <= 0) {
        inc.extinguished = true;
        inc.burning = 0;
        this.events.push({ type: 'extinguished', id: inc.id });
      }
    }
  }

  /**
   * Eau qui touche le sol : éteint et mouille les cases dans un rayon.
   * Renvoie le nombre de cases éteintes.
   */
  applyWater(x, z, radius, amount) {
    const { N, cellSize, state, intensity, wet } = this;
    const i0 = Math.max(0, Math.floor((x - radius) / cellSize));
    const i1 = Math.min(N - 1, Math.floor((x + radius) / cellSize));
    const j0 = Math.max(0, Math.floor((z - radius) / cellSize));
    const j1 = Math.min(N - 1, Math.floor((z + radius) / cellSize));
    let out = 0, hit = 0;
    if (!this.wetCells) this.wetCells = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * cellSize, cz = (j + 0.5) * cellSize;
        const d2 = (cx - x) ** 2 + (cz - z) ** 2;
        if (d2 > radius * radius) continue;
        const k = 1 - d2 / (radius * radius);
        const c = j * N + i;
        if (wet[c] <= 0) this.wetCells.push(c);
        wet[c] = Math.min(1, wet[c] + amount * k * 10);
        if (state[c] === CELL.BURNING) {
          hit++;
          intensity[c] -= amount * k * 14;
          if (intensity[c] <= 0.04) {
            const inc = this.incidents.get(this.fireId[c]);
            if (inc) inc.burning--;
            intensity[c] = 0;
            state[c] = this.fuel[c] > 0.1 ? CELL.FUEL : CELL.BURNT;
            if (state[c] === CELL.BURNT) {
              this.burntCells.push(c);
              if (this.isForest(c)) this.forestBurnt++;
            }
            wet[c] = 1;
            this.changedCells.push(c);
            out++;
          }
        }
      }
    }
    if (out > 0) {
      this.burning = this.burning.filter((c) => state[c] === CELL.BURNING);
      this.checkIncidents();
    }
    return { extinguished: out, hit };
  }

  /** Centre et taille de chaque incendie actif (pour les flèches, la radio…). */
  activeFires() {
    const acc = new Map();
    const { N, cellSize } = this;
    for (const c of this.burning) {
      const id = this.fireId[c];
      let a = acc.get(id);
      if (!a) { a = { id, sx: 0, sz: 0, n: 0, cells: [] }; acc.set(id, a); }
      const i = c % N, j = (c - i) / N;
      a.sx += (i + 0.5) * cellSize; a.sz += (j + 0.5) * cellSize; a.n++;
      if (a.cells.length < 400) a.cells.push(c);
    }
    const out = [];
    for (const a of acc.values()) {
      const inc = this.incidents.get(a.id);
      out.push({ id: a.id, x: a.sx / a.n, z: a.sz / a.n, size: a.n, cells: a.cells, incident: inc });
    }
    return out;
  }

  /** Case en feu la plus proche d'un point (cible précise pour la flèche). */
  nearestBurning(x, z) {
    let best = -1, bd = Infinity;
    for (const c of this.burning) {
      const p = this.cellCenter(c);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best < 0 ? null : { ...this.cellCenter(best), dist: Math.sqrt(bd), cell: best };
  }

  get burningCount() { return this.burning.length; }
  get forestBurntFraction() { return this.burnableForest ? this.forestBurnt / this.burnableForest : 0; }
  get buildingsBurnt() { let n = 0; for (const b of this.buildingBurnt) n += b; return n; }

  drainEvents() { const e = this.events; this.events = []; return e; }
  drainChanged() { const c = this.changedCells; this.changedCells = []; return c; }
}
