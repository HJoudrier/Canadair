// Commandes tactiles (téléphone / tablette) : bouton de largage, gaz, joystick de secours.
import { clamp } from '../core/math.js';

export function isTouchDevice() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

export class TouchControls {
  constructor(root, t) {
    this.root = root;
    this.t = t;
    this.state = { drop: false, dropPressed: false, camera: false, pause: false, throttle: 0.85, stickX: 0, stickY: 0 };
    this.visible = false;
    this.useStick = false;
    this.showThrottle = false;
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.className = 'touch-ui hidden';
    el.innerHTML = `
      <div class="touch-stick" data-k="stick"><div class="knob"></div></div>
      <div class="touch-throttle" data-k="thr"><div class="thr-fill"></div><div class="thr-label">⚡</div></div>
      <button class="touch-drop" data-k="drop" aria-label="drop">💧<span class="lbl"></span></button>
      <div class="touch-top">
        <button class="touch-small" data-k="camera" aria-label="camera">🎥</button>
        <button class="touch-small" data-k="pause" aria-label="pause">⏸</button>
      </div>`;
    this.root.appendChild(el);
    this.el = el;
    this.dropBtn = el.querySelector('.touch-drop');
    this.stick = el.querySelector('.touch-stick');
    this.knob = el.querySelector('.knob');
    this.thr = el.querySelector('.touch-throttle');
    this.thrFill = el.querySelector('.thr-fill');
    this.updateLabels();

    const down = (e) => {
      const k = e.currentTarget.dataset.k;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (k === 'drop') { this.state.drop = true; this.state.dropPressed = true; this.dropBtn.classList.add('on'); }
      if (k === 'camera') this.state.camera = true;
      if (k === 'pause') this.state.pause = true;
      if (k === 'stick') this.moveStick(e);
      if (k === 'thr') this.moveThrottle(e);
    };
    const move = (e) => {
      const k = e.currentTarget.dataset.k;
      if (k === 'stick' && e.buttons !== 0) this.moveStick(e);
      if (k === 'thr' && e.buttons !== 0) this.moveThrottle(e);
    };
    const up = (e) => {
      const k = e.currentTarget.dataset.k;
      if (k === 'drop') { this.state.drop = false; this.dropBtn.classList.remove('on'); }
      if (k === 'stick') { this.state.stickX = 0; this.state.stickY = 0; this.knob.style.transform = ''; }
    };
    for (const n of el.querySelectorAll('[data-k]')) {
      n.addEventListener('pointerdown', down);
      n.addEventListener('pointermove', move);
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', up);
      n.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  updateLabels() {
    this.dropBtn.querySelector('.lbl').textContent = this.t('touch.drop');
  }

  moveStick(e) {
    const r = this.stick.getBoundingClientRect();
    const x = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
    const y = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
    this.state.stickX = x;
    this.state.stickY = -y;
    this.knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
  }

  moveThrottle(e) {
    const r = this.thr.getBoundingClientRect();
    this.state.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    this.thrFill.style.height = Math.round(this.state.throttle * 100) + '%';
  }

  configure({ visible, useStick, showThrottle }) {
    this.visible = visible;
    this.useStick = useStick;
    this.showThrottle = showThrottle;
    this.el.classList.toggle('hidden', !visible);
    this.stick.style.display = useStick ? '' : 'none';
    this.thr.style.display = showThrottle ? '' : 'none';
    this.thrFill.style.height = Math.round(this.state.throttle * 100) + '%';
  }

  read(out, invertPitch = false) {
    if (!this.visible) return out;
    const s = this.state;
    if (this.useStick) {
      out.steer += s.stickX;
      out.pitch += invertPitch ? -s.stickY : s.stickY;
      if (s.stickX || s.stickY) out.active = true;
    }
    if (this.showThrottle) out.throttleSet = s.throttle;
    out.drop = out.drop || s.drop;
    out.dropPressed = out.dropPressed || s.dropPressed;
    out.go = out.go || s.dropPressed;
    out.camera = out.camera || s.camera;
    out.pause = out.pause || s.pause;
    if (s.drop) out.active = true;
    s.dropPressed = false; s.camera = false; s.pause = false;
    return out;
  }
}
