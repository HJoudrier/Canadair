// Petits utilitaires mathématiques partagés (sans Three.js).

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Rapproche `current` de `target` avec une vitesse max `rate` (unités/s). */
export const approach = (current, target, rate, dt) => {
  const d = target - current;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : current + Math.sign(d) * step;
};
/** Lissage exponentiel indépendant du framerate. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export const TAU = Math.PI * 2;
/** Ramène un angle dans ]-PI, PI]. */
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const dampAngle = (current, target, lambda, dt) =>
  current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));

/** Cap (0 = nord, PI/2 = est) vers le vecteur (dx, dz) — z positif = sud. */
export const headingTo = (dx, dz) => Math.atan2(dx, -dz);
export const forwardX = (heading) => Math.sin(heading);
export const forwardZ = (heading) => -Math.cos(heading);

/** Index de rose des vents (0 = N, 1 = NE, …, 7 = NO) pour un déplacement (dx, dz). */
export function compass8(dx, dz) {
  const h = headingTo(dx, dz);
  return ((Math.round(h / (Math.PI / 4)) % 8) + 8) % 8;
}

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
