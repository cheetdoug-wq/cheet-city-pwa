// Maps, the menu clearing, the night sky, and collision helpers.
// Each map is planned once (deterministic) so the host and every client agree on the layout.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- unit geometries ----------
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const G_CONE = new THREE.ConeGeometry(0.5, 1, 7);
const G_PYR = (() => { const g = new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).toNonIndexed(); g.computeVertexNormals(); return g; })();
// Triangular prism: base on y=0, ridge at y=1, ridge along Z, 1 wide.
const G_GABLE = (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.25, 0).scale(1 / 0.866, 1 / 0.75, 1).toNonIndexed(); g.computeVertexNormals(); return g; })();

const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();

class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, kind = 'lambert', rx = 0, rz = 0) {
    const key = color + '|' + kind;
    let e = this.groups.get(key);
    if (!e) { e = { color, kind, list: [] }; this.groups.set(key, e); }
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(M);
    e.list.push(g);
  }
  box(c, sx, sy, sz, x, y, z, ry = 0, kind) { this.add(G_BOX, c, x, y, z, sx, sy, sz, ry, kind); }
  build(parent) {
    for (const e of this.groups.values()) {
      const geo = mergeGeometries(e.list, false);
      e.list.forEach(g => g.dispose());
      let m;
      if (e.kind === 'glow') m = new THREE.MeshBasicMaterial({ color: e.color });
      else if (e.kind === 'beam') m = new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
      else if (e.kind === 'shiny') m = new THREE.MeshPhongMaterial({ color: e.color, shininess: 60 });
      else m = new THREE.MeshLambertMaterial({ color: e.color });
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
  }
}

function noiseTex(c1, c2, rep, seed = 1) {
  const r = mulberry(seed);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = c1; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    x.globalAlpha = r() * 0.5; x.fillStyle = r() < 0.5 ? c2 : c1;
    const s = 1 + r() * 3; x.fillRect(r() * 256, r() * 256, s, s * (1 + r() * 2));
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- collision ----------
function addBox(L, x0, z0, x1, z1, h = 3) { L.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h }); }
function addCircle(L, x, z, r) { L.circles.push({ x, z, r }); }
const gkey = (cx, cz) => (cx + 200) * 1000 + (cz + 200);
function finalize(L) {
  L.grid = new Map(); L.big = [];
  for (const c of L.circles) {
    if (c.r > 1.5) { L.big.push(c); continue; }
    const k = gkey(Math.floor(c.x / 4), Math.floor(c.z / 4));
    let a = L.grid.get(k); if (!a) L.grid.set(k, a = []); a.push(c);
  }
  return L;
}
function eachCircle(L, x, z, cb) {
  const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = L.grid.get(gkey(cx + i, cz + j));
    if (a) for (const c of a) cb(c);
  }
  for (const c of L.big) cb(c);
}

export function resolve(L, p, r) {
  for (const b of L.boxes) {
    if (p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
      if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
    }
  }
  eachCircle(L, p.x, p.z, c => {
    const dx = p.x - c.x, dz = p.z - c.z, R = c.r + r, d2 = dx * dx + dz * dz;
    if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; p.x += dx * k; p.z += dz * k; }
  });
  const B = L.half - r;
  p.x = clamp(p.x, -B, B); p.z = clamp(p.z, -B, B);
  return p;
}

export function blocked(L, x, z, r = 0.4) {
  if (Math.abs(x) > L.half - r || Math.abs(z) > L.half - r) return true;
  for (const b of L.boxes) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  let hit = false;
  eachCircle(L, x, z, c => { if (!hit && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) hit = true; });
  return hit;
}

function segBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - b.x0, b.x1 - ax, az - b.z0, b.z1 - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
// Line of sight at eye level: only tall solid things block it.
export function los(L, ax, az, bx, bz) {
  for (const b of L.boxes) if (b.h >= 1.3 && segBox(ax, az, bx, bz, b)) return false;
  return true;
}
export function openPoint(L, rnd = Math.random) {
  for (let i = 0; i < 40; i++) {
    const x = (rnd() * 2 - 1) * (L.half - 3), z = (rnd() * 2 - 1) * (L.half - 3);
    if (!blocked(L, x, z, 0.9)) return { x, z };
  }
  return { x: 0, z: 0 };
}

// ---------- planning ----------
const layouts = {};
export function getLayout(id) { return layouts[id] || (layouts[id] = id === 'camp' ? planCamp() : planHood()); }

function freeSpot(L, r, x, z, pad) {
  if (Math.abs(x) > L.half - 1 || Math.abs(z) > L.half - 1) return false;
  for (const b of L.boxes) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return false;
  for (const c of L.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return false;
  for (const k of L.keepOut || []) if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) return false;
  return true;
}

function planHood() {
  const r = mulberry(1337);
  const L = { id: 'hood', half: 42, boxes: [], circles: [], camper: [], killer: [], items: [], keepOut: [] };
  const walls = ['#6f7b86', '#8a7560', '#5f6e5a', '#7d6a7d', '#9a9480', '#5b6670', '#7a5348', '#6b6f5a'];
  const roofs = ['#2a2624', '#3a2a24', '#262b30', '#33302a'];
  L.items.push({ t: 'roads' });
  let n = 0;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = sx * [10, 21, 32][i];
    for (const row of [13, 31]) {
      const z = sz * row;
      if (sx < 0 && sz > 0 && i === 1 && row === 13) { // a small park instead of a house
        L.items.push({ t: 'park', x, z });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; addCircle(L, x + Math.cos(a) * 2.3, z + Math.sin(a) * 2.3, 0.15); }
        L.camper.push({ x: x + 3.5, z }, { x: x - 3.5, z }, { x, z: z - 3.5 });
        L.keepOut.push({ x, z, r: 4 });
        continue;
      }
      const w = 8, d = 7, h = 3.1, face = -sz;
      L.items.push({ t: 'house', x, z, w, d, h, face, color: walls[n % walls.length], roof: roofs[n % roofs.length], lit: r() < 0.55, chim: r() < 0.5 });
      addBox(L, x - w / 2, z - d / 2, x + w / 2, z + d / 2, h);
      L.camper.push({ x: x - w * 0.2 + (r() - 0.5), z: z + face * (d / 2 + 1.9) });
      n++;
    }
  }
  // Back-yard fences with gaps you can slip through.
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    let x = sx * 5;
    while (Math.abs(x) < 39) {
      const len = 4 + r() * 4, x2 = x + sx * len;
      L.items.push({ t: 'fence', x0: x, x1: x2, z: sz * 22 });
      addBox(L, x, sz * 22 - 0.15, x2, sz * 22 + 0.15, 1.1);
      x = x2 + sx * (2 + r() * 2);
    }
  }
  // Parked cars along the main road.
  const carCols = ['#7a1f1f', '#1f3f6a', '#cfcfcf', '#2a2a2a', '#6a6a2a', '#3f6a4f'];
  for (let i = 0; i < 8; i++) {
    let x = (r() * 2 - 1) * 36; if (Math.abs(x) < 8) x += Math.sign(x || 1) * 9;
    const z = (i % 2 ? 1 : -1) * 2.7;
    L.items.push({ t: 'car', x, z, ry: 0, color: carCols[i % carCols.length] });
    addBox(L, x - 2.1, z - 0.9, x + 2.1, z + 0.9, 1.5);
  }
  for (let i = 0; i < 3; i++) {
    const z = (r() * 2 - 1) * 34; if (Math.abs(z) < 8) continue;
    const x = (i % 2 ? 1 : -1) * 2.7;
    L.items.push({ t: 'car', x, z, ry: Math.PI / 2, color: carCols[(i + 3) % carCols.length] });
    addBox(L, x - 0.9, z - 2.1, x + 0.9, z + 2.1, 1.5);
  }
  // Street lights.
  for (let v = -35; v <= 35; v += 14) {
    if (Math.abs(v) < 6) continue;
    for (const s of [-1, 1]) {
      L.items.push({ t: 'lamp', x: v, z: s * 5.2, ax: 0, az: -s * 0.9 }); addCircle(L, v, s * 5.2, 0.15);
      L.items.push({ t: 'lamp', x: s * 5.2, z: v + 7, ax: -s * 0.9, az: 0 }); addCircle(L, s * 5.2, v + 7, 0.15);
    }
  }
  // Trash cans and mailboxes.
  for (let i = 0; i < 14; i++) {
    const x = (r() * 2 - 1) * 38, z = (r() < 0.5 ? -1 : 1) * (6.2 + r() * 0.6);
    if (Math.abs(x) < 6 || !freeSpot(L, r, x, z, 0.8)) continue;
    L.items.push({ t: 'can', x, z }); addCircle(L, x, z, 0.35);
  }
  L.killer.push({ x: -37, z: -37 }, { x: 37, z: -37 }, { x: -37, z: 37 }, { x: 37, z: 37 }, { x: 0, z: -39 }, { x: 0, z: 39 }, { x: -39, z: 0 }, { x: 39, z: 0 });
  for (const k of L.killer) L.keepOut.push({ x: k.x, z: k.z, r: 3 });
  // Trees in the yards.
  for (let i = 0, made = 0; i < 600 && made < 95; i++) {
    const x = (r() * 2 - 1) * 40, z = (r() * 2 - 1) * 40;
    if (Math.abs(z) < 7 || Math.abs(x) < 7) continue;
    if (!freeSpot(L, r, x, z, 2)) continue;
    const s = 0.8 + r() * 0.7;
    L.items.push({ t: 'tree', x, z, s, h: 6 + r() * 4, c: r() < 0.5 ? '#14261a' : '#1a2f1c' });
    addCircle(L, x, z, 0.3 * s);
    made++;
  }
  for (let v = -30; v <= 30; v += 15) L.camper.push({ x: v + 2, z: 6.5 }, { x: -6.5, z: v - 2 });
  return finalize(L);
}

function planCamp() {
  const r = mulberry(4242);
  const L = { id: 'camp', half: 44, boxes: [], circles: [], camper: [], killer: [], items: [], keepOut: [] };
  L.items.push({ t: 'lake', x: 0, z: -24, r: 13 });
  addCircle(L, 0, -24, 13.2);
  L.items.push({ t: 'fire', x: 0, z: 6 });
  addCircle(L, 0, 6, 0.9);
  L.keepOut.push({ x: 0, z: 6, r: 8 }, { x: 0, z: -24, r: 17 }, { x: 0, z: -10, r: 3 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, x = Math.cos(a) * 3, z = 6 + Math.sin(a) * 3;
    L.items.push({ t: 'log', x, z, ry: -a });
    addCircle(L, x, z, 0.4);
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; L.camper.push({ x: Math.cos(a) * 4.6, z: 6 + Math.sin(a) * 4.6 }); }
  const cabins = [[-22, 2], [-20, 17], [-9, 27], [5, 29], [19, 22], [26, 8], [24, -6]];
  cabins.forEach(([x, z], i) => {
    const alongX = Math.abs(z - 6) > Math.abs(x);
    const w = alongX ? 6 : 5, d = alongX ? 5 : 6;
    const face = alongX ? { x: 0, z: z > 6 ? -1 : 1 } : { x: x > 0 ? -1 : 1, z: 0 };
    L.items.push({ t: 'cabin', x, z, w, d, h: 2.8, face, lit: r() < 0.6 });
    addBox(L, x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2.8);
    L.camper.push({ x: x + face.x * (d / 2 + 1.8), z: z + face.z * (w / 2 + 1.8) });
    L.keepOut.push({ x: x + face.x * 4, z: z + face.z * 4, r: 2 });
  });
  // Mess hall and outhouse.
  L.items.push({ t: 'cabin', x: -28, z: -14, w: 10, d: 8, h: 3.6, face: { x: 1, z: 0 }, lit: true, big: true });
  addBox(L, -33, -18, -23, -10, 3.6);
  L.camper.push({ x: -21, z: -14 }, { x: -21, z: -12 });
  L.items.push({ t: 'outhouse', x: 30, z: -22 }); addBox(L, 29.2, -22.8, 30.8, -21.2, 2.4);
  // Tents.
  const tentCols = ['#2e6b4a', '#a04a2a', '#2f4f86', '#8a7a2a', '#6a2f6a', '#2a6a6a'];
  [[-8, 15], [8, 16], [-12, 3], [12, 2], [-7, -4], [8, -5]].forEach(([x, z], i) => {
    L.items.push({ t: 'tent', x, z, c: tentCols[i] });
    addBox(L, x - 1.1, z - 1.1, x + 1.1, z + 1.1, 1.7);
    L.camper.push({ x: x + 1.8, z: z + 0.5 });
  });
  // Picnic tables and archery range.
  [[14, -12], [-14, -6], [3, 18]].forEach(([x, z]) => { L.items.push({ t: 'table', x, z }); addBox(L, x - 1, z - 0.8, x + 1, z + 0.8, 0.8); });
  [[18, -16], [21, -18]].forEach(([x, z]) => { L.items.push({ t: 'target', x, z }); addCircle(L, x, z, 0.6); });
  L.items.push({ t: 'dock', x: 0, z: -11 });
  L.camper.push({ x: 2, z: -9.5 }, { x: -2, z: -9.5 });
  L.items.push({ t: 'canoe', x: 6, z: -10.6 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, rr = 38;
    let x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    for (let t = 0; t < 10 && !freeSpot(L, r, x, z, 0.8); t++) { x *= 0.97; z *= 0.97; }
    L.killer.push({ x, z }); L.keepOut.push({ x, z, r: 3 });
  }
  // Forest.
  for (let i = 0, made = 0; i < 4000 && made < 330; i++) {
    const x = (r() * 2 - 1) * 43, z = (r() * 2 - 1) * 43;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > 33;
    if (!edge && r() < 0.55) continue;
    if (!freeSpot(L, r, x, z, edge ? 1.2 : 2.2)) continue;
    const s = 0.8 + r() * 0.8;
    L.items.push({ t: 'tree', x, z, s, h: 7 + r() * 6, c: r() < 0.5 ? '#0f2016' : '#16291b' });
    addCircle(L, x, z, 0.3 * s);
    made++;
  }
  return finalize(L);
}

// ---------- building ----------
function house(B, it) {
  const { x, z, w, d, h, face, color, roof, lit, chim } = it;
  B.box(color, w, h, d, x, h / 2, z);
  B.add(G_GABLE, roof, x, h, z, d + 0.7, 1.9, w + 0.7, Math.PI / 2);
  const fz = z + face * (d / 2 + 0.04);
  B.box('#2f1f14', 1.1, 2.1, 0.08, x - w * 0.2, 1.05, fz);
  for (const wx of [x + w * 0.12, x + w * 0.32]) B.box(lit ? '#ffcc6e' : '#0f141b', 1.2, 1, 0.06, wx, 1.7, fz, 0, lit ? 'glow' : 'lambert');
  B.box(lit && Math.random() < 0.6 ? '#ffcc6e' : '#0f141b', 0.06, 1, 1.4, x + w / 2 + 0.03, 1.7, z, 0, lit ? 'glow' : 'lambert');
  B.box('#45403a', 3, 0.2, 1.8, x - w * 0.2, 0.1, z + face * (d / 2 + 0.9));
  B.box('#ffd890', 0.15, 0.2, 0.08, x - w * 0.2 + 0.85, 2.3, fz + face * 0.03, 0, 'glow');
  if (chim) B.box('#5a3a32', 0.7, 2, 0.7, x + w * 0.3, h + 1.1, z - face * 1);
}
function cabin(B, it) {
  const { x, z, w, d, h, face, lit, big } = it;
  const alongX = face.x === 0;
  B.box('#4a3322', w, h, d, x, h / 2, z);
  if (alongX) B.add(G_GABLE, '#2a2420', x, h, z, d + 0.8, 1.6, w + 0.8, Math.PI / 2);
  else B.add(G_GABLE, '#2a2420', x, h, z, w + 0.8, 1.6, d + 0.8, 0);
  const fx = x + face.x * (w / 2 + 0.04), fz = z + face.z * (d / 2 + 0.04);
  if (alongX) {
    B.box('#2a1a10', 1, 2, 0.08, x - 1, 1, fz);
    B.box(lit ? '#ffb85a' : '#0c1014', 1, 0.8, 0.06, x + 1.4, 1.6, fz, 0, lit ? 'glow' : 'lambert');
    B.box('#3a2a1c', 2.6, 0.25, 1.4, x - 0.6, 0.12, z + face.z * (d / 2 + 0.7));
  } else {
    B.box('#2a1a10', 0.08, 2, 1, fx, 1, z - 1);
    B.box(lit ? '#ffb85a' : '#0c1014', 0.06, 0.8, 1, fx, 1.6, z + 1.4, 0, lit ? 'glow' : 'lambert');
    B.box('#3a2a1c', 1.4, 0.25, 2.6, x + face.x * (w / 2 + 0.7), 0.12, z - 0.6);
  }
  if (big) B.box('#5a4a3a', 0.1, 0.6, 3, fx + face.x * 0.05, 3.1, z);
}
function tree(B, it) {
  const { x, z, s, h, c } = it;
  B.add(G_CYL, '#2e2216', x, h * 0.2, z, 0.3 * s, h * 0.4, 0.3 * s);
  B.add(G_CONE, c, x, h * 0.42, z, 3 * s, h * 0.5, 3 * s);
  B.add(G_CONE, c, x, h * 0.68, z, 2.1 * s, h * 0.42, 2.1 * s);
}
function car(B, it) {
  const { x, z, ry, color } = it;
  const ox = Math.cos(ry), oz = -Math.sin(ry);
  B.box(color, 4.2, 0.75, 1.8, x, 0.65, z, ry, 'shiny');
  B.box('#141a22', 2.2, 0.6, 1.62, x - ox * 0.2, 1.32, z - oz * 0.2, ry, 'shiny');
  for (const a of [-1.35, 1.35]) for (const b of [-0.82, 0.82]) {
    const px = x + ox * a + -oz * b, pz = z + oz * a + ox * b;
    if (ry === 0) B.add(G_CYL, '#0d0d0d', px, 0.35, pz, 0.7, 0.28, 0.7, 0, 'lambert', Math.PI / 2, 0);
    else B.add(G_CYL, '#0d0d0d', px, 0.35, pz, 0.7, 0.28, 0.7, 0, 'lambert', 0, Math.PI / 2);
  }
  B.box('#7a0a0a', 0.06, 0.15, 0.3, x - ox * 2.11 + -oz * 0.6, 0.85, z - oz * 2.11 + ox * 0.6, ry, 'glow');
  B.box('#7a0a0a', 0.06, 0.15, 0.3, x - ox * 2.11 - -oz * 0.6, 0.85, z - oz * 2.11 - ox * 0.6, ry, 'glow');
}
function lamp(B, it) {
  const { x, z, ax, az } = it;
  B.add(G_CYL, '#222326', x, 2.5, z, 0.15, 5, 0.15);
  B.box('#222326', Math.abs(ax) + 0.1, 0.1, Math.abs(az) + 0.1, x + ax / 2, 5, z + az / 2);
  B.box('#ffdc9a', 0.35, 0.12, 0.35, x + ax, 4.92, z + az, 0, 'glow');
  B.add(G_CONE, '#ffcf8a', x + ax, 2.45, z + az, 4.2, 4.9, 4.2, 0, 'beam');
  B.add(G_CYL, '#2a2c22', x + ax, 0.012, z + az, 3.6, 0.01, 3.6, 0, 'lambert');
}

function buildRoads(B, L) {
  const H = L.half + 8;
  B.box('#141518', H * 2, 0.02, 8, 0, 0.01, 0);
  B.box('#141518', 8, 0.02, H * 2, 0, 0.011, 0);
  for (const s of [-1, 1]) {
    B.box('#3a3c3f', H * 2, 0.1, 2, 0, 0.05, s * 5);
    B.box('#3a3c3f', 2, 0.1, H * 2, s * 5, 0.051, 0);
  }
  for (let v = -H + 2; v < H; v += 4) {
    if (Math.abs(v) < 6) continue;
    B.box('#a89a50', 1.8, 0.03, 0.14, v, 0.025, 0);
    B.box('#a89a50', 0.14, 0.03, 1.8, 0, 0.026, v);
  }
}

export function makeFire(parent, x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); parent.add(g);
  const B = new Batch();
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; B.box('#4a4a48', 0.3, 0.2, 0.25, Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75, -a); }
  B.box('#3a2414', 1.2, 0.16, 0.16, 0, 0.12, 0, 0.5); B.box('#3a2414', 1.2, 0.16, 0.16, 0, 0.2, 0, -0.7);
  B.box('#ff5a14', 0.5, 0.05, 0.5, 0, 0.08, 0, 0, 'glow');
  B.build(g);
  const flames = [];
  const cols = ['#ff4a10', '#ff9a1a', '#ffe08a'];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(G_CONE, new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.set(0.75 - i * 0.2, 1.1 - i * 0.25, 0.75 - i * 0.2); m.position.y = 0.5 - i * 0.08; g.add(m); flames.push(m);
  }
  const light = new THREE.PointLight(0xff7a2a, 40 * scale, 26 * scale, 1.4); light.position.set(0, 1.1, 0); g.add(light);
  return {
    group: g, light,
    update(t) {
      flames.forEach((m, i) => { m.scale.y = (1.1 - i * 0.25) * (1 + Math.sin(t * (11 + i * 3) + i) * 0.15 + Math.random() * 0.08); m.rotation.y = t * (1 + i); });
      light.intensity = 40 * scale * (0.82 + Math.sin(t * 17) * 0.08 + Math.random() * 0.12);
    },
  };
}

export function buildMap(id, scene) {
  const L = getLayout(id);
  const group = new THREE.Group(); scene.add(group);
  const B = new Batch();
  const camp = id === 'camp';
  const groundSize = L.half * 2 + 80;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: noiseTex(camp ? '#1b2516' : '#18251a', camp ? '#2a2a1a' : '#223322', 40, camp ? 7 : 3) }));
  group.add(ground);
  const updaters = [];
  for (const it of L.items) {
    switch (it.t) {
      case 'roads': buildRoads(B, L); break;
      case 'house': house(B, it); break;
      case 'cabin': cabin(B, it); break;
      case 'tree': tree(B, it); break;
      case 'car': car(B, it); break;
      case 'lamp': lamp(B, it); break;
      case 'fence': {
        const len = Math.abs(it.x1 - it.x0), cx = (it.x0 + it.x1) / 2;
        B.box('#5a4a38', len, 0.1, 0.06, cx, 0.95, it.z); B.box('#5a4a38', len, 0.1, 0.06, cx, 0.5, it.z);
        for (let k = 0; k <= Math.floor(len / 2); k++) B.box('#4a3a2a', 0.12, 1.1, 0.12, Math.min(it.x0, it.x1) + k * 2, 0.55, it.z);
        break;
      }
      case 'can': B.add(G_CYL, '#3a4038', it.x, 0.5, it.z, 0.6, 1, 0.6); B.add(G_CYL, '#2a302a', it.x, 1.02, it.z, 0.66, 0.06, 0.66); break;
      case 'park': {
        const { x, z } = it;
        B.add(G_CYL, '#5a5248', x, 0.15, z, 5.4, 0.3, 5.4);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.add(G_CYL, '#e8e2d8', x + Math.cos(a) * 2.3, 1.5, z + Math.sin(a) * 2.3, 0.2, 2.7, 0.2); }
        B.add(G_CONE, '#3a2a2a', x, 3.6, z, 6.2, 1.6, 6.2);
        B.box('#4a3a2a', 2, 0.1, 0.5, x + 4.5, 0.5, z + 2); B.box('#4a3a2a', 2, 0.1, 0.5, x - 4.5, 0.5, z - 2);
        B.box('#6a2a2a', 0.1, 2.4, 0.1, x + 4, 1.2, z - 3); B.box('#6a2a2a', 0.1, 2.4, 0.1, x + 6, 1.2, z - 3); B.box('#6a2a2a', 2.1, 0.1, 0.1, x + 5, 2.4, z - 3);
        B.box('#222', 0.5, 0.05, 0.25, x + 4.6, 0.6, z - 3); B.box('#222', 0.5, 0.05, 0.25, x + 5.4, 0.6, z - 3);
        break;
      }
      case 'lake': {
        const sand = new THREE.Mesh(new THREE.CircleGeometry(it.r + 2.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#3a3426' }));
        sand.position.set(it.x, 0.015, it.z); group.add(sand);
        const water = new THREE.Mesh(new THREE.CircleGeometry(it.r, 48).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#0a1820', shininess: 120, specular: 0x6070a0 }));
        water.position.set(it.x, 0.03, it.z); group.add(water);
        break;
      }
      case 'fire': { const f = makeFire(group, it.x, it.z, 1.2); updaters.push(f.update); break; }
      case 'log': B.add(G_CYL, '#3a2a1a', it.x, 0.22, it.z, 0.42, 1.8, 0.42, it.ry, 'lambert', 0, Math.PI / 2); break;
      case 'tent': B.add(G_PYR, it.c, it.x, 0.9, it.z, 2.4, 1.8, 2.4); B.box('#111', 0.5, 0.9, 0.05, it.x, 0.45, it.z + 0.86); break;
      case 'table':
        B.box('#5a4028', 2, 0.08, 0.9, it.x, 0.78, it.z); B.box('#5a4028', 2, 0.06, 0.3, it.x, 0.45, it.z - 0.7); B.box('#5a4028', 2, 0.06, 0.3, it.x, 0.45, it.z + 0.7);
        B.box('#4a3020', 0.1, 0.78, 1.4, it.x - 0.8, 0.39, it.z); B.box('#4a3020', 0.1, 0.78, 1.4, it.x + 0.8, 0.39, it.z);
        break;
      case 'target':
        B.add(G_CYL, '#c9b06a', it.x, 1.2, it.z, 1.2, 0.2, 1.2, 0, 'lambert', Math.PI / 2, 0);
        B.add(G_CYL, '#a01818', it.x, 1.2, it.z - 0.11, 0.6, 0.02, 0.6, 0, 'lambert', Math.PI / 2, 0);
        B.box('#4a3020', 0.1, 1.2, 0.1, it.x, 0.6, it.z + 0.2);
        break;
      case 'outhouse':
        B.box('#4a3a28', 1.6, 2.4, 1.6, it.x, 1.2, it.z); B.add(G_GABLE, '#2a2420', it.x, 2.4, it.z, 1.9, 0.6, 1.9);
        B.box('#ffd27a', 0.15, 0.1, 0.02, it.x - 0.81, 1.9, it.z, 0, 'glow');
        break;
      case 'dock':
        B.box('#4a3624', 2, 0.12, 8, it.x, 0.35, it.z - 4);
        for (let k = 0; k < 4; k++) for (const s of [-1, 1]) B.add(G_CYL, '#3a2a1a', it.x + s * 0.9, 0.2, it.z - 1 - k * 2, 0.16, 0.6, 0.16);
        break;
      case 'canoe': B.box('#8a2a1a', 0.8, 0.35, 3.6, it.x, 0.18, it.z, 0.3); break;
    }
  }
  B.build(group);
  return {
    group, layout: L,
    update(t) { for (const u of updaters) u(t); },
    dispose() {
      group.traverse(o => { if (o.geometry && o.geometry !== G_CONE) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
      group.removeFromParent();
    },
  };
}

// The menu: a clearing in the woods at night with a campfire.
export function buildMenu(scene) {
  const r = mulberry(99);
  const group = new THREE.Group(); scene.add(group);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: noiseTex('#16201a', '#2a2a1c', 30, 11) }));
  group.add(ground);
  const B = new Batch();
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2, d = 7 + r() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > -4 && Math.abs(x) < 6) continue;
    tree(B, { x, z, s: 0.8 + r() * 0.8, h: 7 + r() * 6, c: r() < 0.5 ? '#0f2016' : '#16291b' });
  }
  cabin(B, { x: 4, z: -12, w: 6, d: 5, h: 2.8, face: { x: 0, z: 1 }, lit: true });
  car(B, { x: -6, z: -8, ry: 0.0, color: '#4a1a14' });
  B.add(G_CYL, '#3a2a1a', -2.2, 0.22, -2.0, 0.42, 1.8, 0.42, 0.3, 'lambert', 0, Math.PI / 2);
  B.build(group);
  const fire = makeFire(group, -2.6, -3.6, 1);
  const preview = new THREE.Group(); preview.position.set(2.05, 0, -3.5); preview.rotation.y = -0.35; group.add(preview);
  return { group, preview, update(t) { fire.update(t); } };
}

export function buildSky(scene) {
  const n = 1400, pos = new Float32Array(n * 3);
  const r = mulberry(5);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u) * 0.9 + 0.08, s = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * s * 300; pos[i * 3 + 1] = y * 300; pos[i * 3 + 2] = Math.sin(a) * s * 300;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8d0e8, size: 1.4, sizeAttenuation: false, fog: false }));
  stars.frustumCulled = false;
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshBasicMaterial({ color: '#efe9d2', fog: false }));
  moon.position.set(-110, 130, -240); scene.add(moon);
  return { stars, moon };
}
