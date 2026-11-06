// Gestion des langues (français / anglais).
import fr from './fr.js';
import en from './en.js';

const LANGS = { fr, en };
let current = fr;

export function detectLang() {
  const n = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase();
  return n.startsWith('fr') ? 'fr' : 'en';
}

export function setLang(code) { current = LANGS[code] || fr; return current; }
export function lang() { return current; }

/** Traduit une clé, en remplaçant les {variables}. */
export function t(key, vars = {}) {
  let s = current.strings[key] ?? fr.strings[key] ?? key;
  for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

/** Nom d'un lieu dans la langue courante. */
export function placeName(place) {
  return place ? (place.name[current.lang] || place.name.fr) : '';
}

export function callsign(slot) {
  return current.lang === 'fr' ? `Pélican ${slot + 1}` : `Pelican ${slot + 1}`;
}
