// Caméras : vue de poursuite (derrière l'avion) et vue cockpit.
import * as THREE from 'three';
import { dampAngle, damp, clamp } from '../core/math.js';
import { surfaceHeight } from '../world/terrain.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class PlaneCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.yaw = null;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.lift = 0;
  }

  toggle() { this.mode = this.mode === 'chase' ? 'cockpit' : 'chase'; return this.mode; }

  update(dt, p, model, world) {
    const cam = this.camera;
    if (this.mode === 'cockpit') {
      model.root.updateMatrixWorld(true);
      model.eye.getWorldPosition(_v);
      cam.position.copy(_v);
      model.root.getWorldQuaternion(_q);
      cam.quaternion.copy(_q);
      cam.fov = 70;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.yaw === null) {
      this.yaw = p.heading;
      this.reset = true;
    }
    this.yaw = dampAngle(this.yaw, p.heading, p.onGround ? 6 : 2.6, dt);
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dist = 42 + Math.max(0, p.speed - 40) * 0.25;
    this.lift = damp(this.lift, clamp(-p.gamma * 30, -8, 10), 2, dt);
    const tx = p.x - fx * dist, tz = p.z - fz * dist;
    let ty = p.y + 11 + this.lift;
    const g = surfaceHeight(world, tx, tz);
    if (ty < g + 4) ty = g + 4;
    if (this.reset) { this.pos.set(tx, ty, tz); this.reset = false; }
    this.pos.x = damp(this.pos.x, tx, 8, dt);
    this.pos.y = damp(this.pos.y, ty, 5, dt);
    this.pos.z = damp(this.pos.z, tz, 8, dt);
    cam.position.copy(this.pos);
    this.look.set(p.x + fx * 30, p.y + 2, p.z + fz * 30);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.rotateZ(-p.bank * 0.22);
    const fov = 60 + clamp((p.speed - 40) * 0.2, 0, 8);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = damp(cam.fov, fov, 2, dt); cam.updateProjectionMatrix(); }
  }
}
