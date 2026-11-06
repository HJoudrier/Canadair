// Clavier (PC et tests). Utilise e.code : fonctionne en AZERTY (ZQSD) comme en QWERTY (WASD).

const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.lastUse = 0;
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.lastUse = performance.now();
      if (GAME_KEYS.has(e.code) && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  key(...codes) { return codes.some((c) => this.down.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  read(out, invertPitch = false) {
    const steer = (this.key('ArrowRight', 'KeyD') ? 1 : 0) - (this.key('ArrowLeft', 'KeyA') ? 1 : 0);
    let pitch = (this.key('ArrowUp', 'KeyW') ? 1 : 0) - (this.key('ArrowDown', 'KeyS') ? 1 : 0);
    if (invertPitch) pitch = -pitch;
    const thr = (this.key('ShiftLeft', 'ShiftRight', 'KeyR') ? 1 : 0) - (this.key('ControlLeft', 'ControlRight', 'KeyF') ? 1 : 0);
    out.steer += steer;
    out.pitch += pitch;
    out.throttle += thr;
    out.drop = out.drop || this.key('Space');
    out.dropPressed = out.dropPressed || this.hit('Space');
    out.camera = out.camera || this.hit('KeyC');
    out.pause = out.pause || this.hit('Escape', 'KeyP');
    out.go = out.go || this.hit('Enter') || thr > 0;
    out.recenter = out.recenter || this.hit('KeyV');
    out.override = out.override || this.key('KeyQ');
    if (steer || pitch || thr || this.key('Space')) out.active = true;
    return out;
  }

  /** Navigation dans les menus. */
  nav() {
    const n = [];
    if (this.hit('ArrowUp', 'KeyW')) n.push('up');
    if (this.hit('ArrowDown', 'KeyS')) n.push('down');
    if (this.hit('ArrowLeft', 'KeyA')) n.push('left');
    if (this.hit('ArrowRight', 'KeyD')) n.push('right');
    if (this.hit('Escape', 'Backspace')) n.push('back');
    return n;
  }

  endFrame() { this.pressed.clear(); }
}
