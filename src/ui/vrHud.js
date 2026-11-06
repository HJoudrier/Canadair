// Écran de bord dessiné dans une texture (lisible dans le casque VR, où le HTML n'apparaît pas).
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { TARGET_COLORS } from './arrow3d.js';

const ICON = { fire: '🔥', water: '💧', base: '🏠' };
const hex = (h) => '#' + h.toString(16).padStart(6, '0');

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export class VrHud {
  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = 1024; this.cv.height = 320;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4375), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.mesh.name = 'vr-hud';
    this.mesh.renderOrder = 4;
    this.timer = 0;
  }

  /** Place l'écran sur le tableau de bord (cockpit) ou devant soi (vue extérieure). */
  attach(parent, cockpit) {
    parent.add(this.mesh);
    if (cockpit) { this.mesh.position.set(0, 0.1, -6.98); this.mesh.rotation.set(-0.5, 0, 0); this.mesh.scale.setScalar(1); }
    else { this.mesh.position.set(0, -0.55, -1.3); this.mesh.rotation.set(-0.5, 0, 0); this.mesh.scale.setScalar(0.8); }
  }

  update(dt, s) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    const c = this.ctx;
    const W = 1024, H = 320;
    c.fillStyle = '#0b1a2a';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#ffd21f';
    c.lineWidth = 8;
    c.strokeRect(4, 4, W - 8, H - 8);
    const p = s.plane;
    // Réservoir
    c.fillStyle = '#1d3a57';
    c.fillRect(30, 30, 70, 180);
    c.fillStyle = '#2fa8ff';
    c.fillRect(30, 30 + 180 * (1 - p.tank), 70, 180 * p.tank);
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.strokeRect(30, 30, 70, 180);
    c.font = '40px sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center';
    c.fillText('💧', 65, 255);
    // Feux et forêt
    c.textAlign = 'left';
    c.font = 'bold 54px sans-serif';
    c.fillText(`🔥 ${s.fireCount}`, 140, 80);
    c.fillText(`🌲 ${s.forestPct}%`, 140, 150);
    c.font = '28px sans-serif';
    c.fillStyle = '#bfe6ff';
    c.fillText(`${Math.round(p.speed * 3.6)} km/h   ${Math.max(0, Math.round(p.alt))} m`, 140, 208);
    // Cible
    const tg = s.target;
    if (tg && s.arrows) {
      c.fillStyle = hex(TARGET_COLORS[tg.kind]);
      c.beginPath(); c.arc(860, 110, 80, 0, Math.PI * 2); c.fill();
      c.save();
      c.translate(860, 110);
      c.rotate(s.targetRel || 0);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(0, -60); c.lineTo(36, 0); c.lineTo(14, 0); c.lineTo(14, 50); c.lineTo(-14, 50); c.lineTo(-14, 0); c.lineTo(-36, 0); c.closePath(); c.fill();
      c.restore();
      c.textAlign = 'center'; c.font = 'bold 40px sans-serif'; c.fillStyle = '#ffffff';
      const d = tg.dist >= 1000 ? (tg.dist / 1000).toFixed(1) + ' km' : Math.round(tg.dist) + ' m';
      c.fillText(`${ICON[tg.kind]} ${d}`, 860, 240);
    }
    // Ligne du bas : radio ou alerte
    let line = s.radio ? '📻 ' + s.radio : (s.warning || '');
    if (s.paused) line = '⏸ ' + t('pause.title');
    if (line) {
      c.textAlign = 'left';
      c.font = '26px sans-serif';
      c.fillStyle = s.radio ? '#ffffff' : '#ffd21f';
      const lines = wrap(c, line, 600).slice(0, 2);
      lines.forEach((l, i) => c.fillText(l, 140, 252 + i * 32));
    }
    this.tex.needsUpdate = true;
  }
}
