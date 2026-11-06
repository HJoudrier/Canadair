// Radio de la base : file de messages, grésillement, voix de synthèse et sous-titres.
import { lang } from '../i18n/index.js';

export class Radio {
  constructor(sfx, onShow) {
    this.sfx = sfx;
    this.onShow = onShow; // (text|null) => void
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.voiceOn = true;
    this.recent = new Map();
    this.voices = [];
    this.loadVoices();
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.addEventListener) {
      speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
    }
  }

  loadVoices() {
    if (typeof speechSynthesis === 'undefined') return;
    this.voices = speechSynthesis.getVoices();
  }

  pickVoice() {
    const code = lang().voice;
    const base = code.slice(0, 2);
    const list = this.voices.filter((v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(base));
    return list.find((v) => v.lang.replace('_', '-') === code && /google|natural|online/i.test(v.name))
      || list.find((v) => v.lang.replace('_', '-') === code)
      || list[0] || null;
  }

  /**
   * Ajoute un message.
   * @param opts.priority 2 = urgent (passe devant), 1 = normal, 0 = info
   * @param opts.key      identifiant pour éviter les répétitions
   * @param opts.cooldown secondes avant de pouvoir répéter la même clé
   */
  say(text, { priority = 1, key = null, cooldown = 20 } = {}) {
    const now = performance.now() / 1000;
    if (key) {
      const last = this.recent.get(key);
      if (last !== undefined && now - last < cooldown) return false;
      this.recent.set(key, now);
      if (this.queue.some((m) => m.key === key)) return false;
    }
    const msg = { text, priority, key };
    if (priority >= 2) {
      const i = this.queue.findIndex((m) => m.priority < 2);
      if (i < 0) this.queue.push(msg); else this.queue.splice(i, 0, msg);
    } else this.queue.push(msg);
    // On évite une file trop longue : on oublie les infos les moins importantes
    while (this.queue.length > 4) {
      const j = this.queue.findIndex((m) => m.priority === 0);
      this.queue.splice(j >= 0 ? j : this.queue.length - 1, 1);
    }
    return true;
  }

  update(dt) {
    if (this.current) {
      this.timer -= dt;
      if (this.current.done && this.timer <= 0) {
        this.current = null;
        this.onShow(null);
      } else if (!this.current.done && this.timer <= -(this.current.maxTime || 8)) {
        this.finish();
      }
      return;
    }
    if (!this.queue.length) return;
    const msg = this.queue.shift();
    this.current = msg;
    this.sfx.radioOn();
    this.onShow(msg.text);
    const fallback = 1.4 + msg.text.length * 0.065;
    this.timer = 0.35;
    const speak = this.voiceOn && typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
    if (speak) {
      try {
        const u = new SpeechSynthesisUtterance(msg.text);
        const v = this.pickVoice();
        if (v) u.voice = v;
        u.lang = lang().voice;
        u.rate = 1.05;
        u.pitch = 1.0;
        u.onend = () => this.finish();
        u.onerror = () => this.finish();
        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(u), 300);
        msg.maxTime = fallback + 4;
        return;
      } catch (_) { /* pas de voix : sous-titres seuls */ }
    }
    msg.maxTime = 0;
    msg.done = true;
    this.timer = fallback;
    setTimeout(() => this.sfx.radioOff(), fallback * 1000);
  }

  finish() {
    if (!this.current || this.current.done) return;
    this.current.done = true;
    this.timer = 1.2;
    this.sfx.radioOff();
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.onShow(null);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}
