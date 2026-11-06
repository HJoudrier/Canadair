// Affichage du feu : flammes cartoon instanciées et colonnes de fumée.
import * as THREE from 'three';
import { Particles } from '../view/particles.js';
import { toonGradient } from '../view/toon.js';
import { terrainHeight } from '../world/terrain.js';

function flameGeometry() {
  const cone = new THREE.ConeGeometry(1, 2.6, 6, 3).translate(0, 1.6, 0);
  const ball = new THREE.IcosahedronGeometry(1.05, 0).translate(0, 0.45, 0);
  const parts = [cone, ball].map((g) => (g.index ? g.toNonIndexed() : g));
  const low = new THREE.Color(0xff4d1a), mid = new THREE.Color(0xff9a1f), top = new THREE.Color(0xffe55c);
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  const c = new THREE.Color();
  for (const p of parts) {
    const a = p.attributes.position.array;
    pos.set(a, o * 3);
    for (let i = 0; i < p.attributes.position.count; i++) {
      const y = a[i * 3 + 1];
      const t = Math.min(1, Math.max(0, y / 2.9));
      if (t < 0.5) c.copy(low).lerp(mid, t * 2); else c.copy(mid).lerp(top, (t - 0.5) * 2);
      col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
    }
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class FireView {
  constructor(parent, world, fire, quality = {}) {
    this.world = world;
    this.fire = fire;
    this.maxFlames = quality.flames ?? 360;
    this.group = new THREE.Group();
    this.group.name = 'fire';
    parent.add(this.group);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.flames = new THREE.InstancedMesh(flameGeometry(), mat, this.maxFlames);
    this.flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.flames.name = 'flames';
    this.group.add(this.flames);
    this.smoke = new Particles(this.group, {
      max: quality.smoke ?? 260, name: 'smoke',
      geometry: new THREE.IcosahedronGeometry(1, 1),
      material: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() }),
    });
    this.shown = [];
    this.pickT = 0;
    this.smokeAcc = new Map();
    this.time = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  /** Choisit les cases en feu à dessiner (les plus proches des caméras). */
  pick(cameraPositions) {
    const fire = this.fire;
    const cells = fire.burning;
    const cap = Math.floor(this.maxFlames / 2);
    if (cells.length <= cap) { this.shown = cells.slice(); return; }
    const scored = cells.map((c) => {
      const p = fire.cellCenter(c);
      let d = Infinity;
      for (const cp of cameraPositions) d = Math.min(d, (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2);
      return [d, c];
    });
    scored.sort((a, b) => a[0] - b[0]);
    this.shown = scored.slice(0, cap).map((s) => s[1]);
  }

  update(dt, cameraPositions) {
    this.time += dt;
    this.pickT -= dt;
    if (this.pickT <= 0) { this.pick(cameraPositions); this.pickT = 0.3; }
    const fire = this.fire;
    const { _m, _q, _s, _p } = this;
    let n = 0;
    for (const c of this.shown) {
      if (fire.state[c] !== 2) continue;
      const I = fire.intensity[c];
      const base = fire.cellCenter(c);
      for (let k = 0; k < 2 && n < this.maxFlames; k++) {
        const h = ((c * 2654435761 + k * 97) >>> 0) / 4294967296;
        const ox = (h - 0.5) * 16, oz = (((h * 1000) % 1) - 0.5) * 16;
        const x = base.x + ox, z = base.z + oz;
        const y = terrainHeight(this.world, x, z);
        const flick = 1 + 0.18 * Math.sin(this.time * (9 + k * 3) + h * 40);
        const size = (2.6 + I * 4.2) * (k ? 0.75 : 1);
        _p.set(x, y - 0.5, z);
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h * 6);
        _s.set(size, size * flick * (1.1 + I * 0.6), size);
        _m.compose(_p, _q, _s);
        this.flames.setMatrixAt(n++, _m);
      }
    }
    this.flames.count = n;
    this.flames.instanceMatrix.needsUpdate = true;

    // Fumée : quelques bouffées par incendie
    const wind = fire.wind;
    for (const f of fire.activeFires()) {
      const rate = Math.min(9, 1.5 + f.size * 0.12);
      let acc = (this.smokeAcc.get(f.id) || 0) + rate * dt;
      while (acc >= 1) {
        acc -= 1;
        const c = f.cells[Math.floor(Math.random() * f.cells.length)];
        const p = fire.cellCenter(c);
        const y = terrainHeight(this.world, p.x, p.z);
        this.smoke.spawn({
          x: p.x + (Math.random() - 0.5) * 20, y: y + 8, z: p.z + (Math.random() - 0.5) * 20,
          vx: wind.x * (2 + wind.speed * 8), vy: 7 + Math.random() * 5, vz: wind.z * (2 + wind.speed * 8),
          size: 5 + Math.random() * 4, grow: 3.2, life: 8 + Math.random() * 3, drag: 0.05,
          color: 0x4a4644, colorEnd: 0xd9d6d0,
        });
      }
      this.smokeAcc.set(f.id, acc);
    }
    this.smoke.update(dt);
  }
}
