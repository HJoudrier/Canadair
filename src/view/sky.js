// Ciel en dégradé, soleil, lumières, brouillard et nuages cartoon.
import * as THREE from 'three';
import { toonGradient } from './toon.js';

export const SKY = { top: 0x3f9be8, horizon: 0xbfe6ff, fogNear: 900, fogFar: 3400 };

export function createSky(scene, world, quality = {}) {
  scene.background = new THREE.Color(SKY.horizon);
  scene.fog = new THREE.Fog(SKY.horizon, SKY.fogNear, quality.fogFar ?? SKY.fogFar);

  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x6b8f4e, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(0.5, 1, 0.3).multiplyScalar(1000);
  scene.add(sun);
  scene.add(sun.target);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(8000, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(SKY.top) }, horizon: { value: new THREE.Color(SKY.horizon) } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top; uniform vec3 horizon;
        varying vec3 vDir;
        void main() {
          float t = smoothstep(-0.02, 0.45, vDir.y);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.name = 'sky';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // Nuages : groupes de boules blanches
  const count = quality.clouds ?? 26;
  const puffs = [];
  let seed = (world.seed * 31 + 7) % 2147483647;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < count; k++) {
    const cx = rand() * world.size, cz = rand() * world.size, cy = 620 + rand() * 260;
    const n = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      puffs.push({ x: cx + (rand() - 0.5) * 90, y: cy + (rand() - 0.3) * 18, z: cz + (rand() - 0.5) * 50, s: 22 + rand() * 26 });
    }
  }
  const clouds = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), emissive: 0x6d7f90 }),
    puffs.length,
  );
  const m = new THREE.Matrix4();
  puffs.forEach((p, i) => {
    m.makeScale(p.s, p.s * 0.7, p.s);
    m.setPosition(p.x, p.y, p.z);
    clouds.setMatrixAt(i, m);
  });
  clouds.computeBoundingSphere();
  clouds.name = 'clouds';
  scene.add(clouds);

  return {
    dome, sun, hemi, clouds,
    follow(pos) { dome.position.copy(pos); },
    drift(dt) { clouds.position.x += dt * 2.5; },
  };
}
