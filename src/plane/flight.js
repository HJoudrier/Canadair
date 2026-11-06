// Modèle de vol arcade du Canadair : roulage, décollage, vol, écopage, largage, atterrissage.
// Module « pur » (aucun Three.js) pour être testable sous Node.
import { FLIGHT } from '../config.js';
import { clamp, approach, damp, dampAngle, wrapAngle, headingTo, lerp } from '../core/math.js';
import { terrainHeight, waterLevel } from '../world/terrain.js';
import { runwayLocal } from '../world/places.js';

export const GEAR = 2.4; // hauteur du centre de l'avion au-dessus du sol sur ses roues

export function emptyInput() {
  return {
    steer: 0, pitch: 0, throttle: 0, throttleSet: null,
    drop: false, dropPressed: false, camera: false, pause: false, go: false,
    recenter: false, override: false, active: false,
  };
}

export function createPlane(world, slot = 0) {
  const p = {
    slot,
    x: 0, y: 0, z: 0, heading: 0, gamma: 0, bank: 0, speed: 0, throttle: 0,
    onGround: true, started: false, canRefill: false, parked: true,
    tank: 0, dropping: false, dropOut: 0, scooping: false, wasScooping: false,
    alt: 0, overWater: false, crashT: 0, warn: null, assist: null,
    landingWanted: false, events: [], vx: 0, vy: 0, vz: 0,
    stats: { drops: 0, scoops: 0, liters: 0, crashes: 0, landings: 0 },
  };
  resetToRunway(p, world);
  return p;
}

export function resetToRunway(p, world) {
  const ap = world.airport;
  const s = ap.starts[p.slot % ap.starts.length];
  p.x = s.x; p.z = s.z;
  p.y = terrainHeight(world, s.x, s.z) + GEAR;
  p.heading = ap.heading;
  p.gamma = 0; p.bank = 0; p.speed = 0; p.throttle = 0;
  p.onGround = true; p.started = false; p.parked = true;
  p.dropping = false; p.dropOut = 0; p.scooping = false; p.crashT = 0;
  p.vx = p.vy = p.vz = 0;
}

function surfaceAt(world, x, z) {
  const t = terrainHeight(world, x, z);
  const l = waterLevel(world, x, z);
  const water = !Number.isNaN(l) && l >= t - 0.05;
  return { h: water ? l : t, water, terrain: t };
}

/** Avance l'avion de `dt` secondes. Les événements du pas sont dans `p.events`. */
export function updatePlane(p, input, dt, world, diff) {
  p.events.length = 0;
  p.warn = null;
  p.assist = null;
  if (p.crashT > 0) {
    p.crashT -= dt;
    if (p.crashT <= 0) { resetToRunway(p, world); p.events.push('respawn'); }
    return p;
  }
  if (input.throttleSet != null) p.throttle = clamp(input.throttleSet, 0, 1);
  else p.throttle = clamp(p.throttle + input.throttle * dt * 0.8, 0, 1);

  if (p.onGround) updateGround(p, input, dt, world, diff);
  else updateAir(p, input, dt, world, diff);

  updateTank(p, input, dt, diff);
  return p;
}

function runwayAxis(ap, heading) {
  return Math.abs(wrapAngle(heading - ap.heading)) < Math.PI / 2 ? ap.heading : wrapAngle(ap.heading + Math.PI);
}

function updateGround(p, input, dt, world, diff) {
  const ap = world.airport;
  const pitchIn = clamp(input.pitch, -1, 1);
  const axis = runwayAxis(ap, p.heading);
  p.heading = dampAngle(p.heading, axis, 3, dt);
  const wantGo = input.throttle > 0.1 || pitchIn > 0.3 || input.dropPressed || input.go
    || (input.throttleSet != null && input.throttleSet > 0.4);
  if (wantGo && !p.started) { p.started = true; p.events.push('roll'); }
  if (diff.autoThrottle) p.throttle = p.started ? 1 : 0;
  else if (wantGo && p.throttle < 0.85) p.throttle = Math.max(p.throttle, input.throttleSet ?? 0.85);

  const target = p.started ? p.throttle * FLIGHT.vCruise : 0;
  p.speed = approach(p.speed, target, target > p.speed ? FLIGHT.accelGround : FLIGHT.brake, dt);
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  p.x += fx * p.speed * dt;
  p.z += fz * p.speed * dt;
  // Recentrage doux sur l'axe de piste
  const loc = runwayLocal(ap, p.x, p.z);
  const k = Math.min(1, 1.5 * dt);
  p.x -= ap.lx * loc.v * k;
  p.z -= ap.lz * loc.v * k;
  p.y = terrainHeight(world, p.x, p.z) + GEAR;
  p.gamma = 0;
  p.bank = damp(p.bank, 0, 5, dt);
  p.alt = 0;
  p.overWater = false;
  p.vx = fx * p.speed; p.vz = fz * p.speed; p.vy = 0;

  p.parked = p.speed < 1.5;
  if (p.parked && p.canRefill && p.tank < 1) {
    p.tank = Math.min(1, p.tank + dt / 3);
    if (p.tank >= 1) p.events.push('tankFull');
  }

  const rotate = p.speed >= FLIGHT.vRotate && (pitchIn > 0.15 || (diff.autoThrottle && p.speed >= FLIGHT.vRotate + 3));
  const along = loc.u * (axis === ap.heading ? 1 : -1);
  const overrun = along > ap.length / 2 + 30;
  if (rotate || (overrun && p.speed > FLIGHT.vRotate * 0.7)) {
    p.onGround = false;
    p.gamma = 0.15;
    p.started = false;
    p.canRefill = false;
    p.climbOut = 7; // montée initiale automatique
    p.events.push('takeoff');
  } else if (overrun) {
    p.speed = 0;
    p.x -= Math.sin(p.heading) * (along - ap.length / 2 - 30);
    p.z += Math.cos(p.heading) * (along - ap.length / 2 - 30);
  }
}

function updateAir(p, input, dt, world, diff) {
  const ap = world.airport;
  let steer = clamp(input.steer, -1, 1);
  const pitchIn = clamp(input.pitch, -1, 1);
  const b = world.bounds;

  // Bords de la carte : demi-tour automatique
  const pad = 150;
  if (p.x < b.min + pad || p.x > b.max - pad || p.z < b.min + pad || p.z > b.max - pad) {
    const c = (b.min + b.max) / 2;
    const want = headingTo(c - p.x, c - p.z);
    steer = clamp(wrapAngle(want - p.heading) * 1.5, -1, 1);
    p.warn = 'bounds';
  }

  // Approche de la piste : pilote automatique d'atterrissage
  const axis = runwayAxis(ap, p.heading);
  const sgn = axis === ap.heading ? 1 : -1;
  const loc = runwayLocal(ap, p.x, p.z);
  const along = loc.u * sgn;
  const lat = loc.v * sgn;
  const aligned = Math.abs(wrapAngle(p.heading - axis)) < 0.5;
  const heightAboveRunway = p.y - ap.h;
  const inCorridor = aligned && Math.abs(lat) < 170 && along > -ap.length / 2 - 1700
    && along < ap.length / 2 - 200 && heightAboveRunway < 240;
  // On n'atterrit que si on le veut : fin de mission, ou manche poussé vers le bas dans l'axe
  if (inCorridor && pitchIn < -0.2) p.landingIntent = 4;
  if (!inCorridor) p.landingIntent = 0;
  if (p.landingIntent > 0) p.landingIntent -= dt * (pitchIn > 0.3 ? 4 : 0);
  const assist = inCorridor && pitchIn < 0.3 && (p.landingWanted || p.landingIntent > 0);

  let gammaTarget = pitchIn * FLIGHT.maxClimb;
  if (p.climbOut > 0) {
    p.climbOut -= dt;
    if (p.alt > 40) p.climbOut = 0;
    gammaTarget = Math.max(gammaTarget, 0.16);
  }
  if (assist && !(p.climbOut > 0)) {
    p.assist = 'landing';
    const corr = clamp(lat / 220, -0.45, 0.45);
    const desired = wrapAngle(axis - corr);
    steer = clamp(wrapAngle(desired - p.heading) * 2.5, -1, 1);
    const touchdown = -ap.length / 2 + 80;
    const dist = touchdown - along;
    const targetY = ap.h + GEAR + Math.max(0, dist) * 0.07;
    gammaTarget = clamp(-0.06 + (targetY - p.y) / 90, -0.22, 0.08);
  }

  // Inclinaison et virage
  p.bank = damp(p.bank, steer * diff.maxBank, 3, dt);
  p.heading = wrapAngle(p.heading + p.bank * diff.yawPerBank * dt);
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);

  // Sol et eau sous l'avion et devant
  const here = surfaceAt(world, p.x, p.z);
  p.alt = p.y - here.h;
  let landAhead = here.water ? -Infinity : here.terrain;
  let waterAhead = here.water;
  let waterSoon = here.water;
  const looks = diff.minClearance > 0 ? [0.8, 1.6, 2.6, 3.6, 5, 6.5] : [0.8, 1.6, 2.6, 3.6];
  let nearLand = landAhead;
  for (const t of looks) {
    const s = surfaceAt(world, p.x + fx * p.speed * t, p.z + fz * p.speed * t);
    if (!s.water) {
      landAhead = Math.max(landAhead, s.terrain);
      if (t <= 2.6) nearLand = Math.max(nearLand, s.terrain);
      if (t <= 0.8) waterAhead = false;
    } else if (t <= 3.6) {
      waterSoon = true;
    }
  }
  p.waterSoon = waterSoon;

  // Vitesse
  let vt;
  if (assist) vt = FLIGHT.vLanding;
  else if (diff.autoThrottle) vt = here.water && p.alt < 45 && p.tank < 1 ? FLIGHT.vScoop : FLIGHT.vCruise;
  else vt = lerp(FLIGHT.vMinAir, FLIGHT.vMax, p.throttle);
  p.speed = approach(p.speed, vt, FLIGHT.accelAir, dt) - Math.sin(p.gamma) * 9.81 * 0.3 * dt;
  p.speed = clamp(p.speed, FLIGHT.vMinAir * 0.9, FLIGHT.vMax + 8);

  const kids = diff.minClearance > 0;
  // Approche d'un plan d'eau avec un réservoir à remplir : on vole plus bas
  const scoopApproach = kids && p.tank < 1 && waterSoon && !p.dropping;
  // Maintien d'altitude (Petit pilote) : sans action, l'avion revient vers ~90 m du sol
  if (!assist && kids && Math.abs(pitchIn) < 0.15 && !(p.climbOut > 0)) {
    const ref = scoopApproach ? Math.max(here.h, nearLand) : Math.max(here.h, landAhead);
    const holdAlt = scoopApproach ? 20 : 90;
    gammaTarget = clamp((ref + holdAlt - p.y) / 70, -0.3, 0.2);
  }
  // Aide à l'écopage (Petit pilote) : au-dessus de l'eau, on descend tout seul au ras de l'eau
  const shoreSafe = nearLand < here.h + 6;
  if (!assist && kids && here.water && waterAhead && shoreSafe && p.alt < 130 && p.tank < 1 && pitchIn < 0.3 && !p.dropping) {
    gammaTarget = clamp((4 - p.alt) / 22, -0.4, 0.15);
    p.assist = 'scoop';
  }
  // Remontée automatique (Petit pilote)
  if (!assist && kids && landAhead > -Infinity) {
    const need = scoopApproach ? nearLand + 12 : landAhead + diff.minClearance;
    if (p.y < need) {
      gammaTarget = Math.max(gammaTarget, clamp((need - p.y) / 30, 0.08, 0.55));
      if (p.y < need - 10) p.warn = 'pullUp';
    }
  }
  if (!assist && diff.canCrash && landAhead > -Infinity && p.y - landAhead < 20 && p.gamma < 0.05) p.warn = 'terrain';

  p.gamma = damp(p.gamma, gammaTarget, 2.2, dt);
  const hs = p.speed * Math.cos(p.gamma);
  p.vx = fx * hs; p.vz = fz * hs; p.vy = p.speed * Math.sin(p.gamma);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.y += p.vy * dt;
  if (p.y > FLIGHT.ceiling) { p.y = FLIGHT.ceiling; p.gamma = Math.min(p.gamma, 0); }

  // Contact avec le sol ou l'eau
  const now = surfaceAt(world, p.x, p.z);
  p.overWater = now.water;
  if (now.water) {
    const floor = now.h + 1.3;
    if (p.y < floor) { p.y = floor; p.gamma = Math.max(p.gamma, 0); }
  } else if (p.y < now.terrain + GEAR) {
    const L = runwayLocal(ap, p.x, p.z);
    const onRunway = Math.abs(L.u) < ap.length / 2 + 20 && Math.abs(L.v) < ap.width / 2 + 25;
    if (onRunway && aligned && p.speed < FLIGHT.vLanding + 14 && !(p.climbOut > 0)) {
      p.onGround = true;
      p.y = now.terrain + GEAR;
      p.gamma = 0;
      p.canRefill = true;
      p.started = false;
      p.speed = Math.min(p.speed, FLIGHT.vLanding);
      p.dropping = false;
      p.stats.landings++;
      p.events.push('landed');
    } else if (diff.canCrash) {
      p.crashT = 2.5;
      p.speed = 0;
      p.dropping = false;
      p.stats.crashes++;
      p.events.push('crash');
    } else {
      p.y = now.terrain + GEAR + 0.5;
      p.gamma = Math.max(p.gamma, 0.25);
      if (!(p.bumpT > 0)) p.events.push('bump');
      p.bumpT = 1;
    }
  }
  p.alt = p.y - now.h;
  if (p.bumpT > 0) p.bumpT -= dt;
}

function updateTank(p, input, dt, diff) {
  const canScoop = !p.onGround && p.crashT <= 0 && p.overWater && p.alt < diff.scoopMaxAlt
    && p.speed <= diff.scoopSpeedMax && !p.dropping;
  p.scooping = canScoop && p.tank < 1;
  if (p.scooping) {
    if (!p.wasScooping) { p.events.push('scoopStart'); p.stats.scoops++; }
    p.tank = Math.min(1, p.tank + dt / diff.scoopTime);
    if (p.tank >= 1) p.events.push('tankFull');
  } else if (p.wasScooping) {
    p.events.push('scoopEnd');
  }
  p.wasScooping = p.scooping;

  if (input.dropPressed && !p.dropping) {
    if (p.onGround || p.crashT > 0) {
      // rien
    } else if (p.tank > 0.03) {
      p.dropping = true;
      p.stats.drops++;
      p.events.push('dropStart');
    } else {
      p.events.push('tankEmpty');
    }
  }
  if (p.dropping) {
    if (diff.holdToDrop && !input.drop) {
      p.dropping = false;
      p.events.push('dropEnd');
    } else {
      const a = Math.min(p.tank, dt / FLIGHT.dropTime);
      p.tank -= a;
      p.dropOut += a;
      p.stats.liters += a * FLIGHT.tankLiters;
      if (p.tank <= 0.001) {
        p.tank = 0;
        p.dropping = false;
        p.events.push('dropEnd');
      }
    }
  }
}
