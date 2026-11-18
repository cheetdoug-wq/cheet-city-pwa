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
// ---------- rooms you can walk into ----------
// A room is laid out in local (u, v) coordinates: u across the front, v from back (-d/2) to front (+d/2),
// where the door is. face says which world direction the front looks toward.
function lw(it, u, v) {
  switch (it.face) {
    case '-z': return [it.x - u, it.z - v];
    case '+x': return [it.x + v, it.z - u];
    case '-x': return [it.x - v, it.z + u];
    default: return [it.x + u, it.z + v];
  }
}
function lrect(it, u0, u1, v0, v1) {
  const a = lw(it, u0, v0), b = lw(it, u1, v1);
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
}
const T = 0.18;
function roomShell(it) {
  const hw = it.w / 2, hd = it.d / 2, du = it.door || 0, dw = it.dw || 1.3, h = it.h;
  const parts = [
    [-hw, hw, -hd, -hd + T, 0, h, it.wall, 1], [-hw, -hw + T, -hd, hd, 0, h, it.wall, 1], [hw - T, hw, -hd, hd, 0, h, it.wall, 1],
  ];
  if (it.open) parts.push([-hw, -hw + 0.3, hd - T, hd, 0, h, it.wall, 1], [hw - 0.3, hw, hd - T, hd, 0, h, it.wall, 1], [-hw, hw, hd - T, hd, h - 0.5, h, it.wall, 0]);
  else parts.push([-hw, du - dw / 2, hd - T, hd, 0, h, it.wall, 1], [du + dw / 2, hw, hd - T, hd, 0, h, it.wall, 1], [du - dw / 2, du + dw / 2, hd - T, hd, 2.15, h, it.wall, 0]);
  parts.push([-hw + T, hw - T, -hd + T, hd - T, 0, 0.04, it.floor || '#4a3626', 0]);
  return parts;
}
// Furniture by room type. Each entry: [u0,u1,v0,v1,y0,y1,colour,collide,kind]
function furnish(it, r) {
  const hw = it.w / 2, hd = it.d / 2, F = [], lit = it.lit;
  const glow = c => (lit ? [c, 'glow'] : ['#151a20', 'lambert']);
  it.hide = []; it.weapons = it.weapons || [];
  const add = (u0, u1, v0, v1, y0, y1, c, col = 0, kind = 'lambert') => F.push([u0, u1, v0, v1, y0, y1, c, col, kind]);
  if (it.kind === 'house') {
    const couch = ['#5a3a3a', '#3a4a5a', '#4a5a3a', '#6a5a4a'][(r() * 4) | 0];
    add(-3.4, -0.9, -3.3, -2.5, 0, 0.45, couch, 1); add(-3.4, -0.9, -3.32, -3.05, 0.45, 0.9, couch);
    add(-2.6, -1.6, -2.0, -1.4, 0.35, 0.42, '#4a3020', 1);
    add(-2.7, -1.5, 0.55, 0.75, 0, 0.55, '#2a2a2a', 1); const tv = glow('#3a5aa8'); add(-2.6, -1.6, 0.6, 0.66, 0.6, 1.25, tv[0], 0, tv[1]);
    add(hw - 0.98, hw - T, -hd + T, 0.6, 0, 0.9, '#d8d4cc', 1); add(hw - 1.0, hw - T, -hd + T, 0.6, 0.9, 0.95, '#3a3a3a');
    add(hw - 0.98, hw - T, 0.7, 1.7, 0, 1.9, '#e8e8e8', 1);
    add(0.4, 1.8, -1.2, 0.2, 0.72, 0.78, '#6a4a2a', 1);
    add(-0.7, -0.35, -hd + T, -hd + 0.55, 0, 0.6, '#3a2a1a'); const lamp = glow('#ffd890'); add(-0.62, -0.43, -hd + 0.25, -hd + 0.45, 0.6, 0.9, lamp[0], 0, lamp[1]);
    add(-1.2, 1.2, -1.6, 1.6, 0.04, 0.05, ['#5a2a2a', '#2a3a5a', '#4a4a2a'][(r() * 3) | 0]);
    if (lit) { const c = glow('#fff0c0'); add(-0.3, 0.3, -0.3, 0.3, it.h - 0.08, it.h - 0.02, c[0], 0, c[1]); }
    it.weapons.push({ w: 'cleaver', u: hw - 0.55, v: -1.6, y: 0.97, rz: Math.PI / 2, ry: 0.3 });
    it.hide.push([-hw + 0.6, hd - 0.7], [hw - 1.6, hd - 0.7]);
    if (it.party) {
      for (let i = 0; i < 6; i++) add(-1.5 + i * 0.6, -1.45 + i * 0.6, -0.9, -0.85, 0.78, 0.9, '#c0141c');
      it.hide.push([0, -1.0], [-2, -2.0], [1.5, 1.2]);
    }
  } else if (it.kind === 'cabin') {
    for (const s of [-1, 1]) {
      const u0 = s < 0 ? -hw + T : hw - 1.1, u1 = s < 0 ? -hw + 1.1 : hw - T;
      add(u0, u1, -hd + T, 0.7, 0.35, 0.55, '#7a8a9a', 1); add(u0, u1, -hd + T, 0.7, 1.25, 1.45, '#8a7a6a');
      for (const vv of [-hd + T, 0.62]) add(s < 0 ? u0 : u1 - 0.08, s < 0 ? u0 + 0.08 : u1, vv, vv + 0.08, 0, 1.8, '#3a2a1a');
    }
    add(-0.45, 0.45, -hd + T, -hd + 0.75, 0, 0.45, '#5a4028', 1);
    const l = glow('#ffb85a'); add(-0.08, 0.08, -hd + 0.4, -hd + 0.56, 0.45, 0.68, l[0], 0, l[1]);
    it.hide.push([-hw + 0.7, hd - 0.6], [hw - 0.7, hd - 0.6]);
    if (it.machete) it.weapons.push({ w: 'machete', u: 0, v: -hd + 0.48, y: 0.5, rz: Math.PI / 2, ry: Math.PI / 2 });
  } else if (it.kind === 'lodge') {
    for (const uc of [-3, 3]) {
      add(uc - 0.6, uc + 0.6, -2.8, 2.2, 0.72, 0.8, '#6a4a2a', 1);
      add(uc - 1.1, uc - 0.8, -2.8, 2.2, 0.42, 0.48, '#5a3a20', 1); add(uc + 0.8, uc + 1.1, -2.8, 2.2, 0.42, 0.48, '#5a3a20', 1);
    }
    add(-1.1, 1.1, -hd + T, -hd + 0.6, 0, 1.7, '#55524c', 1); add(-0.6, 0.6, -hd + 0.55, -hd + 0.62, 0.15, 0.85, '#ff7a20', 0, 'glow');
    add(hw - 2.2, hw - T, -hd + T, -hd + 1.0, 0, 0.9, '#c8c4bc', 1); add(hw - 2.2, hw - T, -hd + T, -hd + 1.0, 0.9, 0.95, '#3a3a3a');
    if (lit) for (const uc of [-3, 3]) { const c = glow('#ffe0a0'); add(uc - 0.2, uc + 0.2, -0.4, 0.0, it.h - 0.1, it.h - 0.02, c[0], 0, c[1]); }
    it.weapons.push({ w: 'cleaver', u: hw - 1.0, v: -hd + 0.6, y: 0.97, rz: Math.PI / 2, ry: 0.2 });
    it.hide.push([-hw + 0.6, hd - 0.6], [hw - 0.6, hd - 0.6], [-hw + 0.6, -hd + 0.6]);
    it.fireplace = lw(it, 0, -hd + 0.9);
  } else if (it.kind === 'garage') {
    add(-hw + T, hw - T, -hd + T, -hd + 0.75, 0, 0.9, '#6a5038', 1); add(-hw + T, hw - T, -hd + T, -hd + 0.25, 0.9, 2.1, '#5a4a3a');
    add(-hw + T, -hw + 0.6, -1.5, 1.5, 0, 1.8, '#4a4a4a', 1);
    add(-0.8, 0.6, -0.5, 1.2, 0.04, 0.05, '#1a1a1a');
    it.weapons.push({ w: 'chainsaw', u: -0.8, v: -hd + 0.5, y: 0.98, rz: 0, ry: Math.PI / 2 });
    it.weapons.push({ w: 'sledge', u: 1.0, v: -hd + 0.5, y: 0.96, rz: Math.PI / 2, ry: Math.PI / 2 });
    it.hide.push([hw - 0.7, -hd + 1.2]);
  } else if (it.kind === 'shed') {
    add(-hw + T, hw - T, -hd + T, -hd + 0.6, 0, 0.8, '#5a4a38', 1);
    it.weapons.push({ w: it.tool || 'fork', u: hw - 0.45, v: -0.2, y: 0.2, rx: Math.PI / 2 - 0.15, ry: 0, rz: 0 });
    it.hide.push([-hw + 0.6, hd - 0.6]);
  } else if (it.kind === 'boathouse') {
    for (const uc of [-1.4, 1.4]) { add(uc - 0.45, uc + 0.45, -1.8, 1.8, 0.5, 0.85, '#8a2a1a'); add(uc - 0.5, uc + 0.5, -1.6, 1.6, 0, 0.5, '#3a2a1a', 1); }
    add(-hw + T, hw - T, -hd + T, -hd + 0.65, 0, 0.9, '#5a4028', 1);
    it.weapons.push({ w: 'chainsaw', u: 0, v: -hd + 0.45, y: 0.98, rz: 0, ry: Math.PI / 2 });
    it.hide.push([-hw + 0.6, -hd + 1.0]);
  }
  return F;
}
function addRoom(L, it, r) {
  it.t = 'room';
  it.furn = furnish(it, r);
  for (const p of roomShell(it)) if (p[7]) { const b = lrect(it, p[0], p[1], p[2], p[3]); addBox(L, b.x0, b.z0, b.x1, b.z1, p[5]); }
  for (const f of it.furn) if (f[7]) { const b = lrect(it, f[0], f[1], f[2], f[3]); addBox(L, b.x0, b.z0, b.x1, b.z1, f[5]); }
  const door = lw(it, it.door || 0, it.d / 2 + 1.3);
  for (const [u, v] of it.hide) { const [x, z] = lw(it, u, v); L.hide.push({ x, z, door: { x: door[0], z: door[1] } }); }
  for (const w of it.weapons) { const [x, z] = lw(it, w.u, w.v); L.weapons.push({ w: w.w, x, y: w.y, z, rx: w.rx || 0, ry: (w.ry || 0) + faceYaw(it.face), rz: w.rz || 0 }); }
  L.items.push(it);
  return it;
}
function faceYaw(f) { return f === '-z' ? Math.PI : f === '+x' ? Math.PI / 2 : f === '-x' ? -Math.PI / 2 : 0; }

// ---------- planning ----------
const layouts = {};
export function getLayout(id) { return layouts[id] || (layouts[id] = id === 'camp' ? planCamp() : planHood()); }

function freeSpot(L, r, x, z, pad) {
  if (Math.abs(x) > L.half - 1 || Math.abs(z) > L.half - 1) return false;
  for (const b of L.boxes) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return false;
  for (const c of L.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return false;
  for (const k of L.keepOut) if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) return false;
  return true;
}
function newLayout(id, half) { return { id, half, boxes: [], circles: [], camper: [], killer: [], items: [], keepOut: [], hide: [], weapons: [] }; }

function planHood() {
  const r = mulberry(1337);
  const L = newLayout('hood', 44);
  const walls = ['#6f7b86', '#8a7560', '#5f6e5a', '#7d6a7d', '#9a9480', '#5b6670', '#7a5348', '#6b6f5a'];
  const roofs = ['#2a2624', '#3a2a24', '#262b30', '#33302a'];
  L.items.push({ t: 'roads' });
  let n = 0;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = sx * [10, 21, 32][i];
    // Front row: houses you can walk into, facing the road.
    {
      const z = sz * 14, face = sz < 0 ? '+z' : '-z';
      if (sx < 0 && sz > 0 && i === 1) {
        L.items.push({ t: 'park', x, z });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; addCircle(L, x + Math.cos(a) * 2.3, z + Math.sin(a) * 2.3, 0.15); }
        L.camper.push({ x: x + 3.5, z }, { x: x - 3.5, z }, { x, z: z - 3.5 });
        L.keepOut.push({ x, z, r: 5 });
      } else {
        const party = sx > 0 && sz < 0 && i === 1;
        const it = addRoom(L, { kind: 'house', x, z, w: 8, d: 7, h: 3.1, face, door: -1.6, wall: walls[n % walls.length], roof: roofs[n % roofs.length], lit: party || r() < 0.6, party, chim: r() < 0.5, pumpkin: r() < 0.5 }, r);
        const porch = lw(it, -1.6, 3.5 + 1.9);
        L.camper.push({ x: porch[0], z: porch[1] });
        if (party) { for (const [u, v] of [[0, 0], [-1.5, -1.5], [1.2, 1.0], [-2.5, 1.5]]) { const p = lw(it, u, v); L.camper.push({ x: p[0], z: p[1] }); } L.party = { x, z }; }
        else if (it.lit) { const p = lw(it, -2, -1.6); L.camper.push({ x: p[0], z: p[1] }); }
        // front yard: walkway, driveway, bushes, mailbox
        const dw = lw(it, 2.4, 3.5 + 3.5), mb = lw(it, 3.9, 3.5 + 6.4);
        L.items.push({ t: 'yard', it, drive: dw, mailbox: mb });
        addCircle(L, mb[0], mb[1], 0.15);
        for (const u of [-3.4, 0.6, 3.2]) { const b = lw(it, u, 3.5 + 0.7); L.items.push({ t: 'bush', x: b[0], z: b[1], s: 0.8 + r() * 0.5 }); addCircle(L, b[0], b[1], 0.45); }
        L.keepOut.push({ x: porch[0], z: porch[1], r: 2.5 }, { x: dw[0], z: dw[1], r: 3.5 });
      }
    }
    // Back row: solid houses, plus two lots with an open garage and a tool shed.
    {
      const z = sz * 31, face = sz < 0 ? '+z' : '-z';
      if (i === 0 && sx === sz) {
        const g = addRoom(L, { kind: 'garage', x: x - sx * 1.5, z, w: 4.6, d: 6, h: 2.8, face, open: true, wall: '#6a6a66', roof: '#2a2a2a', lit: false }, r);
        addRoom(L, { kind: 'shed', x: x + sx * 3.2, z: z + sz * 1.5, w: 3, d: 3, h: 2.4, face, wall: '#5a4630', roof: '#2a2420', lit: false, tool: sx > 0 ? 'fork' : 'axe' }, r);
        L.keepOut.push({ x: g.x, z: g.z + (sz < 0 ? 4 : -4), r: 3 });
      } else {
        const w = 8, d = 7, h = 3.1;
        L.items.push({ t: 'house', x, z, w, d, h, face: sz < 0 ? 1 : -1, color: walls[(n + 3) % walls.length], roof: roofs[(n + 1) % roofs.length], lit: r() < 0.5, chim: r() < 0.5 });
        addBox(L, x - w / 2, z - d / 2, x + w / 2, z + d / 2, h);
      }
    }
    n++;
  }
  // Back-yard fences with gaps, a pool and a swing set.
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    let x = sx * 5;
    while (Math.abs(x) < 40) {
      const len = 4 + r() * 4, x2 = x + sx * len;
      L.items.push({ t: 'fence', x0: x, x1: x2, z: sz * 22.5 });
      addBox(L, x, sz * 22.5 - 0.15, x2, sz * 22.5 + 0.15, 1.1);
      x = x2 + sx * (2 + r() * 2);
    }
  }
  L.items.push({ t: 'pool', x: 26, z: 19 }); addCircle(L, 26, 19, 2.4);
  L.items.push({ t: 'swings', x: -15, z: -19 }); addBox(L, -16.2, -19.2, -13.8, -18.8, 2.2);
  L.items.push({ t: 'woodpile', x: 15, z: 25, ry: 0 }); addBox(L, 14, 24.6, 16, 25.4, 1);
  L.weapons.push({ w: 'axe', x: 16.8, y: 0.62, z: 25.6, rx: -Math.PI / 2 + 0.25, ry: 0, rz: 0 });
  L.items.push({ t: 'stump', x: 16.8, z: 25.6 }); addCircle(L, 16.8, 25.6, 0.35);
  // Parked cars along the main road.
  const carCols = ['#7a1f1f', '#1f3f6a', '#cfcfcf', '#2a2a2a', '#6a6a2a', '#3f6a4f'];
  for (let i = 0; i < 8; i++) {
    let x = (r() * 2 - 1) * 36; if (Math.abs(x) < 8) x += Math.sign(x || 1) * 9;
    const z = (i % 2 ? 1 : -1) * 2.7;
    L.items.push({ t: 'car', x, z, ry: 0, color: carCols[i % carCols.length], lights: i === 3 });
    addBox(L, x - 2.1, z - 0.9, x + 2.1, z + 0.9, 1.5);
    L.hide.push({ x, z: z + Math.sign(z) * 1.4, door: null });
  }
  for (let i = 0; i < 3; i++) {
    const z = (r() * 2 - 1) * 34; if (Math.abs(z) < 8) continue;
    const x = (i % 2 ? 1 : -1) * 2.7;
    L.items.push({ t: 'car', x, z, ry: Math.PI / 2, color: carCols[(i + 3) % carCols.length] });
    addBox(L, x - 0.9, z - 2.1, x + 0.9, z + 2.1, 1.5);
  }
  // Street lights and power poles.
  for (let v = -35; v <= 35; v += 14) {
    if (Math.abs(v) < 6) continue;
    for (const s of [-1, 1]) {
      L.items.push({ t: 'lamp', x: v, z: s * 5.2, ax: 0, az: -s * 0.9 }); addCircle(L, v, s * 5.2, 0.15);
      L.items.push({ t: 'lamp', x: s * 5.2, z: v + 7, ax: -s * 0.9, az: 0 }); addCircle(L, s * 5.2, v + 7, 0.15);
    }
  }
  for (let v = -40; v <= 40; v += 16) { L.items.push({ t: 'pole', x: v + 4, z: 6.6, next: v + 20 <= 44 ? v + 20 : null }); addCircle(L, v + 4, 6.6, 0.18); }
  for (let i = 0; i < 10; i++) {
    const x = (r() * 2 - 1) * 38, z = (r() < 0.5 ? -1 : 1) * (6.2 + r() * 0.5);
    if (Math.abs(x) < 6 || !freeSpot(L, r, x, z, 0.8)) continue;
    L.items.push({ t: 'can', x, z }); addCircle(L, x, z, 0.35);
  }
  L.weapons.push({ w: 'machete', x: -20.6, y: 0.56, z: 16, rx: 0, ry: 0.4, rz: Math.PI / 2 });
  L.killer.push({ x: -38, z: -38 }, { x: 38, z: -38 }, { x: -38, z: 38 }, { x: 38, z: 38 }, { x: 0, z: -41 }, { x: 0, z: 41 }, { x: -41, z: 0 }, { x: 41, z: 0 });
  for (const k of L.killer) L.keepOut.push({ x: k.x, z: k.z, r: 3 });
  for (let i = 0, made = 0; i < 900 && made < 80; i++) {
    const x = (r() * 2 - 1) * 42, z = (r() * 2 - 1) * 42;
    if (Math.abs(z) < 7.5 || Math.abs(x) < 7.5) continue;
    if (!freeSpot(L, r, x, z, 2)) continue;
    const s = 0.8 + r() * 0.7;
    L.items.push({ t: r() < 0.6 ? 'oak' : 'tree', x, z, s, h: 6 + r() * 4, c: r() < 0.5 ? '#14261a' : '#1a2f1c' });
    addCircle(L, x, z, 0.3 * s);
    made++;
  }
  for (let v = -30; v <= 30; v += 15) L.camper.push({ x: v + 2, z: 6.5 }, { x: -6.5, z: v - 2 });
  return finalize(L);
}

function planCamp() {
  const r = mulberry(4242);
  const L = newLayout('camp', 46);
  L.items.push({ t: 'lake', x: 0, z: -25, r: 13 });
  addCircle(L, 0, -25, 13.2);
  L.items.push({ t: 'fire', x: 0, z: 6 });
  addCircle(L, 0, 6, 0.9);
  L.keepOut.push({ x: 0, z: 6, r: 8.5 }, { x: 0, z: -25, r: 17 }, { x: 0, z: -10, r: 3 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, x = Math.cos(a) * 3, z = 6 + Math.sin(a) * 3;
    L.items.push({ t: 'log', x, z, ry: -a }); addCircle(L, x, z, 0.4);
  }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; L.items.push({ t: 'lanternpole', x: Math.cos(a) * 7.5, z: 6 + Math.sin(a) * 7.5, nx: Math.cos(a + Math.PI / 3) * 7.5, nz: 6 + Math.sin(a + Math.PI / 3) * 7.5 }); addCircle(L, Math.cos(a) * 7.5, 6 + Math.sin(a) * 7.5, 0.15); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; L.camper.push({ x: Math.cos(a) * 4.6, z: 6 + Math.sin(a) * 4.6 }); }
  const cabins = [[-22, 3, '+x'], [-20, 18, '+x'], [-8, 28, '-z'], [6, 30, '-z'], [20, 23, '-z'], [27, 9, '-x'], [25, -6, '-x']];
  cabins.forEach(([x, z, face], i) => {
    const alongZ = face === '+x' || face === '-x';
    const it = addRoom(L, { kind: 'cabin', x, z, w: 6, d: 5, h: 2.8, face, door: 0, wall: '#4a3322', roof: '#2a2420', lit: r() < 0.65, machete: i === 2 }, r);
    const porch = lw(it, 0, 2.5 + 1.8);
    L.camper.push({ x: porch[0], z: porch[1] });
    if (it.lit) { const p = lw(it, 0, -0.5); L.camper.push({ x: p[0], z: p[1] }); }
    L.keepOut.push({ x: porch[0], z: porch[1], r: 2.2 });
    void alongZ;
  });
  const lodge = addRoom(L, { kind: 'lodge', x: -28, z: -14, w: 12, d: 9, h: 3.8, face: '+x', door: 0, dw: 1.8, wall: '#4f3826', roof: '#262220', lit: true }, r);
  L.fireplace = lodge.fireplace;
  for (const [u, v] of [[-3, 0], [3, 1], [0, 2.5]]) { const p = lw(lodge, u, v); L.camper.push({ x: p[0], z: p[1] }); }
  L.keepOut.push({ x: -21, z: -14, r: 3 });
  addRoom(L, { kind: 'boathouse', x: 10, z: -11.5, w: 6, d: 5, h: 2.8, face: '-z', open: true, wall: '#3e3020', roof: '#24201c', lit: false }, r);
  addRoom(L, { kind: 'shed', x: -30, z: 2, w: 3, d: 3, h: 2.4, face: '+x', wall: '#5a4630', roof: '#2a2420', lit: false, tool: 'fork' }, r);
  L.items.push({ t: 'outhouse', x: 31, z: -22 }); addBox(L, 30.2, -22.8, 31.8, -21.2, 2.4);
  L.hide.push({ x: 31, z: -20.6, door: null });
  const tentCols = ['#2e6b4a', '#a04a2a', '#2f4f86', '#8a7a2a', '#6a2f6a', '#2a6a6a'];
  [[-9, 16], [9, 17], [-13, 3], [13, 1], [-7, -4], [8, -4]].forEach(([x, z], i) => {
    L.items.push({ t: 'tent', x, z, c: tentCols[i] }); addBox(L, x - 1.1, z - 1.1, x + 1.1, z + 1.1, 1.7);
    L.camper.push({ x: x + 1.8, z: z + 0.5 }); L.hide.push({ x: x - 1.6, z: z - 1.2, door: null });
  });
  [[16, -15], [-14, -7], [3, 19]].forEach(([x, z]) => { L.items.push({ t: 'table', x, z }); addBox(L, x - 1, z - 0.8, x + 1, z + 0.8, 0.8); });
  L.weapons.push({ w: 'machete', x: 3.2, y: 0.84, z: 19, rx: 0, ry: 1.2, rz: Math.PI / 2 });
  [[20, -19], [23, -21]].forEach(([x, z]) => { L.items.push({ t: 'target', x, z }); addCircle(L, x, z, 0.6); });
  L.items.push({ t: 'woodpile', x: 16, z: -1, ry: Math.PI / 2 }); addBox(L, 15.6, -2, 16.4, 0, 1);
  L.items.push({ t: 'stump', x: 17.4, z: 1.2 }); addCircle(L, 17.4, 1.2, 0.35);
  L.weapons.push({ w: 'axe', x: 17.4, y: 0.62, z: 1.2, rx: -Math.PI / 2 + 0.25, ry: 0.5, rz: 0 });
  L.weapons.push({ w: 'sledge', x: 16.9, y: 0.3, z: -0.6, rx: Math.PI / 2 - 0.3, ry: -Math.PI / 2, rz: 0 });
  L.hide.push({ x: 15.2, z: -1, door: null });
  L.items.push({ t: 'totem', x: -5, z: -9 }); addCircle(L, -5, -9, 0.4);
  L.items.push({ t: 'flag', x: 5, z: -8 }); addCircle(L, 5, -8, 0.12);
  L.items.push({ t: 'sign', x: 0, z: 38 });
  L.items.push({ t: 'dock', x: 0, z: -11.5 });
  L.camper.push({ x: 2, z: -9.5 }, { x: -2, z: -9.5 });
  L.items.push({ t: 'canoe', x: -6, z: -11.4 });
  for (let k = 0; k < 6; k++) L.keepOut.push({ x: Math.cos(k) * 7.5, z: 6 + Math.sin(k) * 7.5, r: 1 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, rr = 40;
    let x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    for (let t = 0; t < 10 && !freeSpot(L, r, x, z, 0.8); t++) { x *= 0.97; z *= 0.97; }
    L.killer.push({ x, z }); L.keepOut.push({ x, z, r: 3 });
  }
  for (let i = 0; i < 40; i++) { const a = r() * 6.283, d = 13.3 + r() * 1.2; L.items.push({ t: 'reed', x: Math.cos(a) * d, z: -25 + Math.sin(a) * d }); }
  for (let i = 0, made = 0; i < 300 && made < 18; i++) { const x = (r() * 2 - 1) * 40, z = (r() * 2 - 1) * 40; if (!freeSpot(L, r, x, z, 1.5)) continue; L.items.push({ t: 'rock', x, z, s: 0.4 + r() * 0.7 }); addCircle(L, x, z, 0.5); made++; }
  for (let i = 0, made = 0; i < 5000 && made < 340; i++) {
    const x = (r() * 2 - 1) * 45, z = (r() * 2 - 1) * 45;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > 34;
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

const G_SPH = new THREE.IcosahedronGeometry(0.5, 1);
function room(B, it) {
  const wb = (u0, u1, v0, v1, y0, y1, c, kind) => {
    const b = lrect(it, u0, u1, v0, v1);
    B.box(c, b.x1 - b.x0, y1 - y0, b.z1 - b.z0, (b.x0 + b.x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2, 0, kind);
  };
  for (const p of roomShell(it)) wb(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
  for (const f of it.furn) wb(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[8]);
  const hw = it.w / 2, hd = it.d / 2, h = it.h, du = it.door || 0;
  const alongX = it.face === '+z' || it.face === '-z';
  B.add(G_GABLE, it.roof, it.x, h, it.z, alongX ? it.d + 0.7 : it.w + 0.7, it.kind === 'lodge' ? 2.2 : 1.7, alongX ? it.w + 0.7 : it.d + 0.7, alongX ? Math.PI / 2 : 0);
  // trim, windows, porch
  wb(-hw - 0.03, hw + 0.03, -hd - 0.03, hd + 0.03, 0, 0.25, '#2a2622');
  const win = it.lit ? ['#b9823a', 'glow'] : ['#0f141b', 'lambert'];
  if (!it.open) {
    for (const u of [du + 1.6, du + 3]) if (u + 0.6 < hw - 0.2) {
      wb(u - 0.55, u + 0.55, hd - 0.02, hd + 0.03, 1.2, 2.1, win[0], win[1]);
      wb(u - 0.03, u + 0.03, hd + 0.02, hd + 0.05, 1.2, 2.1, '#1a120c'); wb(u - 0.55, u + 0.55, hd + 0.02, hd + 0.05, 1.62, 1.68, '#1a120c');
      wb(u - 0.65, u + 0.65, hd + 0.02, hd + 0.06, 1.1, 1.2, '#2a2420');
    }
    for (const s of [-1, 1]) {
      const uu = s * hw;
      wb(Math.min(uu, uu + s * 0.05), Math.max(uu, uu + s * 0.05), -0.6, 0.6, 1.2, 2.1, win[0], win[1]);
      wb(Math.min(uu, uu + s * 0.07), Math.max(uu, uu + s * 0.07), -0.03, 0.03, 1.2, 2.1, '#1a120c');
    }
    wb(du - dw2(it) - 0.08, du - dw2(it), hd - 0.02, hd + 0.05, 0, 2.2, '#2a1a10');
    wb(du + dw2(it), du + dw2(it) + 0.08, hd - 0.02, hd + 0.05, 0, 2.2, '#2a1a10');
    // the door itself, swung open against the inside wall
    wb(du + dw2(it) + 0.02, du + dw2(it) + 0.08, hd - 1.3, hd - T, 0, 2.1, it.kind === 'house' ? '#5a2a1a' : '#3a2a1a');
  }
  if (it.kind === 'house') {
    wb(du - 1.6, du + 1.6, hd, hd + 1.8, 0, 0.22, '#45403a');
    for (const u of [du - 1.5, du + 1.5]) wb(u - 0.08, u + 0.08, hd + 1.6, hd + 1.76, 0, 2.6, '#d8d0c0');
    wb(du - 1.6, du + 1.6, hd + 0.02, hd + 1.8, 2.55, 2.68, '#3a332c');
    wb(du + 0.9, du + 1.0, hd + 1.65, hd + 1.72, 0.8, 0.85, '#d8d0c0'); wb(du - 1.55, du - 0.85, hd + 1.66, hd + 1.72, 0.8, 0.85, '#d8d0c0');
    wb(du + 0.75, du + 0.9, hd + 0.04, hd + 0.12, 2.0, 2.2, '#ffd890', 'glow');
    if (it.chim) wb(hw - 1.4, hw - 0.7, -0.4, 0.3, h, h + 2.1, '#5a3a32');
    if (it.pumpkin) for (const u of [du - 1.2, du + 1.25]) {
      const [x, z] = lw(it, u, hd + 1.6);
      B.add(G_SPH, '#d4661a', x, 0.38, z, 0.36, 0.3, 0.36);
      const [fx, fz] = lw(it, u, hd + 1.79);
      B.box('#ffb020', 0.14, 0.06, 0.14, fx, 0.4, fz, 0, 'glow');
    }
    if (it.party) {
      const cols = ['#ff3b5c', '#3bd1ff', '#ffe03b', '#7dff5a', '#d35bff'];
      for (let i = 0; i <= 18; i++) { const u = -hw + (i / 18) * it.w; const [x, z] = lw(it, u, hd + 0.35); B.box(cols[i % 5], 0.1, 0.12, 0.1, x, h - 0.05 - Math.sin((i / 18) * Math.PI * 3) * 0.1, z, 0, 'glow'); }
    }
  }
}
const dw2 = it => (it.dw || 1.3) / 2;
function yard(B, y) {
  const it = y.it;
  const wk = (u0, u1, v0, v1, c, yy = 0.02) => { const b = lrect(it, u0, u1, v0, v1); B.box(c, b.x1 - b.x0, yy, b.z1 - b.z0, (b.x0 + b.x1) / 2, yy / 2, (b.z0 + b.z1) / 2); };
  wk(-2.2, -1.0, 3.5 + 1.8, 3.5 + 6.6, '#55524c', 0.03);
  wk(1.3, 3.6, 3.5 + 0.2, 3.5 + 6.6, '#4a4844', 0.025);
  const [mx, mz] = y.mailbox;
  B.box('#3a2a1a', 0.08, 1.05, 0.08, mx, 0.52, mz); B.box(['#1f3f6a', '#7a1f1f', '#2a2a2a'][Math.abs(Math.round(mx)) % 3], 0.22, 0.2, 0.42, mx, 1.12, mz);
  // white picket fence along the front with gaps for the path and the driveway
  for (const [u0, u1] of [[-3.95, -2.4], [-0.8, 1.1], [3.8, 3.95]]) {
    const b = lrect(it, u0, u1, 3.5 + 6.7, 3.5 + 6.78);
    B.box('#e8e4dc', b.x1 - b.x0 + 0.01, 0.07, b.z1 - b.z0 + 0.01, (b.x0 + b.x1) / 2, 0.65, (b.z0 + b.z1) / 2);
    for (let u = u0; u <= u1; u += 0.32) { const [x, z] = lw(it, u, 3.5 + 6.74); B.box('#e8e4dc', 0.08, 0.85, 0.04, x, 0.42, z); }
  }
}
function oak(B, it) {
  const { x, z, s, h } = it;
  B.add(G_CYL, '#3a2a1c', x, h * 0.25, z, 0.4 * s, h * 0.5, 0.4 * s);
  B.add(G_SPH, '#1d3220', x, h * 0.6, z, 3.4 * s, 2.6 * s, 3.4 * s);
  B.add(G_SPH, '#203a24', x + 0.6 * s, h * 0.72, z - 0.4 * s, 2.4 * s, 2 * s, 2.4 * s);
}
function wire(B, x0, y0, z0, x1, y1, z1, c, th = 0.03, kind = 'lambert') {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
  B.add(G_BOX, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, th, th, len, Math.atan2(dx, dz), kind, -Math.asin(dy / len), 0);
}
let signTex = null;
function makeSign(group, x, z) {
  if (!signTex) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d'); g.fillStyle = '#3b2716'; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#1e140b'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 150);
    g.fillStyle = '#e8d8b0'; g.font = '700 54px Georgia, serif'; g.textAlign = 'center'; g.fillText('CAMP CHEETWATER', 256, 76);
    g.font = '600 26px Georgia, serif'; g.fillText('est. 1979 · lights out at ten', 256, 122);
    g.fillStyle = 'rgba(110,5,10,.9)'; g.fillRect(380, 90, 9, 50); g.beginPath(); g.arc(384, 140, 7, 0, 7); g.fill();
    signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.25), new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide }));
  m.position.set(x, 2.3, z); m.rotation.y = Math.PI; group.add(m);
}
let fogTex = null;
function lakeFog(group, it) {
  if (!fogTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(200,210,230,.5)'); gr.addColorStop(1, 'rgba(200,210,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    fogTex = new THREE.CanvasTexture(c);
  }
  const list = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0.35 }));
    m.position.set(it.x + (Math.random() - 0.5) * 16, 0.3 + i * 0.12, it.z + (Math.random() - 0.5) * 16); group.add(m); list.push({ m, a: Math.random() * 6, x: m.position.x, z: m.position.z });
  }
  return t => { for (const f of list) { f.m.position.x = f.x + Math.sin(t * 0.05 + f.a) * 3; f.m.position.z = f.z + Math.cos(t * 0.04 + f.a) * 2; } };
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
  const out = { group, layout: L, party: null };
  for (const it of L.items) {
    switch (it.t) {
      case 'roads': buildRoads(B, L); break;
      case 'room': room(B, it); break;
      case 'house': house(B, it); break;
      case 'cabin': cabin(B, it); break;
      case 'yard': yard(B, it); break;
      case 'tree': tree(B, it); break;
      case 'oak': oak(B, it); break;
      case 'bush': B.add(G_SPH, '#1c3a20', it.x, 0.4 * it.s, it.z, 1.1 * it.s, 0.9 * it.s, 1.1 * it.s); break;
      case 'car': car(B, it);
        if (it.lights) { B.box('#fff4c8', 0.06, 0.12, 0.3, it.x + 2.11, 0.8, it.z - 0.55, 0, 'glow'); B.box('#fff4c8', 0.06, 0.12, 0.3, it.x + 2.11, 0.8, it.z + 0.55, 0, 'glow'); B.add(G_CONE, '#fff1c4', it.x + 6, 0.8, it.z, 3, 8, 3, 0, 'beam', 0, Math.PI / 2); }
        break;
      case 'lamp': lamp(B, it); break;
      case 'pole':
        B.add(G_CYL, '#3a2a1a', it.x, 4, it.z, 0.28, 8, 0.28); B.box('#3a2a1a', 1.6, 0.12, 0.12, it.x, 7.4, it.z);
        if (it.next !== null) for (const o of [-0.7, 0, 0.7]) wire(B, it.x + o, 7.5, it.z, it.next + 4 + o, 7.5, it.z, '#0a0a0a', 0.025);
        break;
      case 'fence': {
        const len = Math.abs(it.x1 - it.x0), cx = (it.x0 + it.x1) / 2;
        for (let k = 0; k < len / 0.2; k++) B.box(k % 2 ? '#4a3a2a' : '#544230', 0.19, 1.6, 0.05, Math.min(it.x0, it.x1) + k * 0.2 + 0.1, 0.8, it.z);
        B.box('#3a2a1a', len, 0.08, 0.08, cx, 1.2, it.z + 0.05); B.box('#3a2a1a', len, 0.08, 0.08, cx, 0.4, it.z + 0.05);
        break;
      }
      case 'can': B.add(G_CYL, '#3a4038', it.x, 0.5, it.z, 0.6, 1, 0.6); B.add(G_CYL, '#2a302a', it.x, 1.02, it.z, 0.66, 0.06, 0.66); B.add(G_SPH, '#151515', it.x + 0.5, 0.25, it.z, 0.5, 0.5, 0.45); break;
      case 'park': {
        const { x, z } = it;
        B.add(G_CYL, '#5a5248', x, 0.15, z, 5.4, 0.3, 5.4);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.add(G_CYL, '#e8e2d8', x + Math.cos(a) * 2.3, 1.5, z + Math.sin(a) * 2.3, 0.2, 2.7, 0.2); }
        B.add(G_CONE, '#3a2a2a', x, 3.6, z, 6.2, 1.6, 6.2);
        B.box('#4a3a2a', 2, 0.1, 0.5, x + 4.5, 0.5, z + 2); B.box('#4a3a2a', 2, 0.1, 0.5, x - 4.5, 0.5, z - 2);
        B.box('#5a4028', 1.8, 0.08, 0.9, x - 0.6, 0.5, z + 2.0); B.box('#4a3020', 0.1, 0.5, 0.8, x - 1.3, 0.25, z + 2); B.box('#4a3020', 0.1, 0.5, 0.8, x + 0.1, 0.25, z + 2);
        B.box('#6a2a2a', 0.1, 2.4, 0.1, x + 4, 1.2, z - 3); B.box('#6a2a2a', 0.1, 2.4, 0.1, x + 6, 1.2, z - 3); B.box('#6a2a2a', 2.1, 0.1, 0.1, x + 5, 2.4, z - 3);
        B.box('#222', 0.5, 0.05, 0.25, x + 4.6, 0.6, z - 3); B.box('#222', 0.5, 0.05, 0.25, x + 5.4, 0.6, z - 3);
        B.box('#b8b8b8', 0.6, 0.06, 2.6, x - 5, 0.9, z - 3.5, 0, 'shiny'); B.box('#c0392b', 0.8, 1.8, 0.8, x - 5, 0.9, z - 5);
        break;
      }
      case 'pool':
        B.add(G_CYL, '#5a7a9a', it.x, 0.55, it.z, 4.8, 1.1, 4.8); B.add(G_CYL, '#0c2a3a', it.x, 1.1, it.z, 4.5, 0.02, 4.5, 0, 'shiny');
        break;
      case 'swings':
        B.box('#2a5a8a', 0.08, 2.2, 0.08, it.x - 1.2, 1.1, it.z); B.box('#2a5a8a', 0.08, 2.2, 0.08, it.x + 1.2, 1.1, it.z); B.box('#2a5a8a', 2.5, 0.08, 0.08, it.x, 2.2, it.z);
        for (const o of [-0.5, 0.5]) { B.box('#888', 0.02, 1.6, 0.02, it.x + o, 1.4, it.z); B.box('#222', 0.45, 0.04, 0.2, it.x + o, 0.6, it.z); }
        break;
      case 'woodpile':
        for (let k = 0; k < 9; k++) B.add(G_CYL, k % 2 ? '#5a3a20' : '#6a4626', it.x + (it.ry ? (k % 3 - 1) * 0.3 : 0), 0.18 + ((k / 3) | 0) * 0.3, it.z + (it.ry ? 0 : (k % 3 - 1) * 0.3), 0.3, 1.9, 0.3, it.ry ? 0 : Math.PI / 2, 'lambert', it.ry ? Math.PI / 2 : 0, it.ry ? 0 : Math.PI / 2);
        break;
      case 'stump': B.add(G_CYL, '#4a3420', it.x, 0.25, it.z, 0.6, 0.5, 0.6); B.add(G_CYL, '#8a6a42', it.x, 0.505, it.z, 0.52, 0.01, 0.52); break;
      case 'lake': {
        const sand = new THREE.Mesh(new THREE.CircleGeometry(it.r + 2.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#3a3426' }));
        sand.position.set(it.x, 0.015, it.z); group.add(sand);
        const water = new THREE.Mesh(new THREE.CircleGeometry(it.r, 48).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#0a1820', shininess: 120, specular: 0x6070a0 }));
        water.position.set(it.x, 0.03, it.z); group.add(water);
        updaters.push(lakeFog(group, it));
        break;
      }
      case 'reed': for (let k = 0; k < 4; k++) B.box('#2a3a1a', 0.03, 0.8 + Math.random() * 0.6, 0.03, it.x + (Math.random() - 0.5) * 0.4, 0.4, it.z + (Math.random() - 0.5) * 0.4, 0, 'lambert'); break;
      case 'rock': B.add(G_SPH, '#4a4a4a', it.x, 0.2 * it.s, it.z, 1.3 * it.s, 0.8 * it.s, 1.1 * it.s, it.s * 3); break;
      case 'fire': { const f = makeFire(group, it.x, it.z, 1.2); updaters.push(f.update); break; }
      case 'log': B.add(G_CYL, '#3a2a1a', it.x, 0.22, it.z, 0.42, 1.8, 0.42, it.ry, 'lambert', 0, Math.PI / 2); break;
      case 'lanternpole': {
        B.add(G_CYL, '#3a2a1a', it.x, 1.4, it.z, 0.12, 2.8, 0.12);
        wire(B, it.x, 2.75, it.z, it.nx, 2.75, it.nz, '#111', 0.02);
        for (let k = 1; k < 5; k++) { const t = k / 5; B.box(['#ffcf6a', '#ff8a4a', '#ffe9a0'][k % 3], 0.12, 0.14, 0.12, it.x + (it.nx - it.x) * t, 2.62 - Math.sin(t * Math.PI) * 0.25, it.z + (it.nz - it.z) * t, 0, 'glow'); }
        break;
      }
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
      case 'totem':
        for (let k = 0; k < 4; k++) { B.box(['#6a3a2a', '#2a4a5a', '#7a6a2a', '#5a2a2a'][k], 0.7, 0.75, 0.7, it.x, 0.38 + k * 0.75, it.z); B.box('#111', 0.4, 0.1, 0.02, it.x, 0.5 + k * 0.75, it.z + 0.36); B.box('#ddd', 0.1, 0.1, 0.02, it.x - 0.15, 0.6 + k * 0.75, it.z + 0.36); B.box('#ddd', 0.1, 0.1, 0.02, it.x + 0.15, 0.6 + k * 0.75, it.z + 0.36); }
        B.box('#6a3a2a', 2, 0.15, 0.4, it.x, 3.1, it.z);
        break;
      case 'flag': B.add(G_CYL, '#aaa', it.x, 3, it.z, 0.08, 6, 0.08, 0, 'shiny'); B.box('#7a1a1a', 0.02, 0.8, 1.3, it.x, 5.5, it.z + 0.66); break;
      case 'sign':
        B.box('#3a2a1a', 0.2, 3, 0.2, it.x - 2.1, 1.5, it.z); B.box('#3a2a1a', 0.2, 3, 0.2, it.x + 2.1, 1.5, it.z);
        makeSign(group, it.x, it.z - 0.12);
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
  if (L.party) {
    const light = new THREE.PointLight(0xff3b5c, 25, 14, 1.2); light.position.set(L.party.x, 2.3, L.party.z); group.add(light);
    const cols = [0xff3b5c, 0x3bd1ff, 0xffe03b, 0x7dff5a, 0xd35bff];
    out.party = { x: L.party.x, z: L.party.z };
    updaters.push(t => { const k = Math.floor(t * 2.2); light.color.setHex(cols[k % cols.length]); light.intensity = 18 + Math.sin(t * 9) * 8; });
  }
  if (L.fireplace) {
    const light = new THREE.PointLight(0xff7a2a, 14, 12, 1.4); light.position.set(L.fireplace[0], 1, L.fireplace[1]); group.add(light);
    updaters.push(t => { light.intensity = 14 * (0.8 + Math.sin(t * 13) * 0.1 + Math.random() * 0.15); });
  }
  out.update = t => { for (const u of updaters) u(t); };
  out.dispose = () => {
    group.traverse(o => { if (o.geometry && o.geometry !== G_CONE) o.geometry.dispose(); if (o.material && o.material.map && o.material.map !== signTex && o.material.map !== fogTex) o.material.map.dispose(); });
    group.removeFromParent();
  };
  return out;
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
