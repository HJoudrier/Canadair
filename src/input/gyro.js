// Gyroscope du téléphone : on tient le téléphone en paysage comme un volant.
// Tourner = virer ; incliner le haut vers soi = monter.
import { clamp } from '../core/math.js';

const DEG = Math.PI / 180;

/** Direction de la gravité dans le repère de l'écran, à partir des angles d'orientation. */
export function gravityInScreen(beta, gamma, screenAngle) {
  const b = beta * DEG, g = gamma * DEG;
  // Vecteur « bas » dans le repère de l'appareil (x droite, y haut, z vers l'utilisateur)
  const dx = Math.cos(b) * Math.sin(g);
  const dy = -Math.sin(b);
  const dz = -Math.cos(b) * Math.cos(g);
  const a = (screenAngle || 0) * DEG;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
    z: dz,
  };
}

/** Angles de volant (roulis) et de tangage depuis la gravité écran. */
export function tiltAngles(g) {
  return {
    roll: Math.atan2(g.x, -g.y),
    pitch: Math.atan2(-g.z, -g.y),
  };
}

export class Gyro {
  constructor() {
    this.available = false;
    this.enabled = false;
    this.roll = 0;
    this.pitch = 0;
    this.neutralRoll = 0;
    this.neutralPitch = 0.6;
    this.calibrated = false;
    this.lastEvent = 0;
    this.onOrientation = (e) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      const t = tiltAngles(gravityInScreen(e.beta, e.gamma, angle));
      this.roll = t.roll;
      this.pitch = t.pitch;
      this.available = true;
      this.lastEvent = performance.now();
      if (!this.calibrated) this.calibrate();
    };
  }

  static supported() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** À appeler directement dans un geste utilisateur (clic) pour iOS. */
  async enable() {
    if (!Gyro.supported()) return false;
    if (!this.listening) {
      // On écoute dans tous les cas : si aucun événement n'arrive, le jeu passe au joystick tactile
      window.addEventListener('deviceorientation', this.onOrientation);
      this.listening = true;
    }
    this.enabled = true;
    try {
      const DOE = window.DeviceOrientationEvent;
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission();
        if (r === 'denied') { this.enabled = false; return false; }
      }
    } catch (e) {
      // Pas de geste utilisateur ou API partielle : on garde l'écoute
    }
    return this.enabled;
  }

  calibrate() {
    this.neutralRoll = this.roll;
    this.neutralPitch = this.pitch;
    this.calibrated = true;
  }

  read(out, invertPitch = false) {
    if (!this.enabled || !this.available) return out;
    let r = this.roll - this.neutralRoll;
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    const steer = clamp(r / (32 * DEG), -1, 1);
    let pitch = clamp((this.pitch - this.neutralPitch) / (22 * DEG), -1, 1);
    if (invertPitch) pitch = -pitch;
    const s = Math.abs(steer) < 0.08 ? 0 : steer;
    const p = Math.abs(pitch) < 0.12 ? 0 : pitch;
    out.steer += s;
    out.pitch += p;
    if (s || p) out.active = true;
    return out;
  }
}
