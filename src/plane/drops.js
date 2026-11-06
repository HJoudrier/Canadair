// Eau larguée : « paquets » d'eau en chute balistique qui éteignent le feu à l'impact.
import { surfaceHeight, waterLevel, terrainHeight } from '../world/terrain.js';

const PARCEL = 0.02; // fraction de réservoir par paquet

export class DropSystem {
  constructor(world, fire) {
    this.world = world;
    this.fire = fire;
    this.parcels = [];
    this.impacts = []; // pour l'affichage (éclaboussures, vapeur)
    this.totalExtinguished = 0;
  }

  /** Transforme l'eau sortie du réservoir depuis le dernier pas en paquets. */
  emit(p, diff, rand = Math.random) {
    while (p.dropOut >= PARCEL) {
      p.dropOut -= PARCEL;
      const back = 4 + rand() * 3;
      const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
      this.parcels.push({
        x: p.x - fx * back + (rand() - 0.5) * 4,
        y: p.y - 2.5,
        z: p.z - fz * back + (rand() - 0.5) * 4,
        vx: p.vx * 0.9 + (rand() - 0.5) * 3,
        vy: p.vy * 0.5 - 2 - rand() * 2,
        vz: p.vz * 0.9 + (rand() - 0.5) * 3,
        age: 0,
        amount: PARCEL * diff.dropPower,
        radius: diff.dropRadius,
        magnet: diff.dropMagnet || 0,
        owner: p.slot,
      });
    }
  }

  update(dt) {
    const keep = [];
    let ext = 0;
    for (const d of this.parcels) {
      d.age += dt;
      d.vy -= 9.81 * dt;
      const drag = Math.exp(-0.35 * dt);
      d.vx *= drag; d.vz *= drag;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const ground = surfaceHeight(this.world, d.x, d.z);
      if (d.y <= ground) {
        const wl = waterLevel(this.world, d.x, d.z);
        const intoWater = !Number.isNaN(wl) && wl >= terrainHeight(this.world, d.x, d.z) - 0.05;
        const r = d.radius * Math.min(1.5, 0.75 + 0.15 * d.age);
        let res = { extinguished: 0, hit: 0 };
        let ix = d.x, iz = d.z;
        if (!intoWater && this.fire && d.magnet > 0) {
          // Aide Petit pilote : l'eau glisse vers la flamme la plus proche
          const nb = this.fire.nearestBurning(ix, iz);
          if (nb && nb.dist < d.magnet && nb.dist > 1) {
            const k = Math.min(1, (d.magnet * 0.7) / nb.dist);
            ix += (nb.x - ix) * k;
            iz += (nb.z - iz) * k;
          }
        }
        if (!intoWater && this.fire) res = this.fire.applyWater(ix, iz, r, d.amount);
        ext += res.extinguished;
        this.impacts.push({ x: d.x, y: ground, z: d.z, water: intoWater, steam: res.hit > 0, owner: d.owner });
        continue;
      }
      if (d.age < 12) keep.push(d);
    }
    this.parcels = keep;
    this.totalExtinguished += ext;
    return ext;
  }

  drainImpacts() { const i = this.impacts; this.impacts = []; return i; }
}

/** Point d'impact prévu si l'on larguait maintenant (pour le viseur au sol). */
export function predictImpact(world, p) {
  let x = p.x, y = p.y - 2.5, z = p.z;
  let vx = p.vx * 0.9, vy = p.vy * 0.5 - 3, vz = p.vz * 0.9;
  const dt = 1 / 15;
  for (let t = 0; t < 10; t += dt) {
    vy -= 9.81 * dt;
    const drag = Math.exp(-0.35 * dt);
    vx *= drag; vz *= drag;
    x += vx * dt; y += vy * dt; z += vz * dt;
    const g = surfaceHeight(world, x, z);
    if (y <= g) return { x, y: g, z, t };
  }
  return null;
}
