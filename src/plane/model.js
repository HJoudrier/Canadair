// Canadair cartoon construit en primitives (jaune et rouge), avec cockpit pour la vue intérieure / VR.
import * as THREE from 'three';
import { toon, outlineMaterial } from '../view/toon.js';

const OUTLINE = outlineMaterial(0x1d2433, 0.09);

function add(parent, geom, color, pos, opts = {}) {
  const m = new THREE.Mesh(geom, toon(color, opts.mat || {}));
  m.position.set(pos[0], pos[1], pos[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts.scale) m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
  if (opts.outline) {
    const o = new THREE.Mesh(geom, OUTLINE);
    o.name = 'outline';
    m.add(o);
  }
  parent.add(m);
  return m;
}

function tailDecal(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = color;
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
}

export const LIVERIES = [
  { body: 0xffd21f, accent: 0xe63946, text: '#e63946', num: '41' },
  { body: 0xf4f6fb, accent: 0xe63946, text: '#1d3557', num: '42' },
];

export function createCanadair(slot = 0) {
  const liv = LIVERIES[slot % LIVERIES.length];
  const root = new THREE.Group();
  root.name = 'canadair' + slot;
  root.rotation.order = 'YXZ';
  const exterior = new THREE.Group();
  root.add(exterior);

  // Fuselage (coque de bateau ovale)
  const fus = new THREE.CapsuleGeometry(1.55, 14.5, 6, 14).rotateX(Math.PI / 2);
  add(exterior, fus, liv.body, [0, 0, 0], { scale: [1, 1.22, 1], outline: true });
  // Bandes rouges
  for (const z of [-5.2, 4.2, 5.4]) {
    const ring = new THREE.CylinderGeometry(1.6, 1.6, z > 0 ? 0.7 : 1.2, 16, 1, true).rotateX(Math.PI / 2);
    add(exterior, ring, liv.accent, [0, 0, z], { scale: [1, 1.22, 1], mat: { side: THREE.DoubleSide } });
  }
  // Quille
  add(exterior, new THREE.BoxGeometry(1.6, 0.7, 11), 0xf2f2f2, [0, -1.65, -1.5]);
  // Queue relevée
  add(exterior, new THREE.ConeGeometry(1.25, 4.5, 12).rotateX(Math.PI / 2), liv.body, [0, 0.55, 10.4], { scale: [1, 1.1, 1], rot: [-0.18, 0, 0], outline: true });
  // Vitres du cockpit
  const glass = 0x274b7a;
  add(exterior, new THREE.BoxGeometry(2.3, 0.75, 0.25), glass, [0, 1.05, -7.55], { rot: [-0.55, 0, 0] });
  for (const s of [-1, 1]) {
    add(exterior, new THREE.BoxGeometry(0.12, 0.65, 1.7), glass, [s * 1.5, 0.75, -6.6]);
    for (let k = 0; k < 4; k++) add(exterior, new THREE.BoxGeometry(0.12, 0.5, 0.6), glass, [s * 1.55, 0.6, -3.2 + k * 1.6]);
  }

  // Aile haute
  add(exterior, new THREE.BoxGeometry(30, 0.55, 3.4), liv.body, [0, 2.35, -1], { outline: true });
  add(exterior, new THREE.BoxGeometry(2.4, 1.0, 4.2), liv.body, [0, 1.8, -1]);
  for (const s of [-1, 1]) add(exterior, new THREE.BoxGeometry(1.4, 0.6, 3.5), liv.accent, [s * 15.2, 2.35, -1]);

  // Moteurs et hélices
  const props = [];
  for (const s of [-1, 1]) {
    const nac = new THREE.CapsuleGeometry(0.78, 3.4, 4, 10).rotateX(Math.PI / 2);
    add(exterior, nac, liv.body, [s * 4.7, 2.0, -2.5], { outline: true });
    add(exterior, new THREE.ConeGeometry(0.5, 1.3, 10).rotateX(-Math.PI / 2), liv.accent, [s * 4.7, 2.0, -5.3]);
    const prop = new THREE.Group();
    prop.position.set(s * 4.7, 2.0, -4.9);
    for (let k = 0; k < 2; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.4, 0.08), toon(0x2b2d33));
      blade.rotation.z = (k * Math.PI) / 2;
      prop.add(blade);
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.name = 'disc';
    prop.add(disc);
    exterior.add(prop);
    props.push(prop);
  }

  // Dérive et empennage en T
  add(exterior, new THREE.BoxGeometry(0.45, 6.0, 3.4), liv.accent, [0, 3.6, 9.4], { rot: [-0.28, 0, 0], outline: true });
  add(exterior, new THREE.BoxGeometry(10, 0.38, 2.5), liv.accent, [0, 6.4, 10.4], { outline: true });
  const decal = tailDecal(liv.num, '#ffffff');
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), decal);
    d.position.set(s * 0.25, 3.6, 9.3);
    d.rotation.set(0, s * Math.PI / 2, 0);
    exterior.add(d);
  }

  // Flotteurs de bout d'aile
  for (const s of [-1, 1]) {
    const fl = new THREE.CapsuleGeometry(0.45, 2.4, 4, 8).rotateX(Math.PI / 2);
    add(exterior, fl, liv.body, [s * 12.6, 0.2, -0.8], { outline: true });
    add(exterior, new THREE.BoxGeometry(0.15, 2.0, 0.5), 0x8a8f99, [s * 12.6, 1.3, -0.8]);
  }

  // Train d'atterrissage
  const gear = new THREE.Group();
  for (const [x, z] of [[-1.7, 0.6], [1.7, 0.6], [0, -6]]) {
    add(gear, new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12).rotateZ(Math.PI / 2), 0x222222, [x, -2.0, z]);
    add(gear, new THREE.BoxGeometry(0.2, 1.0, 0.2), 0x8a8f99, [x, -1.5, z]);
  }
  exterior.add(gear);

  // Cockpit (vue intérieure et VR)
  const cockpit = new THREE.Group();
  cockpit.visible = false;
  const dark = 0x3a3f4a;
  add(cockpit, new THREE.BoxGeometry(2.8, 0.55, 0.7), dark, [0, 0.15, -7.35]);           // tableau de bord
  add(cockpit, new THREE.BoxGeometry(2.9, 0.12, 2.6), liv.body, [0, 1.55, -6.3]);          // plafond
  for (const s of [-1, 1]) {
    add(cockpit, new THREE.BoxGeometry(0.12, 0.95, 3.2), 0xe8e2d0, [s * 1.45, 0.0, -6.1]); // parois
    add(cockpit, new THREE.BoxGeometry(0.14, 1.1, 0.14), dark, [s * 1.2, 1.0, -7.35], { rot: [-0.5, 0, 0] }); // montants
    // Manches (yokes)
    add(cockpit, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6).rotateX(Math.PI / 2), dark, [s * 0.55, 0.05, -6.8]);
    add(cockpit, new THREE.TorusGeometry(0.2, 0.04, 6, 14, Math.PI), 0x222222, [s * 0.55, 0.12, -6.5], { rot: [0, 0, Math.PI] });
  }
  add(cockpit, new THREE.BoxGeometry(0.1, 0.7, 0.1), dark, [0, 1.05, -7.5], { rot: [-0.5, 0, 0] });
  // Écran du tableau de bord (rempli par le HUD VR)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.42), new THREE.MeshBasicMaterial({ color: 0x0b1a2a }));
  screen.position.set(0, 0.45, -7.02);
  screen.rotation.x = -0.35;
  cockpit.add(screen);
  root.add(cockpit);

  const eye = new THREE.Object3D();
  eye.position.set(0, 0.85, -6.1);
  root.add(eye);

  const api = {
    root, exterior, cockpit, gear, props, eye, screen, slot,
    spin: 0,
    setCockpit(on) {
      cockpit.visible = on;
      exterior.traverse((o) => { if (o.name === 'outline') o.visible = !on; });
    },
    update(p, dt, rollScale = 1, pitchScale = 1) {
      root.position.set(p.x, p.y, p.z);
      root.rotation.set(p.gamma * pitchScale, -p.heading, -p.bank * rollScale);
      const rpm = p.onGround ? (p.started ? 0.4 + p.speed / 40 : 0.25) : 0.8 + p.throttle * 0.4;
      api.spin += rpm * 40 * dt;
      for (const pr of props) {
        pr.rotation.z = api.spin;
        const disc = pr.getObjectByName('disc');
        disc.material.opacity = Math.min(0.22, rpm * 0.2);
        for (const b of pr.children) if (b !== disc) b.visible = rpm < 0.7;
      }
      gear.visible = p.onGround || p.alt < 25;
      root.visible = p.crashT <= 0 || Math.floor(p.crashT * 6) % 2 === 0;
    },
  };
  return api;
}
