// Manettes Meta Quest (Touch) via WebXR : profil « xr-standard ».
// Droite : stick = pilotage, gâchette = larguer, A = caméra. Gauche : stick = gaz, X = recentrer, Y = pause.

const DEAD = 0.15;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));

export class XRInput {
  constructor(renderer) {
    this.renderer = renderer;
    this.prev = new Map();
  }

  sources() {
    const s = this.renderer.xr.getSession && this.renderer.xr.getSession();
    return s ? Array.from(s.inputSources) : [];
  }

  read(out, invertPitch = false) {
    for (const src of this.sources()) {
      const gp = src.gamepad;
      if (!gp) continue;
      const hand = src.handedness;
      const prev = this.prev.get(hand) || [];
      const cur = gp.buttons.map((b) => b.pressed);
      const hit = (i) => cur[i] && !prev[i];
      const sx = dz(gp.axes[2] ?? 0), sy = dz(gp.axes[3] ?? 0);
      if (hand === 'right') {
        out.steer += sx;
        out.pitch += invertPitch ? sy : -sy;
        out.drop = out.drop || !!cur[0];
        out.dropPressed = out.dropPressed || hit(0);
        out.go = out.go || hit(0);
        out.camera = out.camera || hit(4);
        out.pause = out.pause || hit(5);
      } else if (hand === 'left') {
        out.throttle += -sy;
        out.steer += sx * 0.6;
        out.drop = out.drop || !!cur[0];
        out.dropPressed = out.dropPressed || hit(0);
        out.go = out.go || hit(0) || -sy > 0.3;
        out.recenter = out.recenter || hit(4);
        out.pause = out.pause || hit(5);
      }
      if (sx || sy || cur[0]) out.active = true;
      this.prev.set(hand, cur);
    }
    return out;
  }

  nav() {
    // Dans le menu VR (avant d'entrer), rien : le menu est en 2D.
    return [];
  }

  pulse(intensity = 0.5, ms = 80) {
    for (const src of this.sources()) {
      const h = src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0];
      if (h && h.pulse) h.pulse(intensity, ms).catch?.(() => {});
    }
  }
}
