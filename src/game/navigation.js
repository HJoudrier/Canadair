// Choix de la cible indiquée par la flèche : feu, eau ou base.
import { nearestWaterPoint } from '../world/hydrology.js';

export function chooseTarget(p, game) {
  const { world, fire, mission } = game;
  const ap = world.airport;
  const base = () => ({ x: ap.x, z: ap.z, kind: 'base' });
  let t = null;
  const fires = fire.burningCount > 0;
  if (p.onGround) return null;
  if (mission.complete && !fires) t = base();
  else if (p.tank < 0.2 && !p.dropping) {
    const w = nearestWaterPoint(world.waterPoints, p.x, p.z, 500);
    t = w ? { x: w.point.x, z: w.point.z, kind: 'water' } : base();
  } else if (fires) {
    // On vise le foyer le plus proche ; de près, la case en feu la plus proche
    let best = null, bd = Infinity;
    for (const f of game.activeFires) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      const threat = f.threat ? 0.6 : 1;
      if (d * threat < bd) { bd = d * threat; best = f; }
    }
    if (best) {
      const d = Math.hypot(best.x - p.x, best.z - p.z);
      if (d < 700) {
        const nb = fire.nearestBurning(p.x, p.z);
        t = nb ? { x: nb.x, z: nb.z, kind: 'fire' } : { x: best.x, z: best.z, kind: 'fire' };
      } else t = { x: best.x, z: best.z, kind: 'fire' };
    }
  } else if (p.tank < 1) {
    const w = nearestWaterPoint(world.waterPoints, p.x, p.z, 500);
    if (w) t = { x: w.point.x, z: w.point.z, kind: 'water' };
  }
  if (t) t.dist = Math.hypot(t.x - p.x, t.z - p.z);
  return t;
}
