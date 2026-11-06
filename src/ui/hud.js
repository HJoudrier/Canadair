// Tableau de bord à l'écran (un par joueur) : réservoir, feux, forêt, mini-carte, alertes.
import { t } from '../i18n/index.js';
import { Minimap } from './minimap.js';
import { TARGET_COLORS } from './arrow3d.js';

const ICON = { fire: '🔥', water: '💧', base: '🏠' };
const hex = (h) => '#' + h.toString(16).padStart(6, '0');

export class Hud {
  constructor(root, slot, minimapBase, onGo) {
    this.slot = slot;
    const el = document.createElement('div');
    el.className = 'hud-player';
    el.dataset.slot = slot;
    el.innerHTML = `
      <div class="hud-tank"><div class="tank-body"><div class="tank-water"></div><div class="tank-waves"></div></div><div class="tank-label">💧 <span class="lbl-water"></span></div></div>
      <div class="hud-top">
        <div class="pill fires">🔥 <b class="n-fires">0</b></div>
        <div class="pill forest">🌲 <b class="n-forest">100%</b></div>
      </div>
      <canvas class="minimap"></canvas>
      <div class="hud-alt hidden"><div class="alt-band"></div><div class="alt-water"></div><div class="alt-plane">✈</div></div>
      <div class="hud-target hidden"><span class="tg-icon"></span><span class="tg-dist"></span></div>
      <div class="hud-msg hidden"></div>
      <div class="hud-stats"><span class="spd"></span><span class="alt"></span></div>
      <button class="hud-go hidden">✈ <span></span></button>
      <div class="hud-gohint hidden"></div>
      <div class="hud-copilot hidden"></div>
      <div class="edge-ind hidden"></div>`;
    root.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.water = this.q('.tank-water');
    this.fires = this.q('.n-fires');
    this.forest = this.q('.n-forest');
    this.msg = this.q('.hud-msg');
    this.alt = this.q('.hud-alt');
    this.altPlane = this.q('.alt-plane');
    this.altBand = this.q('.alt-band');
    this.target = this.q('.hud-target');
    this.go = this.q('.hud-go');
    this.goHint = this.q('.hud-gohint');
    this.copilot = this.q('.hud-copilot');
    this.edge = this.q('.edge-ind');
    this.spd = this.q('.spd');
    this.altTxt = this.q('.alt');
    this.minimap = new Minimap(this.q('.minimap'), minimapBase);
    this.go.addEventListener('click', (e) => { e.preventDefault(); onGo(slot); });
    this.go.addEventListener('pointerdown', (e) => { e.preventDefault(); onGo(slot); });
    this.mapT = 0;
    this.last = {};
    this.relabel();
  }

  relabel() {
    this.q('.lbl-water').textContent = t('hud.water');
    this.go.querySelector('span').textContent = t('hud.go');
  }

  layout(x, y, w, h) {
    Object.assign(this.el.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
    this.el.classList.toggle('narrow', w < 60);
  }

  set(el, key, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  show(el, key, on) {
    if (this.last[key] === on) return;
    this.last[key] = on;
    el.classList.toggle('hidden', !on);
  }

  update(dt, s) {
    const p = s.plane;
    this.water.style.height = Math.round(p.tank * 100) + '%';
    this.el.classList.toggle('scooping', p.scooping);
    this.el.classList.toggle('dropping', p.dropping);
    this.set(this.fires, 'fires', String(s.fireCount));
    this.set(this.forest, 'forest', s.forestPct + '%');
    this.set(this.spd, 'spd', `${Math.round(p.speed * 3.6)} km/h`);
    this.set(this.altTxt, 'alt', `${t('hud.alt')} ${Math.max(0, Math.round(p.alt))} m`);

    // Message principal
    let msg = '', cls = '';
    if (p.crashT > 0) { msg = t('hud.crash'); cls = 'bad'; }
    else if (p.warn === 'pullUp') { msg = t('hud.pullUp'); cls = 'bad'; }
    else if (p.warn === 'terrain') { msg = t('hud.terrain'); cls = 'bad'; }
    else if (p.warn === 'bounds') { msg = t('hud.bounds'); cls = 'warn'; }
    else if (p.scooping) { msg = t('hud.scooping'); cls = 'water'; }
    else if (p.assist === 'landing') { msg = t('hud.landing'); cls = 'ok'; }
    else if (p.onGround && p.canRefill && p.parked && p.tank < 1) { msg = t('hud.refill'); cls = 'water'; }
    else if (s.flash) { msg = s.flash; cls = s.flashCls || 'ok'; }
    else if (!p.onGround && p.tank < 1 && p.waterSoon && p.alt > s.scoopMaxAlt && !p.dropping) { msg = t('hud.scoopLow'); cls = 'water'; }
    this.show(this.msg, 'msgShow', !!msg);
    this.set(this.msg, 'msg', msg);
    if (this.last.msgCls !== cls) { this.msg.className = 'hud-msg ' + cls + (msg ? '' : ' hidden'); this.last.msgCls = cls; }

    // Jauge d'altitude pour écoper
    const showAlt = !p.onGround && p.tank < 1 && (p.overWater || p.waterSoon) && p.alt < 150;
    this.show(this.alt, 'alt', showAlt);
    if (showAlt) {
      const scale = 120;
      this.altPlane.style.bottom = Math.min(100, (Math.max(0, p.alt) / scale) * 100) + '%';
      this.altBand.style.height = (s.scoopMaxAlt / scale) * 100 + '%';
      this.alt.classList.toggle('good', p.alt < s.scoopMaxAlt);
    }

    // Cible (icône + distance)
    const tg = s.target;
    this.show(this.target, 'tg', !!tg && s.arrows);
    if (tg && s.arrows) {
      this.set(this.q('.tg-icon'), 'tgi', ICON[tg.kind]);
      const d = tg.dist >= 1000 ? (tg.dist / 1000).toFixed(1).replace('.', s.lang === 'fr' ? ',' : '.') + ' ' + t('hud.km') : Math.round(tg.dist / 10) * 10 + ' ' + t('hud.m');
      this.set(this.q('.tg-dist'), 'tgd', d);
      this.target.style.borderColor = hex(TARGET_COLORS[tg.kind]);
    }
    // Indicateur au bord de l'écran quand la cible est derrière
    if (tg && s.arrows && s.edge) {
      this.show(this.edge, 'edge', true);
      this.edge.style.left = s.edge.x + '%';
      this.edge.style.top = s.edge.y + '%';
      this.edge.style.transform = `translate(-50%,-50%) rotate(${s.edge.angle}rad)`;
      this.edge.style.color = hex(TARGET_COLORS[tg.kind]);
      this.set(this.edge, 'edgeTxt', '➤');
    } else this.show(this.edge, 'edge', false);

    // Décollage
    const waiting = p.onGround && !p.started && p.speed < 1;
    this.show(this.go, 'go', waiting && s.showGoButton);
    this.show(this.goHint, 'goh', waiting && !s.showGoButton);
    if (waiting) this.set(this.goHint, 'gohTxt', s.goHint);

    this.show(this.copilot, 'cop', !!s.copilot);
    if (s.copilot) this.set(this.copilot, 'copTxt', '🧑‍✈️ ' + t('hud.copilot'));

    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.12; this.minimap.draw(s.game, this.slot, tg && s.arrows ? tg : null); }
  }

  destroy() { this.el.remove(); }
}
