// Mini-carte (nord en haut) : relief, feux, villages, aérodrome, avions et cible.
import { COLORS, B, BURNT_COLOR } from '../world/biomes.js';
import { TARGET_COLORS } from './arrow3d.js';

const css = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
const hex = (h) => '#' + h.toString(16).padStart(6, '0');
export const PLANE_COLORS = ['#ffd21f', '#ffffff'];

/** Image de fond partagée (une case = un pixel). */
export class MinimapBase {
  constructor(world) {
    this.world = world;
    const N = world.cells;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N);
    const { V, biome, height } = world;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const b = biome[j * V + i];
        let c = COLORS[b];
        if (b === B.LAKE || b === B.RIVER) c = COLORS[B.SEA];
        const k = b === B.SEA ? 1 : 0.85 + Math.min(0.3, height[j * V + i] / 1500);
        const o = (j * N + i) * 4;
        img.data[o] = Math.min(255, c[0] * 255 * k);
        img.data[o + 1] = Math.min(255, c[1] * 255 * k);
        img.data[o + 2] = Math.min(255, c[2] * 255 * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.canvas = cv;
    this.ctx = ctx;
  }

  markBurnt(c) {
    const N = this.world.cells;
    const i = c % N, j = (c - i) / N;
    this.ctx.fillStyle = css(BURNT_COLOR);
    this.ctx.fillRect(i, j, 1, 1);
  }
}

export class Minimap {
  constructor(canvas, base) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = base;
    this.t = 0;
  }

  draw(game, slot, target) {
    const { cv, ctx } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(cv.clientWidth * dpr);
    if (!size) return;
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    const w = game.world;
    const { min, max } = w.bounds;
    const span = max - min;
    const sc = size / span;
    const toX = (x) => (x - min) * sc, toY = (z) => (z - min) * sc;
    ctx.imageSmoothingEnabled = false;
    const cs = w.cell;
    ctx.drawImage(this.base.canvas, min / cs, min / cs, span / cs, span / cs, 0, 0, size, size);

    // Feux
    ctx.fillStyle = '#ff3b1f';
    const r = Math.max(2, w.cell * sc * 1.6);
    const fire = game.fire;
    const step = Math.max(1, Math.floor(fire.burning.length / 300));
    for (let k = 0; k < fire.burning.length; k += step) {
      const p = fire.cellCenter(fire.burning[k]);
      ctx.fillRect(toX(p.x) - r / 2, toY(p.z) - r / 2, r, r);
    }
    // Lieux habités
    for (const p of w.places) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = Math.max(1, size / 120);
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), Math.max(3, p.r * sc * 0.6), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Aérodrome
    const ap = w.airport;
    ctx.save();
    ctx.translate(toX(ap.x), toY(ap.z));
    ctx.rotate(ap.heading);
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(-Math.max(2, ap.width * sc), -ap.length * sc / 2, Math.max(4, ap.width * sc * 2), ap.length * sc);
    ctx.restore();

    // Cible
    this.t += 0.1;
    if (target) {
      ctx.strokeStyle = hex(TARGET_COLORS[target.kind] ?? 0xffffff);
      ctx.lineWidth = Math.max(2, size / 60);
      ctx.beginPath();
      ctx.arc(toX(target.x), toY(target.z), size / 22 + Math.sin(this.t * 2) * size / 120, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Avions
    game.planes.forEach((p, i) => {
      ctx.save();
      ctx.translate(toX(p.x), toY(p.z));
      ctx.rotate(p.heading);
      const s = size / 18 * (i === slot ? 1 : 0.8);
      ctx.fillStyle = PLANE_COLORS[i % 2];
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = Math.max(1.5, size / 100);
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.7, s * 0.7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }
}
