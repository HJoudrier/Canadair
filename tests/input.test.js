import test from 'node:test';
import assert from 'node:assert/strict';
import { mixCopilot, finalize } from '../src/input/mix.js';
import { emptyInput } from '../src/plane/flight.js';
import { gravityInScreen, tiltAngles } from '../src/input/gyro.js';
import { de, a } from '../src/i18n/fr.js';
import { compass8 } from '../src/core/math.js';

const inp = (o) => Object.assign(emptyInput(), o);

test('avion commun : les commandes s’additionnent puis sont bornées', () => {
  const m = mixCopilot(inp({ steer: 1, pitch: 0.5 }), inp({ steer: -0.6, pitch: 1 }));
  assert.ok(Math.abs(m.steer - 0.4) < 1e-9);
  assert.equal(m.pitch, 1);
});

test('avion commun : LB donne la main au copilote', () => {
  const m = mixCopilot(inp({ steer: 1, dropPressed: true }), inp({ steer: -0.5, override: true }));
  assert.equal(m.steer, -0.5);
  assert.ok(m.override);
  assert.ok(m.dropPressed, "l'enfant peut toujours larguer");
});

test('finalize borne les axes', () => {
  const f = finalize(inp({ steer: 3, pitch: -2, throttle: 5 }));
  assert.deepEqual([f.steer, f.pitch, f.throttle], [1, -1, 1]);
});

test('gyroscope : téléphone droit en paysage = neutre, tourné à droite = virage à droite', () => {
  // Téléphone tenu en paysage (écran tourné de 90°), bien droit face à soi
  const neutral = tiltAngles(gravityInScreen(0, -90, 90));
  assert.ok(Math.abs(neutral.roll) < 1e-6);
  // Rotation horaire (comme un volant vers la droite)
  const right = tiltAngles(gravityInScreen(20, -90, 90));
  const left = tiltAngles(gravityInScreen(-20, -90, 90));
  assert.ok(Math.sign(right.roll) !== Math.sign(left.roll));
  assert.ok(Math.abs(Math.abs(right.roll) - (20 * Math.PI) / 180) < 0.05);
});

test('contractions françaises des noms de lieux', () => {
  assert.equal(de('Le Moulin'), 'du Moulin');
  assert.equal(de('Les Chênes'), 'des Chênes');
  assert.equal(de('Avignon'), "d'Avignon");
  assert.equal(de('Bellevue'), 'de Bellevue');
  assert.equal(a('Le Moulin'), 'au Moulin');
  assert.equal(a('Les Chênes'), 'aux Chênes');
});

test('rose des vents', () => {
  assert.equal(compass8(0, -1), 0); // nord
  assert.equal(compass8(1, 0), 2);  // est
  assert.equal(compass8(0, 1), 4);  // sud
  assert.equal(compass8(-1, -1), 7); // nord-ouest
});
