// Construction des maillages Three.js du monde : relief, eau, arbres, bâtiments, aérodrome, routes.
import * as THREE from 'three';
import { toon, toonGradient, paint, merge, roofGeometry, waterMaterial } from '../view/toon.js';
import { B, COLORS, BURNT_COLOR, WATER } from './biomes.js';
import { terrainHeight, waterLevel } from './terrain.js';
import { CELL } from '../fire/fireSim.js';

const FIELD_COLORS = [[0.91, 0.79, 0.35], [0.71, 0.85, 0.34], [0.83, 0.66, 0.36], [0.95, 0.88, 0.5]];
const EMBER = [0.42, 0.24, 0.16];
const CHUNK = 32;

export class WorldView {
  constructor(world, quality = { trees: 2 }) {
    this.world = world;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.waterMat = waterMaterial();
    this.colorDirty = false;
    this.flushT = 0;
    this.buildTerrain();
    this.buildSea();
    this.buildInlandWater();
    this.buildTrees();
    this.buildBuildings();
    this.buildAirport();
    this.buildRoads();
  }

  // ---------- Relief ----------
  buildTerrain() {
    const w = this.world;
    const { V, cell, height, biome, shade, cells } = w;
    const pos = new Float32Array(V * V * 3);
    const col = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const v = j * V + i;
        const x = i * cell, z = j * cell, h = height[v];
        pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
        const b = biome[v];
        let c = COLORS[b];
        if (b === B.FIELD) c = FIELD_COLORS[(Math.floor(x / 70) * 7 + Math.floor(z / 55) * 3) & 3];
        const k = 1 + shade[v] * 0.07 + (b === B.GRASS ? Math.min(0.12, h / 2000) * -1 : 0);
        col[v * 3] = Math.min(1, c[0] * k);
        col[v * 3 + 1] = Math.min(1, c[1] * k);
        col[v * 3 + 2] = Math.min(1, c[2] * k);
      }
    }
    const idx = new Uint32Array(cells * cells * 6);
    let o = 0;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = j * V + i;
        idx[o++] = a; idx[o++] = a + V; idx[o++] = a + 1;
        idx[o++] = a + 1; idx[o++] = a + V; idx[o++] = a + V + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    mat.flatShading = true;
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.name = 'terrain';
    this.terrainColors = col;
    this.group.add(this.terrain);
  }

  /** Assombrit les sommets d'une case de feu selon son état. */
  paintCell(c, state, fire) {
    const { V, cells } = this.world;
    const i = c % cells, j = (c - i) / cells;
    const col = this.terrainColors;
    let target, k;
    if (state === CELL.BURNING) { target = EMBER; k = 0.55; }
    else if (state === CELL.BURNT) { target = BURNT_COLOR; k = 0.85; }
    else { target = [0.25, 0.42, 0.22]; k = fire && fire.wet[c] > 0.3 ? 0.25 : 0; }
    if (k <= 0) return;
    for (const v of [j * V + i, j * V + i + 1, (j + 1) * V + i, (j + 1) * V + i + 1]) {
      col[v * 3] += (target[0] - col[v * 3]) * k;
      col[v * 3 + 1] += (target[1] - col[v * 3 + 1]) * k;
      col[v * 3 + 2] += (target[2] - col[v * 3 + 2]) * k;
    }
    this.colorDirty = true;
  }

  // ---------- Eau ----------
  buildSea() {
    const w = this.world;
    const g = new THREE.PlaneGeometry(60000, 60000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(g, this.waterMat);
    sea.position.set(w.size / 2, 0, w.size / 2);
    sea.name = 'sea';
    this.group.add(sea);
  }

  buildInlandWater() {
    const { V, cells, cell, waterType, water } = this.world;
    const pos = [];
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = j * V + i;
        const corners = [a, a + 1, a + V, a + V + 1];
        let level = -Infinity, any = false;
        for (const c of corners) {
          const t = waterType[c];
          if (t === WATER.LAKE || t === WATER.RIVER) { any = true; level = Math.max(level, water[c]); }
        }
        if (!any) continue;
        const h = corners.map((c) => (waterType[c] === WATER.LAKE || waterType[c] === WATER.RIVER ? water[c] : level) + 0.05);
        const x0 = i * cell, z0 = j * cell, x1 = x0 + cell, z1 = z0 + cell;
        pos.push(x0, h[0], z0, x0, h[2], z1, x1, h[1], z0);
        pos.push(x1, h[1], z0, x0, h[2], z1, x1, h[3], z1);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.waterMat);
    m.name = 'inlandWater';
    this.group.add(m);
  }

  // ---------- Arbres ----------
  static treeGeometries() {
    const trunk = paint(new THREE.CylinderGeometry(0.5, 0.75, 4, 5).translate(0, 2, 0), 0x8d5a3b);
    const crown = paint(new THREE.IcosahedronGeometry(3.6, 0).scale(1, 0.9, 1).translate(0, 6.6, 0), 0x56b947);
    const crown2 = paint(new THREE.IcosahedronGeometry(2.4, 0).translate(1.2, 8.6, 0.6), 0x74d25c);
    const leafy = merge([trunk, crown, crown2]);
    const trunk2 = paint(new THREE.CylinderGeometry(0.4, 0.6, 3, 5).translate(0, 1.5, 0), 0x7a4e33);
    const cone1 = paint(new THREE.ConeGeometry(3.3, 6, 7).translate(0, 5.2, 0), 0x2e8b4f);
    const cone2 = paint(new THREE.ConeGeometry(2.4, 5, 7).translate(0, 8.6, 0), 0x3fa860);
    const pine = merge([trunk2, cone1, cone2]);
    return { leafy, pine };
  }

  buildTrees() {
    const w = this.world;
    const { V, cells, cell, biome } = w;
    const { leafy, pine } = WorldView.treeGeometries();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    const perCell = this.quality.trees ?? 2;
    const nCh = Math.ceil(cells / CHUNK);
    const lists = new Map();
    let seed = w.seed * 7 + 13;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.cellTrees = new Int32Array(cells * cells * 2).fill(-1);
    this.trees = [];
    const { min, max } = w.bounds;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const b = biome[j * V + i];
        const forest = b === B.FOREST || b === B.PINE;
        const lone = (b === B.GRASS || b === B.FIELD) && rand() < 0.035;
        if (!forest && !lone) continue;
        const x0 = i * cell, z0 = j * cell;
        const inside = x0 > min - 200 && x0 < max + 200 && z0 > min - 200 && z0 < max + 200;
        const n = forest ? (inside ? perCell : 1) : 1;
        for (let k = 0; k < n; k++) {
          const x = x0 + (n === 2 ? (k === 0 ? 0.25 : 0.75) : 0.5) * cell + (rand() - 0.5) * cell * 0.4;
          const z = z0 + (0.3 + rand() * 0.4) * cell;
          const y = terrainHeight(w, x, z);
          if (y < 1) continue;
          const type = b === B.PINE || (forest && y > 120 && rand() < 0.5) ? 'pine' : 'leafy';
          const ci = Math.floor(i / CHUNK), cj = Math.floor(j / CHUNK);
          const key = type + ':' + (cj * nCh + ci);
          if (!lists.has(key)) lists.set(key, []);
          const t = { x, y, z, s: 0.85 + rand() * 0.6, r: rand() * Math.PI * 2, tint: 0.85 + rand() * 0.3, cell: j * cells + i, key, index: 0 };
          const arr = lists.get(key);
          t.index = arr.length;
          arr.push(t);
          const ti = this.trees.length;
          this.trees.push(t);
          const slot = (j * cells + i) * 2 + (this.cellTrees[(j * cells + i) * 2] >= 0 ? 1 : 0);
          this.cellTrees[slot] = ti;
        }
      }
    }
    this.treeMeshes = new Map();
    this.chunks = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (const [key, arr] of lists) {
      const geom = key.startsWith('pine') ? pine : leafy;
      const mesh = new THREE.InstancedMesh(geom, mat, arr.length);
      for (let k = 0; k < arr.length; k++) {
        const t = arr[k];
        q.setFromAxisAngle(up, t.r);
        s.setScalar(t.s);
        p.set(t.x, t.y - 0.3, t.z);
        m4.compose(p, q, s);
        mesh.setMatrixAt(k, m4);
        c.setRGB(t.tint, t.tint, t.tint);
        mesh.setColorAt(k, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = 'trees:' + key;
      this.treeMeshes.set(key, mesh);
      const bs = mesh.boundingSphere;
      this.chunks.push({ mesh, center: bs.center.clone(), radius: bs.radius });
      this.group.add(mesh);
    }
  }

  /** Change l'aspect des arbres d'une case (en feu / brûlés). */
  updateTreesForCell(c, state) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let k = 0; k < 2; k++) {
      const ti = this.cellTrees[c * 2 + k];
      if (ti < 0) continue;
      const t = this.trees[ti];
      const mesh = this.treeMeshes.get(t.key);
      let scale = t.s;
      if (state === CELL.BURNING) col.setRGB(1.25, 0.62, 0.35);
      else if (state === CELL.BURNT) { col.setRGB(0.2, 0.18, 0.17); scale = t.s * 0.75; }
      else col.setRGB(t.tint * 0.8, t.tint * 0.95, t.tint * 0.8);
      mesh.setColorAt(t.index, col);
      mesh.instanceColor.needsUpdate = true;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
      s.set(scale, state === CELL.BURNT ? scale * 0.7 : scale, scale);
      p.set(t.x, t.y - 0.3, t.z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(t.index, m4);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Bâtiments ----------
  buildBuildings() {
    const list = this.world.buildings;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roof = roofGeometry();
    const spire = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const wallMat = toon(0xffffff);
    const nWalls = list.length + list.filter((b) => b.kind === 'church').length;
    const nRoofs = list.length;
    this.walls = new THREE.InstancedMesh(box, wallMat, Math.max(1, nWalls));
    this.roofs = new THREE.InstancedMesh(roof, toon(0xffffff), Math.max(1, nRoofs));
    this.spires = new THREE.InstancedMesh(spire, toon(0xb5523b), Math.max(1, list.length));
    this.walls.name = 'walls'; this.roofs.name = 'roofs'; this.spires.name = 'spires';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let wi = 0, ri = 0, si = 0;
    this.bInst = [];
    list.forEach((b, idx) => {
      q.setFromAxisAngle(up, b.rot);
      const y = b.y ?? terrainHeight(this.world, b.x, b.z);
      p.set(b.x, y - 0.5, b.z);
      s.set(b.w, b.h + 0.5, b.d);
      m4.compose(p, q, s);
      this.walls.setMatrixAt(wi, m4);
      this.walls.setColorAt(wi, c.set(b.wall));
      const inst = { wall: wi++, roof: -1, spire: -1, tower: -1 };
      // Toit
      if (b.kind === 'block') {
        p.set(b.x, y + b.h, b.z); s.set(b.w * 1.04, 1.4, b.d * 1.04);
        m4.compose(p, q, s);
        this.roofs.setMatrixAt(ri, m4);
      } else {
        p.set(b.x, y + b.h, b.z); s.set(b.w * 1.12, b.kind === 'church' ? 6 : b.w * 0.45, b.d * 1.08);
        m4.compose(p, q, s);
        this.roofs.setMatrixAt(ri, m4);
      }
      this.roofs.setColorAt(ri, c.set(b.kind === 'block' ? 0x9aa0aa : b.roof));
      inst.roof = ri++;
      if (b.kind === 'church') {
        const fx = Math.sin(b.rot), fz = Math.cos(b.rot);
        const tx = b.x + fx * (b.d * 0.5 + 2.5), tz = b.z + fz * (b.d * 0.5 + 2.5);
        p.set(tx, y - 0.5, tz); s.set(5, 24, 5);
        m4.compose(p, q, s);
        this.walls.setMatrixAt(wi, m4);
        this.walls.setColorAt(wi, c.set(0xf3e7c9));
        inst.tower = wi++;
        p.set(tx, y + 23.5, tz); s.set(7, 9, 7);
        m4.compose(p, q, s);
        this.spires.setMatrixAt(si, m4);
        inst.spire = si++;
      }
      this.bInst[idx] = inst;
    });
    this.walls.count = wi; this.roofs.count = ri; this.spires.count = si;
    for (const m of [this.walls, this.roofs, this.spires]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      this.group.add(m);
    }
  }

  burnBuilding(idx) {
    const inst = this.bInst[idx];
    if (!inst) return;
    const c = new THREE.Color(0x3b3633);
    this.walls.setColorAt(inst.wall, c);
    if (inst.tower >= 0) this.walls.setColorAt(inst.tower, c);
    this.walls.instanceColor.needsUpdate = true;
    const m4 = new THREE.Matrix4();
    this.roofs.getMatrixAt(inst.roof, m4);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m4.decompose(p, q, s);
    s.y *= 0.25;
    m4.compose(p, q, s);
    this.roofs.setMatrixAt(inst.roof, m4);
    this.roofs.setColorAt(inst.roof, new THREE.Color(0x2a2522));
    this.roofs.instanceMatrix.needsUpdate = true;
    this.roofs.instanceColor.needsUpdate = true;
  }

  // ---------- Aérodrome ----------
  buildAirport() {
    const ap = this.world.airport;
    const g = new THREE.Group();
    g.name = 'airport';
    // Piste avec marquages (texture dessinée)
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 1024;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5b5f66'; ctx.fillRect(0, 0, 64, 1024);
    ctx.fillStyle = '#ffffff';
    for (let y = 80; y < 944; y += 48) ctx.fillRect(30, y, 4, 26);
    for (let x = 6; x < 60; x += 9) { ctx.fillRect(x, 10, 5, 50); ctx.fillRect(x, 964, 5, 50); }
    ctx.fillRect(2, 0, 2, 1024); ctx.fillRect(60, 0, 2, 1024);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(ap.width, ap.length).rotateX(-Math.PI / 2),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    );
    rw.position.set(ap.x, ap.h + 0.25, ap.z);
    rw.rotation.y = -ap.heading;
    rw.name = 'runway';
    g.add(rw);

    // Hangar à toit arrondi
    const hangar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 32).translate(0, 4.5, 0), toon(0xdfe6ee));
    const arc = new THREE.CylinderGeometry(20, 20, 32, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
    const roofArc = new THREE.Mesh(arc, toon(0xe63946));
    roofArc.scale.set(1, 0.45, 1);
    roofArc.position.y = 9;
    const door = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 0.5).translate(0, 3.5, 16.1), toon(0x46505c));
    hangar.add(body, roofArc, door);
    hangar.position.set(ap.hangar.x, ap.h, ap.hangar.z);
    hangar.rotation.y = -ap.heading + Math.PI / 2;
    g.add(hangar);

    // Tour de contrôle
    const tower = new THREE.Group();
    tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 18, 8).translate(0, 9, 0), toon(0xf1f1f1)));
    tower.add(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.6, 4, 8).translate(0, 20, 0), toon(0x3b8fd9)));
    tower.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 8).translate(0, 22.5, 0), toon(0xe63946)));
    tower.position.set(ap.tower.x, ap.h, ap.tower.z);
    g.add(tower);

    // Manche à air (indique le vent)
    const sock = new THREE.Group();
    sock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 5).translate(0, 4.5, 0), toon(0xdddddd)));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 8.6, -3), toon(0xff7a1a, { side: THREE.DoubleSide }));
    this.windsock = new THREE.Group();
    this.windsock.add(cone);
    sock.add(this.windsock);
    const sp = { x: ap.x + ap.fx * 200 + ap.lx * 45, z: ap.z + ap.fz * 200 + ap.lz * 45 };
    sock.position.set(sp.x, ap.h, sp.z);
    g.add(sock);
    this.group.add(g);
  }

  setWind(angle) {
    // La manche à air pointe là où va le vent
    if (this.windsock) this.windsock.rotation.y = -angle;
  }

  // ---------- Routes ----------
  buildRoads() {
    const w = this.world;
    const pos = [];
    const half = 4.5;
    for (const r of w.roads) {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
      if (len < 10) continue;
      const dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len;
      const px = -dz * half, pz = dx * half;
      let prev = null;
      for (let t = 0; t <= len + 0.01; t += 12) {
        const x = r.ax + dx * t, z = r.az + dz * t;
        const th = Math.max(terrainHeight(w, x - px, z - pz), terrainHeight(w, x + px, z + pz), terrainHeight(w, x, z));
        const wl = waterLevel(w, x, z);
        const y = Number.isNaN(wl) ? th + 0.7 : Math.max(th + 0.7, wl + 2.5);
        const cur = [x - px, y, z - pz, x + px, y, z + pz];
        if (prev) pos.push(...prev.slice(0, 3), ...cur.slice(0, 3), ...prev.slice(3), ...prev.slice(3), ...cur.slice(0, 3), ...cur.slice(3));
        prev = cur;
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mat = toon(0x9b9690, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'roads';
    this.group.add(mesh);
  }

  // ---------- Mise à jour ----------
  /** Applique les changements du feu (couleurs du sol, arbres, maisons). */
  applyFire(fire, changed, buildingEvents) {
    for (const c of changed) {
      const st = fire.state[c];
      this.paintCell(c, st, fire);
      this.updateTreesForCell(c, st);
    }
    for (const e of buildingEvents) this.burnBuilding(e.index);
  }

  update(dt, time, cameraPositions, viewDist) {
    this.waterMat.uniforms.time.value = time;
    this.flushT -= dt;
    if (this.colorDirty && this.flushT <= 0) {
      this.terrain.geometry.attributes.color.needsUpdate = true;
      this.colorDirty = false;
      this.flushT = 0.4;
    }
    // Arbres lointains masqués (en plus du brouillard)
    for (const ch of this.chunks) {
      let vis = false;
      for (const p of cameraPositions) {
        const d = Math.hypot(ch.center.x - p.x, ch.center.z - p.z);
        if (d < viewDist + ch.radius) { vis = true; break; }
      }
      ch.mesh.visible = vis;
    }
  }
}
