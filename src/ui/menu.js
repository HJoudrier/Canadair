// Écrans de menu navigables à la souris, au doigt, au clavier et à la manette (Xbox : pas de souris).
import { t } from '../i18n/index.js';

export function translateDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

export class Menu {
  constructor(sfx) {
    this.sfx = sfx;
    this.current = null;
    this.backActions = {};
    this.screens = new Map();
    for (const el of document.querySelectorAll('.screen')) this.screens.set(el.id.replace('screen-', ''), el);
  }

  show(name) {
    for (const [k, el] of this.screens) el.classList.toggle('active', k === name);
    this.current = name;
    document.body.classList.toggle('in-menu', !!name);
    if (name) setTimeout(() => this.focusFirst(), 30);
  }

  hide() { this.show(null); }

  el(name) { return this.screens.get(name); }

  focusables() {
    const s = this.current && this.screens.get(this.current);
    if (!s) return [];
    return Array.from(s.querySelectorAll('button:not([disabled]), [tabindex="0"]'))
      .filter((b) => b.offsetParent !== null && !b.classList.contains('hidden'));
  }

  focusFirst() {
    const f = this.focusables();
    const pref = f.find((b) => b.classList.contains('primary')) || f[0];
    if (pref) pref.focus({ preventScroll: true });
  }

  onBack(name, fn) { this.backActions[name] = fn; }

  /** Traite les événements de navigation ('up', 'down', 'left', 'right', 'ok', 'back'). */
  handle(events) {
    if (!this.current || !events.length) return;
    const f = this.focusables();
    if (!f.length) return;
    let i = f.indexOf(document.activeElement);
    for (const e of events) {
      if (e === 'up' || e === 'left') {
        const el = f[i];
        if (e === 'left' && el && el.dataset.cycle) { el.dispatchEvent(new CustomEvent('cycle', { detail: -1 })); continue; }
        i = i <= 0 ? f.length - 1 : i - 1;
        f[i].focus({ preventScroll: true });
        this.sfx.click();
      } else if (e === 'down' || e === 'right') {
        const el = f[i];
        if (e === 'right' && el && el.dataset.cycle) { el.dispatchEvent(new CustomEvent('cycle', { detail: 1 })); continue; }
        i = i < 0 || i >= f.length - 1 ? 0 : i + 1;
        f[i].focus({ preventScroll: true });
        this.sfx.click();
      } else if (e === 'ok') {
        if (i >= 0) f[i].click(); else this.focusFirst();
      } else if (e === 'back') {
        const fn = this.backActions[this.current];
        if (fn) fn();
      }
    }
  }
}
