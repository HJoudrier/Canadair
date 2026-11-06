// Générateur pseudo-aléatoire à graine (mulberry32) : même graine = même carte.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mélange un entier (finaliseur de MurmurHash3) pour décorréler les graines proches. */
export function mixSeed(n) {
  let h = n >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(mixSeed(this.seed + 0x9e3779b9));
  }
  float() { return this.next(); }
  range(min, max) { return min + (max - min) * this.next(); }
  int(min, maxInclusive) { return min + Math.floor(this.next() * (maxInclusive - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  /** Sous-générateur indépendant (pour ne pas décaler la séquence principale). */
  fork(label) { return new Rng(hashString(label) ^ Math.floor(this.next() * 4294967296)); }
}

export function randomSeed() {
  return Math.floor(Math.random() * 900000) + 100000;
}
