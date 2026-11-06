// Combinaison des entrées de plusieurs appareils.
import { clamp } from '../core/math.js';
import { emptyInput } from '../plane/flight.js';

/** Borne les axes après addition de plusieurs appareils pour un même joueur. */
export function finalize(inp) {
  inp.steer = clamp(inp.steer, -1, 1);
  inp.pitch = clamp(inp.pitch, -1, 1);
  inp.throttle = clamp(inp.throttle, -1, 1);
  return inp;
}

/**
 * Mode « avion commun » : le pilote (souvent l'enfant) et le copilote (l'adulte)
 * pilotent le même avion. Leurs commandes s'additionnent ; si le copilote
 * maintient LB, il prend complètement la main.
 */
export function mixCopilot(pilot, copilot) {
  const out = emptyInput();
  if (copilot.override) {
    Object.assign(out, copilot);
    out.dropPressed = copilot.dropPressed || pilot.dropPressed;
    out.drop = copilot.drop || pilot.drop;
    out.override = true;
  } else {
    out.steer = pilot.steer + copilot.steer;
    out.pitch = pilot.pitch + copilot.pitch;
    out.throttle = pilot.throttle + copilot.throttle;
    out.throttleSet = copilot.throttleSet ?? pilot.throttleSet;
    out.drop = pilot.drop || copilot.drop;
    out.dropPressed = pilot.dropPressed || copilot.dropPressed;
    out.go = pilot.go || copilot.go;
  }
  out.camera = pilot.camera || copilot.camera;
  out.pause = pilot.pause || copilot.pause;
  out.recenter = pilot.recenter || copilot.recenter;
  out.active = pilot.active || copilot.active;
  return finalize(out);
}
