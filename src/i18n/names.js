// Générateur de noms de lieux (français et anglais) à partir d'un Rng.

const FR_BASE = [
  'Bellevue', 'Beauval', 'Valbonne', 'Fontclaire', 'Roquebelle', 'Montjoli', 'Clairefont',
  'Mirabel', 'Rochebrune', 'Bois-Joli', 'Pradelle', 'Castelvert', 'Lavandière', 'Malaval',
  'Bonnefont', 'Combelongue', 'Pierrefeu', 'Belcastel', 'Sauvebois', 'Vallon-Doré',
  'La Cigale', 'La Fontaine', 'La Bruyère', 'La Garrigue', 'La Pinède', 'La Clairière',
  'Le Moulin', 'Le Hérisson', 'Le Tilleul', 'Le Pré-Vert', 'Les Chênes', 'Les Myrtilles',
  'Les Hirondelles', 'Les Coquelicots', 'Les Écureuils', 'La Marjolaine', 'Le Romarin',
];
const FR_SAINTS = ['Pierre', 'Martin', 'Jean', 'Paul', 'Michel', 'Luc', 'Rémy', 'Georges', 'Félix', 'Hugo'];
const FR_SAINTES = ['Marie', 'Anne', 'Claire', 'Lucie', 'Agathe', 'Rose'];
const FR_SUFFIX = {
  sea: ['-sur-Mer', '-Plage', '-les-Flots'],
  lake: ['-du-Lac', '-les-Bains'],
  river: ['-sur-Rivière', '-le-Pont', '-les-Saules'],
  mountain: ['-le-Haut', '-les-Monts', '-la-Montagne'],
  forest: ['-les-Pins', '-la-Forêt', '-les-Bois'],
  none: ['', '', '-le-Vieux', '-les-Prés'],
};

const EN_A = ['Mill', 'Oak', 'Pine', 'Elm', 'Fox', 'Bright', 'Green', 'Stone', 'Maple', 'Ash', 'Willow',
  'Red', 'Fern', 'Bear', 'Clear', 'Hazel', 'Cedar', 'Rabbit', 'Sunny', 'Honey', 'Apple', 'Robin', 'Silver'];
const EN_B = ['brook', 'field', 'wood', 'ford', 'ton', 'dale', 'bury', 'ridge', 'hill', 'vale', 'stead', 'wick'];
const EN_CONTEXT = {
  sea: ['port', 'haven', ' Bay', ' Harbour'],
  lake: ['mere', 'water', ' Lake'],
  river: ['bridge', 'ford', ' Crossing'],
  mountain: [' Peak', 'crest', ' Heights'],
  forest: ['wood', 'grove', ' Forest'],
  none: EN_B,
};

export function makePlaceName(rng, context = 'none', used = new Set()) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let fr;
    const r = rng.float();
    if (r < 0.25) fr = 'Saint-' + rng.pick(FR_SAINTS);
    else if (r < 0.35) fr = 'Sainte-' + rng.pick(FR_SAINTES);
    else fr = rng.pick(FR_BASE);
    const sfx = rng.pick(FR_SUFFIX[context] || FR_SUFFIX.none);
    if (!fr.includes(' ') || rng.chance(0.3)) fr += sfx;

    const a = rng.pick(EN_A);
    let en;
    if (rng.chance(0.6)) en = a + rng.pick(EN_CONTEXT[context] || EN_B);
    else en = a + rng.pick(EN_B);
    en = en.charAt(0).toUpperCase() + en.slice(1);
    if (!used.has(fr) && !used.has(en)) {
      used.add(fr); used.add(en);
      return { fr, en };
    }
  }
  const n = used.size;
  return { fr: 'Village ' + n, en: 'Village ' + n };
}
