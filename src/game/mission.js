// Déroulement d'une mission : départs de feu, vent, alertes radio, fin de partie.
import { Rng } from '../core/rng.js';
import { compass8, TAU } from '../core/math.js';
import { t, lang, placeName, callsign } from '../i18n/index.js';
import { inBounds } from '../world/terrain.js';
import { de } from '../i18n/fr.js';

export class Mission {
  constructor(game) {
    this.game = game;
    this.diff = game.diff;
    this.rng = new Rng(game.seed * 13 + 5);
    this.type = game.missionType; // 'mission' | 'free'
    this.time = 0;
    this.spawned = 0;
    this.nextSpawn = 0;
    this.complete = false;
    this.failed = false;
    this.ended = false;
    this.endTimer = 0;
    this.extinguished = 0;
    this.threatT = 0;
    this.warned = new Set();
    this.windT = 0;
    this.tutorial = { tankHint: false, dropHint: false, firstDrop: false };
  }

  start() {
    const { fire, worldView } = this.game;
    const ang = this.rng.range(0, TAU);
    const speed = this.rng.range(0.4, 1) * this.diff.windMax;
    fire.setWind(ang, speed);
    worldView.setWind(ang);
    this.windT = this.rng.range(120, 200);
    const cs = this.game.players.length > 1 ? (lang().lang === 'fr' ? 'Pélicans' : 'Pelicans') : callsign(0);
    this.say(t('radio.welcome', { cs }), { key: 'welcome' });
    this.spawnFire(true);
    this.say(t('radio.takeoffHint'), { key: 'takeoffHint', priority: 0 });
    this.nextSpawn = this.rng.range(...this.diff.spawnInterval);
  }

  say(text, opts) { this.game.radio.say(text, opts); }

  nearestPlace(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.game.world.places) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return { place: best, dist: bd };
  }

  /** Décrit un lieu par rapport au village le plus proche (« au nord-est de … »). */
  describe(x, z) {
    const { place, dist } = this.nearestPlace(x, z);
    if (!place) return '';
    const name = placeName(place);
    if (dist < place.r * 1.2) return lang().near(name);
    return lang().dirOf(compass8(x - place.x, z - place.z), name);
  }

  spawnFire(first = false) {
    const { world, fire } = this.game;
    const ap = world.airport;
    const actives = fire.activeFires();
    const nearVillage = !first && this.rng.chance(0.5) && world.places.length > 0;
    const village = nearVillage ? this.rng.pick(world.places) : null;
    let spot = null;
    for (let a = 0; a < 3000 && !spot; a++) {
      const c = this.rng.int(0, fire.N * fire.N - 1);
      if (fire.fuel0[c] < 0.9 || fire.state[c] !== 1) continue;
      const p = fire.cellCenter(c);
      if (!inBounds(world, p.x, p.z, 350)) continue;
      const dAp = Math.hypot(p.x - ap.x, p.z - ap.z);
      if (dAp < 900) continue;
      if (first && dAp > this.diff.firstFireMaxDist) continue;
      if (actives.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 700)) continue;
      if (village) {
        const dv = Math.hypot(p.x - village.x, p.z - village.z);
        if (dv < village.r + 220 || dv > village.r + 700) continue;
      }
      // Assez de forêt autour pour que le feu se voie
      let around = 0;
      const i = c % fire.N, j = (c - i) / fire.N;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const n = (j + dj) * fire.N + (i + di);
        if (n >= 0 && n < fire.N * fire.N && fire.fuel0[n] >= 0.9) around++;
      }
      if (around < 14) continue;
      spot = p;
    }
    if (!spot) return null;
    const { place } = this.nearestPlace(spot.x, spot.z);
    const inc = fire.ignite(spot.x, spot.z, 1, { time: this.time, place: place ? place.id : -1 });
    inc.where = { x: spot.x, z: spot.z };
    this.spawned++;
    const cs = this.game.players.length > 1 ? (lang().lang === 'fr' ? 'Pélicans' : 'Pelicans') : callsign(0);
    this.game.sfx.siren(2);
    this.say(t('radio.fireAlert', { where: this.describe(spot.x, spot.z), cs }), { priority: first ? 1 : 2 });
    if (first) this.say(t('radio.wind', { wind: lang().windTo(compass8(fire.wind.x, fire.wind.z)) }), { priority: 0, key: 'wind' });
    return inc;
  }

  onExtinguished(id) {
    const inc = this.game.fire.incidents.get(id);
    if (!inc || inc.total === 0) return;
    this.extinguished++;
    this.game.sfx.success();
    const place = this.game.world.places[inc.place];
    const near = place ? lang().near(placeName(place)) : '';
    this.say(t('radio.extinguished', { near }), { priority: 2 });
    // Le prochain feu arrive un peu plus vite si plus rien ne brûle
    if (this.game.fire.burningCount === 0) this.nextSpawn = Math.min(this.nextSpawn, this.time + 10);
  }

  checkThreats() {
    const { world } = this.game;
    for (const f of this.game.activeFires) {
      f.threat = false;
      for (const p of world.places) {
        const d = Math.hypot(f.x - p.x, f.z - p.z) - Math.sqrt(f.size) * 12;
        if (d < p.r + 260) {
          f.threat = true;
          const key = f.id + ':' + p.id;
          if (!this.warned.has(key)) {
            this.warned.add(key);
            const name = placeName(p);
            this.say(t('radio.villageThreat', { place: name, ofPlace: de(name) }), { priority: 2 });
          }
        }
      }
    }
  }

  update(dt) {
    if (this.ended) return;
    this.time += dt;
    const { fire } = this.game;
    const active = this.game.activeFires.length;
    const more = this.type === 'free' || this.spawned < this.diff.incidents;
    if (!this.complete && more && active < this.diff.maxConcurrent && this.time >= this.nextSpawn) {
      if (this.spawnFire()) this.nextSpawn = this.time + this.rng.range(...this.diff.spawnInterval);
      else this.nextSpawn = this.time + 5;
    }
    if (more && active === 0 && this.nextSpawn > this.time + 12) this.nextSpawn = this.time + 12;

    this.threatT -= dt;
    if (this.threatT <= 0) { this.threatT = 2; this.checkThreats(); }

    // Le vent tourne de temps en temps
    this.windT -= dt;
    if (this.windT <= 0) {
      this.windT = this.rng.range(140, 220);
      const ang = (fire.wind.angle ?? 0) + this.rng.range(-1.2, 1.2);
      fire.setWind(ang, this.rng.range(0.4, 1) * this.diff.windMax);
      this.game.worldView.setWind(ang);
      if (fire.burningCount > 0) this.say(t('radio.wind', { wind: lang().windTo(compass8(fire.wind.x, fire.wind.z)) }), { priority: 0, key: 'wind', cooldown: 60 });
    }

    if (this.type === 'mission' && !this.complete && this.spawned >= this.diff.incidents && fire.burningCount === 0) {
      this.complete = true;
      this.game.sfx.fanfare();
      this.say(t('radio.allOut'), { priority: 2 });
      for (const pl of this.game.players) pl.plane.landingWanted = true;
      this.endTimer = 60;
    }
    if (this.complete) {
      this.endTimer -= dt;
      const allDown = this.game.planes.every((p) => p.onGround && p.parked);
      if (allDown || this.endTimer <= 0) this.finish(true);
    }
    if (!this.complete && fire.forestBurntFraction > this.diff.failBurnt) {
      this.failed = true;
      this.game.sfx.sad();
      this.say(t('radio.failed'), { priority: 2 });
      this.endTimer = 6;
      this.complete = true;
      this.finishLater = true;
    }
  }

  finish(win) {
    if (this.ended) return;
    this.ended = true;
    this.game.onMissionEnd(win && !this.failed);
  }
}

