// Une partie : monde, feu, avions, caméras, effets, HUD, sons. Gère solo, écran partagé, avion commun et VR.
import * as THREE from 'three';
import { DIFFICULTY } from '../config.js';
import { generateWorld } from '../world/terrain.js';
import { WorldView } from '../world/worldMesh.js';
import { FireSim, CELL } from '../fire/fireSim.js';
import { FireView } from '../fire/fireView.js';
import { createPlane, updatePlane, emptyInput } from '../plane/flight.js';
import { DropSystem, predictImpact } from '../plane/drops.js';
import { createCanadair } from '../plane/model.js';
import { WaterView, createBlobShadow, updateBlobShadow, createImpactMarker } from '../plane/waterDrop.js';
import { createSky } from '../view/sky.js';
import { PlaneCamera } from '../view/cameras.js';
import { Arrow3D } from '../ui/arrow3d.js';
import { Hud } from '../ui/hud.js';
import { MinimapBase } from '../ui/minimap.js';
import { VrHud } from '../ui/vrHud.js';
import { Mission } from './mission.js';
import { chooseTarget } from './navigation.js';
import { finalize, mixCopilot } from '../input/mix.js';
import { t, lang, placeName } from '../i18n/index.js';
import { headingTo, wrapAngle, clamp, dampAngle, damp } from '../core/math.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Game {
  /**
   * @param o.renderer, o.sfx, o.radio, o.devices {keyboard, gamepads, touch, gyro, xr}
   * @param o.settings  réglages (arrows, invert…)
   * @param o.mode      'solo' | 'split' | 'shared' | 'vr'
   * @param o.controls  affectation des appareils : [{kind:'pad', slot}|{kind:'keyboard'}|{kind:'any'}]
   */
  constructor(o) {
    Object.assign(this, o);
    this.diff = DIFFICULTY[this.difficulty];
    this.time = 0;
    this.paused = false;
    this.goPressed = {};
    this.dropEvals = [];
    this.firesT = 0;
    this.activeFires = [];
    this.vr = this.mode === 'vr';
  }

  build() {
    this.world = generateWorld(this.seed);
    this.fire = new FireSim(this.world, this.diff, this.seed + 1);
    this.drops = new DropSystem(this.world, this.fire);
    const scene = (this.scene = new THREE.Scene());
    this.skyView = createSky(scene, this.world, this.quality);
    this.worldView = new WorldView(this.world, this.quality);
    scene.add(this.worldView.group);
    this.fireView = new FireView(scene, this.world, this.fire, this.quality);
    this.waterView = new WaterView(scene, this.world, this.quality);
    this.minimapBase = new MinimapBase(this.world);
    const n = this.mode === 'split' ? 2 : 1;
    this.players = [];
    for (let s = 0; s < n; s++) this.players.push(this.makePlayer(s));
    this.planes = this.players.map((p) => p.plane);
    if (this.vr) this.setupVR();
    this.mission = new Mission(this);
    this.layout();
    // Pour les tests automatisés
    window.__game = this;
    return this;
  }

  makePlayer(slot) {
    const plane = createPlane(this.world, slot);
    const model = createCanadair(slot);
    this.scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 9500);
    camera.layers.enable(3 + slot);
    const camCtl = new PlaneCamera(camera);
    const arrow = new Arrow3D(this.scene, 3 + slot);
    const shadow = createBlobShadow();
    this.scene.add(shadow);
    const marker = createImpactMarker();
    marker.traverse((o) => o.layers.set(3 + slot));
    marker.visible = false;
    this.scene.add(marker);
    const hud = new Hud(this.hudRoot, slot, this.minimapBase, (s) => { this.goPressed[s] = true; });
    const pan = this.mode === 'split' ? (slot ? 0.6 : -0.6) : 0;
    const engine = this.sfx.engine(pan);
    return { slot, plane, model, camera, camCtl, arrow, shadow, marker, hud, engine, target: null, targetT: 0, flash: null, flashT: 0, camYaw: plane.heading };
  }

  setupVR() {
    const pl = this.players[0];
    this.vrRig = new THREE.Group();
    this.vrRig.name = 'vr-rig';
    this.vrOffset = new THREE.Group();
    this.vrRig.add(this.vrOffset);
    this.vrOffset.add(pl.camera);
    this.scene.add(this.vrRig);
    pl.camCtl.mode = 'cockpit';
    pl.model.setCockpit(true);
    this.vrHud = new VrHud();
    this.vrHud.attach(pl.model.root, true);
    // Vignette de confort pendant les virages
    this.vignette = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 2.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    this.vignette.position.z = -0.6;
    this.vignette.renderOrder = 99;
    pl.camera.add(this.vignette);
    this.hudRoot.classList.add('hidden');
  }

  recenterVR() {
    const cam = this.players[0].camera;
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.vrOffset.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
    _v.copy(cam.position).applyQuaternion(this.vrOffset.quaternion).negate();
    this.vrOffset.position.copy(_v);
  }

  start() {
    this.mission.start();
  }

  layout() {
    if (this.players.length === 2) {
      this.players[0].hud.layout(0, 0, 50, 100);
      this.players[1].hud.layout(50, 0, 50, 100);
    } else this.players[0].hud.layout(0, 0, 100, 100);
  }

  // ---------- Entrées ----------
  readDevice(c, out) {
    const { keyboard, gamepads, touch, gyro, xr } = this.devices;
    const inv = this.settings.invert;
    if (c.kind === 'keyboard') keyboard.read(out, inv);
    else if (c.kind === 'pad') gamepads.read(c.slot, out, inv);
    else {
      keyboard.read(out, inv);
      for (let k = 0; k < gamepads.count; k++) gamepads.read(k, out, inv);
      touch.read(out, inv);
      gyro.read(out, inv);
      if (xr) xr.read(out, inv);
    }
    return out;
  }

  collectInputs() {
    const ctl = this.controls;
    if (this.mode === 'split') {
      return [0, 1].map((s) => finalize(this.readDevice(ctl[s] || { kind: 'any' }, emptyInput())));
    }
    if (this.mode === 'shared') {
      const pilot = finalize(this.readDevice(ctl[0] || { kind: 'any' }, emptyInput()));
      const copilot = ctl[1] ? finalize(this.readDevice(ctl[1], emptyInput())) : emptyInput();
      this.copilotOn = copilot.override;
      if (copilot.override && !this.copilotWas) this.radio.say(t('radio.copilot'), { key: 'copilot', cooldown: 30, priority: 0 });
      this.copilotWas = copilot.override;
      return [mixCopilot(pilot, copilot)];
    }
    const solo = finalize(this.readDevice({ kind: 'any' }, emptyInput()));
    if (this.autopilot) Object.assign(solo, this.autopilot(this, solo));
    return [solo];
  }

  rumble(slot, strong, weak, ms) {
    const c = this.controls[slot] || { kind: 'any' };
    const pads = this.devices.gamepads;
    if (c.kind === 'pad') pads.rumble(c.slot, strong, weak, ms);
    else if (c.kind === 'any') for (let k = 0; k < pads.count; k++) pads.rumble(k, strong, weak, ms);
    if (this.mode === 'shared' && this.controls[1] && this.controls[1].kind === 'pad') pads.rumble(this.controls[1].slot, strong, weak, ms);
    if (this.vr && this.devices.xr) this.devices.xr.pulse(Math.max(strong, weak), ms);
  }

  flash(pl, key, cls = 'ok', time = 2) { pl.flash = t(key); pl.flashCls = cls; pl.flashT = time; }

  // ---------- Événements ----------
  onPlaneEvent(pl, e) {
    const p = pl.plane;
    const kids = this.difficulty === 'easy';
    switch (e) {
      case 'roll': this.sfx.click(); break;
      case 'takeoff':
        this.radio.say(t('radio.takeoff'), { key: 'takeoff' + pl.slot, cooldown: 600, priority: 0 });
        if (p.tank < 1) this.radio.say(t(kids ? 'radio.fillTank' : 'radio.fillTankHard'), { key: 'fill', cooldown: 90 });
        break;
      case 'scoopStart': this.rumble(pl.slot, 0.2, 0.6, 300); break;
      case 'tankFull':
        this.sfx.tankFull();
        this.flash(pl, 'hud.tankFull', 'water');
        this.rumble(pl.slot, 0.1, 0.4, 150);
        if (this.fire.burningCount > 0) this.radio.say(t('radio.tankFull'), { key: 'tankFull', cooldown: 120 });
        if (!this.mission.tutorial.dropHint && this.fire.burningCount > 0) {
          this.mission.tutorial.dropHint = true;
          this.radio.say(t('radio.dropHint'), { key: 'dropHint', cooldown: 999, priority: 0 });
        }
        break;
      case 'dropStart':
        this.sfx.drop();
        this.rumble(pl.slot, 0.5, 0.8, 600);
        this.dropEvals.push({ slot: pl.slot, ext: this.drops.totalExtinguished, t: 5 });
        break;
      case 'tankEmpty': this.flash(pl, 'hud.tankEmpty', 'warn'); this.sfx.warning(); break;
      case 'landed':
        this.sfx.success();
        this.radio.say(t('radio.landed'), { key: 'landed' + pl.slot, cooldown: 30 });
        break;
      case 'crash':
        this.sfx.crash();
        this.waterView.crashPuff(p);
        this.rumble(pl.slot, 1, 1, 700);
        this.radio.say(t('radio.crash'), { key: 'crash', cooldown: 15, priority: 2 });
        break;
      case 'bump': this.sfx.bump(); this.rumble(pl.slot, 0.6, 0.3, 200); break;
      default: break;
    }
  }

  onFireEvents() {
    for (const e of this.fire.drainEvents()) {
      if (e.type === 'extinguished') this.mission.onExtinguished(e.id);
      if (e.type === 'building') {
        const b = this.world.buildings[e.index];
        const place = this.world.places[b.place];
        if (place) this.radio.say(t('radio.houseBurnt', { at: lang().at(placeName(place)) }), { key: 'house' + b.place, cooldown: 40 });
        this.worldView.burnBuilding(e.index);
      }
    }
    const changed = this.fire.drainChanged();
    if (changed.length) {
      this.worldView.applyFire(this.fire, changed, []);
      for (const c of changed) if (this.fire.state[c] === CELL.BURNT) this.minimapBase.markBurnt(c);
    }
  }

  // ---------- Boucle ----------
  frame(dt) {
    this.time += dt;
    const inputs = this.collectInputs();
    if (inputs.some((i) => i.pause)) { this.requestPause(); }
    if (this.vr && inputs[0].recenter) this.recenterVR();

    inputs.forEach((inp, i) => {
      const pl = this.players[i];
      if (this.goPressed[i]) { inp.go = true; }
      if (inp.camera && !this.vr) pl.camCtl.toggle();
      if (inp.camera && this.vr) this.toggleVRView();
      pl.model.setCockpit(pl.camCtl.mode === 'cockpit');
    });
    this.goPressed = {};

    // Simulation à petits pas (stable quel que soit le nombre d'images par seconde)
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      this.players.forEach((pl, i) => {
        const inp = inputs[i];
        updatePlane(pl.plane, inp, h, this.world, this.diff);
        for (const e of pl.plane.events) this.onPlaneEvent(pl, e);
        this.drops.emit(pl.plane, this.diff);
        inp.dropPressed = false; inp.go = false; inp.camera = false;
      });
      this.drops.update(h);
    }
    this.fire.update(dt);
    this.onFireEvents();
    this.firesT -= dt;
    if (this.firesT <= 0) { this.activeFires = this.fire.activeFires(); this.firesT = 0.4; }
    this.mission.update(dt);

    // Retour sur chaque largage
    for (const ev of this.dropEvals) {
      ev.t -= dt;
      if (ev.t <= 0) {
        const got = this.drops.totalExtinguished - ev.ext;
        if (got >= 2) this.radio.say(t('radio.goodDrop'), { key: 'goodDrop', cooldown: 25, priority: 0 });
        else {
          const p = this.planes[ev.slot];
          const nb = this.fire.nearestBurning(p.x, p.z);
          if (nb && nb.dist < 900) this.radio.say(t('radio.missDrop'), { key: 'missDrop', cooldown: 35, priority: 0 });
        }
      }
    }
    this.dropEvals = this.dropEvals.filter((e) => e.t > 0);

    this.updateViews(dt);
    this.updateAudio(dt);
  }

  toggleVRView() {
    const pl = this.players[0];
    pl.camCtl.mode = pl.camCtl.mode === 'cockpit' ? 'chase' : 'cockpit';
    this.vrHud.attach(pl.camCtl.mode === 'cockpit' ? pl.model.root : this.vrRig, pl.camCtl.mode === 'cockpit');
  }

  requestPause() { if (this.onPause) this.onPause(); }

  cameraPositions() {
    return this.players.map((pl) => pl.camera.getWorldPosition(new THREE.Vector3()));
  }

  updateViews(dt) {
    const camPos = this.cameraPositions();
    const fogFar = this.scene.fog.far;
    for (const pl of this.players) {
      const p = pl.plane;
      pl.model.update(p, dt, this.vr ? 0.3 : 1, this.vr ? 0.55 : 1);
      updateBlobShadow(pl.shadow, this.world, p);

      // Caméra
      if (this.vr) this.placeVRRig(pl, dt);
      else pl.camCtl.update(dt, p, pl.model, this.world);

      // Cible et flèche
      pl.targetT -= dt;
      if (pl.targetT <= 0) { pl.target = chooseTarget(p, this); pl.targetT = 0.4; }
      if (pl.target) pl.target.dist = Math.hypot(pl.target.x - p.x, pl.target.z - p.z);
      const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
      if (pl.camCtl.mode === 'cockpit') {
        pl.model.eye.getWorldPosition(_v);
        _v.x += fx * 26; _v.z += fz * 26; _v.y += 2.5;
      } else _v.set(p.x + fx * 34, p.y + 9, p.z + fz * 34);
      pl.arrow.update(dt, _v, p.heading, pl.target, this.settings.arrows && !p.onGround);

      // Viseur d'impact
      const wantMarker = !p.onGround && p.crashT <= 0 && p.tank > 0.04 && (p.dropping || (pl.target && pl.target.kind === 'fire' && pl.target.dist < 1100));
      pl.marker.visible = wantMarker;
      if (wantMarker) {
        const im = predictImpact(this.world, p);
        if (im) {
          const r = this.diff.dropRadius * 0.9;
          pl.marker.position.set(im.x, im.y + 0.8, im.z);
          pl.marker.scale.setScalar(r);
          pl.marker.rotation.y += dt;
        } else pl.marker.visible = false;
      }
      if (pl.flashT > 0) { pl.flashT -= dt; if (pl.flashT <= 0) pl.flash = null; }
      if (p.scooping) this.waterView.scoopSpray(p, dt);
    }
    this.fireView.update(dt, camPos);
    this.waterView.showParcels(this.drops.parcels);
    this.waterView.impacts(this.drops.drainImpacts());
    this.waterView.update(dt);
    this.worldView.update(dt, this.time, camPos, fogFar + 200);
    this.skyView.drift(dt);
    this.updateHud(dt);
  }

  placeVRRig(pl, dt) {
    const p = pl.plane;
    const rig = this.vrRig;
    if (pl.camCtl.mode === 'cockpit') {
      pl.model.root.updateMatrixWorld(true);
      pl.model.eye.getWorldPosition(rig.position);
      pl.model.root.getWorldQuaternion(rig.quaternion);
    } else {
      pl.camYaw = dampAngle(pl.camYaw, p.heading, 2.5, dt);
      const fx = Math.sin(pl.camYaw), fz = -Math.cos(pl.camYaw);
      rig.position.set(p.x - fx * 30, p.y + 6, p.z - fz * 30);
      rig.quaternion.setFromAxisAngle(_v.set(0, 1, 0), -pl.camYaw);
    }
    // Vignette proportionnelle à la vitesse de virage
    const yawRate = Math.abs(p.bank * this.diff.yawPerBank);
    this.vignette.material.opacity = damp(this.vignette.material.opacity, clamp((yawRate - 0.12) * 1.6, 0, 0.75), 6, dt);
  }

  updateHud(dt) {
    const fireCount = this.activeFires.length;
    const forestPct = Math.max(0, Math.round((1 - this.fire.forestBurntFraction) * 100));
    const dev = this.devices;
    const touchSolo = dev.touch.visible;
    for (const pl of this.players) {
      const p = pl.plane;
      let edge = null;
      if (pl.target && !this.vr) {
        const camYaw = pl.camCtl.mode === 'cockpit' ? p.heading : (pl.camCtl.yaw ?? p.heading);
        const rel = wrapAngle(headingTo(pl.target.x - p.x, pl.target.z - p.z) - camYaw);
        if (Math.abs(rel) > 0.75) edge = { x: rel > 0 ? 95 : 5, y: 50, angle: rel > 0 ? 0 : Math.PI };
      }
      const c = this.controls[pl.slot] || { kind: 'any' };
      let goHint = t('hud.goHint.key');
      if (this.vr) goHint = t('hud.goHint.vr');
      else if (c.kind === 'pad' || (c.kind === 'any' && dev.gamepads.count > 0)) goHint = t('hud.goHint.pad');
      const state = {
        game: this, plane: p, target: pl.target, fireCount, forestPct,
        scoopMaxAlt: this.diff.scoopMaxAlt, flash: pl.flash, flashCls: pl.flashCls,
        arrows: this.settings.arrows, edge, showGoButton: touchSolo, goHint,
        copilot: this.mode === 'shared' && this.copilotOn, lang: lang().lang,
      };
      if (!this.vr) pl.hud.update(dt, state);
      else {
        const tgRel = pl.target ? wrapAngle(headingTo(pl.target.x - p.x, pl.target.z - p.z) - p.heading) : 0;
        let warning = '';
        if (p.warn === 'pullUp') warning = t('hud.pullUp');
        else if (p.warn === 'bounds') warning = t('hud.bounds');
        else if (p.scooping) warning = t('hud.scooping');
        else if (p.onGround && !p.started) warning = goHint;
        this.vrHud.update(dt, { ...state, targetRel: tgRel, radio: this.radio.current ? this.radio.current.text : null, warning, paused: this.paused });
      }
    }
  }

  updateAudio(dt) {
    const sfx = this.sfx;
    let scoop = 0, crackle = 0, wind = 0;
    for (const pl of this.players) {
      const p = pl.plane;
      const thr = this.diff.autoThrottle ? (p.onGround ? (p.started ? 1 : 0.1) : 0.7) : p.throttle;
      if (pl.engine) pl.engine.update(thr, p.speed, p.crashT <= 0);
      if (p.scooping) scoop = 1;
      wind = Math.max(wind, p.onGround ? 0 : p.speed / 75);
    }
    const p0 = this.planes[0];
    const nb = this.fire.burningCount ? this.fire.nearestBurning(p0.x, p0.z) : null;
    if (nb) crackle = clamp(1 - Math.hypot(nb.dist, p0.alt) / 700, 0, 1);
    sfx.setScoop(scoop);
    sfx.setWind(wind);
    sfx.crackle(crackle, dt);
  }

  render() {
    const r = this.renderer;
    const scene = this.scene;
    if (r.xr.isPresenting) {
      const cam = this.players[0].camera;
      cam.getWorldPosition(_v);
      this.skyView.follow(_v);
      r.render(scene, cam);
      return;
    }
    const size = r.getSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    if (this.players.length === 2) {
      r.setScissorTest(true);
      this.players.forEach((pl, i) => {
        const x = i * Math.floor(W / 2);
        const w = i ? W - x : Math.floor(W / 2);
        r.setViewport(x, 0, w, H);
        r.setScissor(x, 0, w, H);
        pl.camera.aspect = w / H;
        pl.camera.updateProjectionMatrix();
        this.skyView.follow(pl.camera.position);
        r.render(scene, pl.camera);
      });
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    } else {
      const cam = this.players[0].camera;
      if (Math.abs(cam.aspect - W / H) > 0.001) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
      r.setViewport(0, 0, W, H);
      this.skyView.follow(cam.position);
      r.render(scene, cam);
    }
  }

  // ---------- Fin ----------
  onMissionEnd(win) {
    const fire = this.fire;
    const totalB = this.world.buildings.length;
    const housesSaved = totalB ? Math.round(((totalB - fire.buildingsBurnt) / totalB) * 100) : 100;
    const forest = Math.max(0, Math.round((1 - fire.forestBurntFraction) * 100));
    const landed = this.planes.every((p) => p.onGround);
    let stars = 0;
    if (win) {
      stars = 1;
      if (forest >= 95 && fire.buildingsBurnt === 0) stars++;
      if (landed) stars++;
    }
    const sum = (k) => this.planes.reduce((a, p) => a + p.stats[k], 0);
    const stats = {
      win, stars, forest, housesSaved, drops: sum('drops'), liters: Math.round(sum('liters') / 100) * 100,
      fires: this.mission.extinguished, time: Math.round(this.mission.time),
    };
    if (this.onEnd) this.onEnd(stats);
  }

  dispose() {
    for (const pl of this.players) { pl.hud.destroy(); }
    this.sfx.stopEngines();
    this.sfx.setScoop(0);
    this.sfx.setWind(0);
    this.radio.clear();
    this.hudRoot.classList.remove('hidden');
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    this.renderer.renderLists.dispose();
    if (window.__game === this) window.__game = null;
  }
}
