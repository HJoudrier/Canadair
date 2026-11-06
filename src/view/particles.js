// Système de particules instanciées (fumée, vapeur, éclaboussures, embruns…).
import * as THREE from 'three';
import { toonGradient } from './toon.js';

export class Particles {
  constructor(parent, { max = 300, geometry, material, name = 'particles' } = {}) {
    this.max = max;
    this.geometry = geometry || new THREE.IcosahedronGeometry(1, 0);
    this.material = material || new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    parent.add(this.mesh);
    this.p = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x, y: o.y, z: o.z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 1, age: 0,
      size: o.size || 1, grow: o.grow || 0,
      gravity: o.gravity || 0, drag: o.drag ?? 0.5,
      c0: o.color ?? 0xffffff, c1: o.colorEnd ?? o.color ?? 0xffffff,
      stretch: o.stretch || 0, fade: o.fade ?? true,
    });
  }

  update(dt) {
    const keep = [];
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= q.gravity * dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d; q.vz *= d; q.vy *= q.gravity ? 1 : d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      keep.push(q);
    }
    this.p = keep;
    const { _m, _q, _s, _v, _c } = this;
    const c0 = new THREE.Color(), c1 = new THREE.Color();
    for (let i = 0; i < keep.length; i++) {
      const q = keep[i];
      const t = q.age / q.life;
      let s = q.size + q.grow * q.age;
      if (q.fade) s *= t < 0.15 ? t / 0.15 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      _v.set(q.x, q.y, q.z);
      _s.set(s, s * (1 + q.stretch), s);
      _q.identity();
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      c0.set(q.c0); c1.set(q.c1);
      _c.copy(c0).lerp(c1, t);
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.count = keep.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.p = []; this.mesh.count = 0; }
}
