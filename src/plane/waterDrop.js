// Effets d'eau : rideau d'eau largué, éclaboussures, vapeur, gerbes d'écopage, ombre et viseur.
import * as THREE from 'three';
import { Particles } from '../view/particles.js';
import { toonGradient } from '../view/toon.js';
import { surfaceHeight } from '../world/terrain.js';

export class WaterView {
  constructor(parent, world, quality = {}) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'water-fx';
    parent.add(this.group);
    const wmat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), transparent: true, opacity: 0.8, depthWrite: false });
    this.drops = new Particles(this.group, { max: quality.drops ?? 420, geometry: new THREE.IcosahedronGeometry(1, 0), material: wmat, name: 'drops' });
    this.splash = new Particles(this.group, { max: quality.splash ?? 320, geometry: new THREE.IcosahedronGeometry(1, 0), name: 'splash' });
    this.steam = new Particles(this.group, { max: 160, geometry: new THREE.IcosahedronGeometry(1, 1), name: 'steam' });
    this.dust = new Particles(this.group, { max: 80, geometry: new THREE.IcosahedronGeometry(1, 1), name: 'dust' });
  }

  /** Dessine les paquets d'eau en vol (positions tirées de DropSystem). */
  showParcels(parcels) {
    // Chaque paquet d'eau = petit nuage de gouttelettes qui s'étale en tombant
    const list = [];
    parcels.forEach((d, i) => {
      for (let k = 0; k < 3; k++) {
        const h = ((i * 7 + k * 13) * 2654435761 >>> 0) / 4294967296;
        const spread = 1.5 + d.age * 4;
        list.push({
          x: d.x + (h - 0.5) * spread, y: d.y + (k - 1) * 0.8 * (1 + d.age), z: d.z + (((h * 97) % 1) - 0.5) * spread,
          vx: 0, vy: 0, vz: 0, life: 99, age: 0.5, size: 0.7 + d.age * 0.9, grow: 0, gravity: 0, drag: 0,
          c0: k ? 0xe8f8ff : 0xbfe9ff, c1: 0xe8f8ff, stretch: 0.8, fade: false,
        });
      }
    });
    this.drops.p = list;
    this.drops.update(0);
  }

  impacts(list) {
    for (const im of list) {
      if (Math.random() < 0.5) {
        for (let k = 0; k < 2; k++) {
          this.splash.spawn({
            x: im.x + (Math.random() - 0.5) * 14, y: im.y + 1, z: im.z + (Math.random() - 0.5) * 14,
            vx: (Math.random() - 0.5) * 10, vy: 6 + Math.random() * 8, vz: (Math.random() - 0.5) * 10,
            size: 1.4 + Math.random(), life: 1.2, gravity: 14, drag: 0.4, color: 0xffffff, colorEnd: 0xbfe9ff,
          });
        }
      }
      if (im.steam) {
        this.steam.spawn({
          x: im.x + (Math.random() - 0.5) * 20, y: im.y + 3, z: im.z + (Math.random() - 0.5) * 20,
          vy: 5 + Math.random() * 4, size: 4 + Math.random() * 3, grow: 4, life: 3.5, drag: 0.2,
          color: 0xffffff, colorEnd: 0xe8eef2,
        });
      }
    }
  }

  /** Gerbes d'eau derrière l'avion quand il écope. */
  scoopSpray(p, dt) {
    const n = Math.ceil(dt * 50);
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    const rx = Math.cos(p.heading), rz = Math.sin(p.heading);
    for (let k = 0; k < n; k++) {
      const side = (Math.random() - 0.5) * 2;
      const back = 2 + Math.random() * 6;
      this.splash.spawn({
        x: p.x - fx * back + rx * side * 2, y: p.y - 2.5, z: p.z - fz * back + rz * side * 2,
        vx: p.vx * 0.3 + rx * side * 9, vy: 5 + Math.random() * 7, vz: p.vz * 0.3 + rz * side * 9,
        size: 1.2 + Math.random() * 1.4, life: 1.1, gravity: 12, drag: 0.6, color: 0xffffff, colorEnd: 0xaee3ff,
      });
    }
  }

  crashPuff(p) {
    for (let k = 0; k < 24; k++) {
      this.dust.spawn({
        x: p.x + (Math.random() - 0.5) * 10, y: p.y + Math.random() * 3, z: p.z + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 14, vy: 3 + Math.random() * 8, vz: (Math.random() - 0.5) * 14,
        size: 3 + Math.random() * 3, grow: 2.5, life: 2.2, drag: 1.2, color: 0xc9b38f, colorEnd: 0xf2e8d5,
      });
    }
  }

  update(dt) {
    this.splash.update(dt);
    this.steam.update(dt);
    this.dust.update(dt);
  }
}

/** Ombre ronde sous l'avion (aide à évaluer la hauteur). */
export function createBlobShadow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
  );
  m.name = 'shadow';
  m.renderOrder = 2;
  return m;
}

export function updateBlobShadow(mesh, world, p) {
  const g = surfaceHeight(world, p.x, p.z);
  const h = Math.max(0, p.y - g);
  const s = Math.max(6, 26 - h * 0.08);
  mesh.position.set(p.x, g + 0.4, p.z);
  mesh.scale.set(s * 1.1, 1, s);
  mesh.rotation.y = -p.heading;
  mesh.material.opacity = Math.max(0.15, 1 - h / 400);
  mesh.visible = h < 450 && p.crashT <= 0;
}

/** Cercle au sol qui montre où tombera l'eau. */
export function createImpactMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  g.add(ring, dot);
  g.name = 'impact-marker';
  g.renderOrder = 3;
  return g;
}
