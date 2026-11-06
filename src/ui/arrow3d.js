// Grande flèche 3D flottant devant l'avion, qui montre la direction à suivre (visible aussi en VR).
import * as THREE from 'three';
import { toon, outlineMaterial } from '../view/toon.js';
import { headingTo, wrapAngle, damp, dampAngle } from '../core/math.js';

export const TARGET_COLORS = { fire: 0xff3b30, water: 0x2fa8ff, base: 0x34c759 };

function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -5);
  s.lineTo(3.4, 0);
  s.lineTo(1.4, 0);
  s.lineTo(1.4, 4.2);
  s.lineTo(-1.4, 4.2);
  s.lineTo(-1.4, 0);
  s.lineTo(-3.4, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 });
  g.center();
  // La pointe vers -Z, à plat
  g.rotateX(-Math.PI / 2);
  return g;
}

function iconTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.lineWidth = 8;
  c.strokeStyle = '#1d2433';
  c.beginPath();
  c.arc(64, 64, 56, 0, Math.PI * 2);
  c.fillStyle = '#ffffff';
  c.fill();
  c.stroke();
  if (kind === 'fire') {
    c.fillStyle = '#ff5a1f';
    c.beginPath(); c.moveTo(64, 18); c.bezierCurveTo(98, 52, 100, 78, 86, 96); c.bezierCurveTo(74, 112, 50, 112, 40, 96);
    c.bezierCurveTo(28, 76, 40, 60, 48, 46); c.bezierCurveTo(50, 62, 58, 64, 60, 56); c.bezierCurveTo(62, 44, 58, 30, 64, 18); c.fill();
    c.fillStyle = '#ffd23f';
    c.beginPath(); c.ellipse(64, 88, 13, 18, 0, 0, Math.PI * 2); c.fill();
  } else if (kind === 'water') {
    c.fillStyle = '#2fa8ff';
    c.beginPath(); c.moveTo(64, 16); c.bezierCurveTo(84, 48, 98, 66, 98, 82); c.arc(64, 82, 34, 0, Math.PI, false);
    c.bezierCurveTo(30, 66, 44, 48, 64, 16); c.fill();
    c.fillStyle = '#bfe9ff'; c.beginPath(); c.ellipse(52, 84, 7, 12, -0.3, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = '#34c759';
    c.beginPath(); c.moveTo(64, 24); c.lineTo(104, 62); c.lineTo(24, 62); c.closePath(); c.fill();
    c.fillRect(36, 60, 56, 40);
    c.fillStyle = '#ffffff'; c.fillRect(56, 74, 16, 26);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Arrow3D {
  constructor(parent, layer = 0) {
    this.group = new THREE.Group();
    this.group.name = 'arrow';
    const geom = arrowGeometry();
    this.mat = toon(0xff3b30).clone();
    this.mesh = new THREE.Mesh(geom, this.mat);
    this.mesh.rotation.order = 'YXZ';
    const ol = new THREE.Mesh(geom, outlineMaterial(0x1d2433, 0.25));
    this.mesh.add(ol);
    this.group.add(this.mesh);
    this.icons = {};
    for (const k of ['fire', 'water', 'base']) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(k), depthTest: false, transparent: true }));
      sp.scale.set(4.2, 4.2, 1);
      sp.position.set(0, 4.5, 0);
      sp.visible = false;
      sp.renderOrder = 5;
      this.group.add(sp);
      this.icons[k] = sp;
    }
    this.yaw = 0;
    this.time = 0;
    this.alpha = 0;
    this.kind = null;
    parent.add(this.group);
    this.setLayer(layer);
  }

  setLayer(layer) {
    this.group.traverse((o) => o.layers.set(layer));
  }

  /**
   * @param anchor position (Vector3) devant laquelle placer la flèche
   * @param heading cap de l'avion
   * @param target {x, z, kind} ou null
   */
  update(dt, anchor, heading, target, enabled = true) {
    this.time += dt;
    const show = enabled && target && target.dist > 160;
    this.alpha = damp(this.alpha, show ? 1 : 0, 6, dt);
    this.group.visible = this.alpha > 0.05;
    if (!target) return;
    if (target.kind !== this.kind) {
      this.kind = target.kind;
      this.mat.color.setHex(TARGET_COLORS[target.kind] ?? 0xffffff);
      for (const k in this.icons) this.icons[k].visible = k === target.kind;
    }
    const want = headingTo(target.x - anchor.x, target.z - anchor.z);
    this.yaw = dampAngle(this.yaw, want, 8, dt);
    this.group.position.copy(anchor);
    this.group.position.y += Math.sin(this.time * 3) * 0.6;
    // Pointe relevée pour bien la voir depuis la caméra placée derrière
    this.mesh.rotation.set(0.55, -this.yaw, 0);
    const rel = wrapAngle(want - heading);
    const s = 0.7 + 0.3 * this.alpha;
    this.group.scale.setScalar(s * (1 + 0.15 * Math.abs(rel) / Math.PI));
  }
}
