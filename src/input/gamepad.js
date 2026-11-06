// Manettes (API Gamepad, disposition « standard » : Xbox, PlayStation…).

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.16;

function dz(v) {
  if (Math.abs(v) < DEAD) return 0;
  return Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
}

export class Gamepads {
  constructor() {
    this.pads = [];          // manettes connectées, triées par index
    this.prev = new Map();   // index -> états précédents des boutons
    this.cur = new Map();
    this.navHold = new Map();
    this.lastUse = new Map();
  }

  poll() {
    const list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    this.pads = list.filter((p) => p && p.connected).sort((a, b) => a.index - b.index);
    for (const p of this.pads) {
      this.prev.set(p.index, this.cur.get(p.index) || []);
      const b = p.buttons.map((x) => x.pressed || x.value > 0.5);
      this.cur.set(p.index, b);
      if (b.some(Boolean) || p.axes.some((a) => Math.abs(a) > 0.3)) this.lastUse.set(p.index, performance.now());
    }
  }

  get count() { return this.pads.length; }
  pad(slot) { return this.pads[slot] || null; }
  held(pad, btn) { return !!(this.cur.get(pad.index) || [])[btn]; }
  hit(pad, btn) { return this.held(pad, btn) && !(this.prev.get(pad.index) || [])[btn]; }

  /** Remplit une entrée de pilotage depuis la manette n° `slot`. */
  read(slot, out, invertPitch = false) {
    const p = this.pad(slot);
    if (!p) return out;
    const ax = p.axes;
    const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0);
    const steer = lx + (this.held(p, BTN.RIGHT) ? 1 : 0) - (this.held(p, BTN.LEFT) ? 1 : 0);
    let pitch = -ly + (this.held(p, BTN.UP) ? 1 : 0) - (this.held(p, BTN.DOWN) ? 1 : 0);
    if (invertPitch) pitch = -pitch;
    const rt = p.buttons[BTN.RT] ? p.buttons[BTN.RT].value : 0;
    const lt = p.buttons[BTN.LT] ? p.buttons[BTN.LT].value : 0;
    out.steer += steer;
    out.pitch += pitch;
    out.throttle += rt - lt;
    const drop = this.held(p, BTN.A) || this.held(p, BTN.RB);
    out.drop = out.drop || drop;
    out.dropPressed = out.dropPressed || this.hit(p, BTN.A) || this.hit(p, BTN.RB);
    out.camera = out.camera || this.hit(p, BTN.B) || this.hit(p, BTN.Y);
    out.pause = out.pause || this.hit(p, BTN.START);
    out.go = out.go || this.hit(p, BTN.A) || rt > 0.3;
    out.override = out.override || this.held(p, BTN.LB);
    out.recenter = out.recenter || this.hit(p, BTN.VIEW);
    if (Math.abs(steer) > 0 || Math.abs(pitch) > 0 || rt > 0.1 || lt > 0.1 || drop) out.active = true;
    return out;
  }

  /** Événements de navigation dans les menus (toutes manettes confondues). */
  nav() {
    const n = [];
    const now = performance.now();
    for (const p of this.pads) {
      const ax = p.axes;
      const dirs = {
        up: this.held(p, BTN.UP) || (ax[1] || 0) < -0.6,
        down: this.held(p, BTN.DOWN) || (ax[1] || 0) > 0.6,
        left: this.held(p, BTN.LEFT) || (ax[0] || 0) < -0.6,
        right: this.held(p, BTN.RIGHT) || (ax[0] || 0) > 0.6,
      };
      for (const d in dirs) {
        const key = p.index + d;
        if (dirs[d]) {
          const t = this.navHold.get(key);
          if (t === undefined) { n.push(d); this.navHold.set(key, now + 420); }
          else if (now > t) { n.push(d); this.navHold.set(key, now + 160); }
        } else this.navHold.delete(key);
      }
      if (this.hit(p, BTN.A)) n.push('ok');
      if (this.hit(p, BTN.B)) n.push('back');
      if (this.hit(p, BTN.START)) n.push('start');
    }
    return n;
  }

  /** Index (dans l'ordre) des manettes qui viennent d'appuyer sur A ou Start. */
  joinPresses() {
    const out = [];
    this.pads.forEach((p, slot) => { if (this.hit(p, BTN.A) || this.hit(p, BTN.START)) out.push(slot); });
    return out;
  }

  rumble(slot, strong = 0.5, weak = 0.5, ms = 120) {
    const p = this.pad(slot);
    const act = p && p.vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  }
}
