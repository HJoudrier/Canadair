// Réglages globaux du jeu et des deux niveaux de difficulté.

export const WORLD = {
  cells: 256,          // nombre de cellules par côté (257 sommets)
  cell: 24,            // taille d'une cellule en mètres
  get size() { return this.cells * this.cell; }, // 6144 m
  margin: 760,         // bordure décorative hors zone de jeu
  seaLevel: 0,
};

export const FLIGHT = {
  vRotate: 30,        // vitesse de décollage (m/s)
  vMinAir: 30,
  vCruise: 52,
  vMax: 74,
  vScoop: 40,
  vLanding: 42,
  accelGround: 9,
  accelAir: 7,
  brake: 14,
  maxClimb: 0.32,     // pente max (rad)
  ceiling: 950,
  tankLiters: 6000,
  dropTime: 1.8,      // durée pour vider le réservoir
  scoopAltMin: 0.5,
  planeHalfLength: 10,
};

export const DIFFICULTY = {
  easy: {
    id: 'easy',
    autoThrottle: true,
    canCrash: false,
    minClearance: 32,     // remontée automatique au-dessus du sol
    maxBank: 0.6,
    yawPerBank: 0.62,
    scoopTime: 3.2,
    scoopMaxAlt: 14,
    scoopSpeedMax: 99,    // pas de limite de vitesse pour écoper
    dropRadius: 46,
    dropPower: 1.5,
    dropMagnet: 90,       // l'eau est « aimantée » vers les flammes proches
    holdToDrop: false,    // un appui = tout le réservoir
    fireSpread: 0.045,
    fireGrowth: 0.15,
    incidentCap: 60,      // nombre max de cases en feu par incendie
    incidents: 3,
    maxConcurrent: 1,
    spawnInterval: [45, 65],
    windMax: 0.45,
    failBurnt: 1.0,       // jamais d'échec
    firstFireMaxDist: 2200,
  },
  hard: {
    id: 'hard',
    autoThrottle: false,
    canCrash: true,
    minClearance: 0,
    maxBank: 0.85,
    yawPerBank: 0.75,
    scoopTime: 4.5,
    scoopMaxAlt: 8,
    scoopSpeedMax: 58,
    dropRadius: 34,
    dropPower: 1.0,
    dropMagnet: 0,
    holdToDrop: true,     // on largue tant que le bouton est appuyé
    fireSpread: 0.11,
    fireGrowth: 0.25,
    incidentCap: 400,
    incidents: 5,
    maxConcurrent: 2,
    spawnInterval: [28, 42],
    windMax: 1.0,
    failBurnt: 0.14,      // part de forêt brûlée qui termine la mission
    firstFireMaxDist: 3200,
  },
};

export const FIRE = {
  tickRate: 5,          // mises à jour par seconde
  wetDecay: 1 / 90,     // l'humidité s'évapore en ~90 s
  burnRate: 0.035,      // consommation de combustible
};

export const CALLSIGNS = ['Pélican 1', 'Pélican 2'];
export const CALLSIGNS_EN = ['Pelican 1', 'Pelican 2'];
