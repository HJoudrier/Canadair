// Types de terrain et leurs propriétés (couleur cartoon, combustible).

export const B = {
  SEA: 0,
  BEACH: 1,
  GRASS: 2,
  FOREST: 3,
  PINE: 4,
  FIELD: 5,
  ROCK: 6,
  SNOW: 7,
  TOWN: 8,
  AIRFIELD: 9,
  LAKE: 10,
  RIVER: 11,
};

export const WATER = { NONE: 0, SEA: 1, LAKE: 2, RIVER: 3 };

// Combustible de chaque type (0 = ne brûle pas)
export const FUEL = new Float32Array(16);
FUEL[B.GRASS] = 0.35;
FUEL[B.FOREST] = 1.0;
FUEL[B.PINE] = 1.0;
FUEL[B.FIELD] = 0.45;
FUEL[B.TOWN] = 0.25;
FUEL[B.AIRFIELD] = 0.1;

// Couleurs cartoon (RGB 0-1)
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const COLORS = {
  [B.SEA]: hex(0x2f9fd8),
  [B.BEACH]: hex(0xf2dc8f),
  [B.GRASS]: hex(0x8fd14f),
  [B.FOREST]: hex(0x4fa83a),
  [B.PINE]: hex(0x3d8f4a),
  [B.FIELD]: hex(0xe8c95a),
  [B.ROCK]: hex(0x9a8f86),
  [B.SNOW]: hex(0xf6f9ff),
  [B.TOWN]: hex(0xc9d97e),
  [B.AIRFIELD]: hex(0xa6dc6a),
  [B.LAKE]: hex(0x7f8f5a),
  [B.RIVER]: hex(0x7f8f5a),
};
export const BURNT_COLOR = hex(0x3b3633);
export const SCORCHED_COLOR = hex(0x6b5a45);
export const FIELD_ALT_COLOR = hex(0xb5d957);
