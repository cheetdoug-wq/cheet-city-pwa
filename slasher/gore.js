// Gore: blood droplets in three sizes, blood mist, irregular splatter that lands on floors and walls,
// glossy pools, open wounds, severed parts with exposed bone, spilled intestines (rope physics),
// organs, rib cages, bodies cut in half, crushed skulls, twitching corpses.
import * as THREE from 'three';
import { UBOX, mat } from './models.js';

let root = null, world = null, boxGrid = null;
const UP = new THREE.Vector3(0, 1, 0), ZP = new THREE.Vector3(0, 0, 1);
const TV = new THREE.Vector3(), TV2 = new THREE.Vector3(), TQ = new THREE.Quaternion(), TQ2 = new THREE.Quaternion(), TM = new THREE.Matrix4(), TS = new THREE.Vector3();
let clock = 0;

function rng(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- materials ----------
const FLESH = new THREE.MeshPhongMaterial({ color: 0x8a0a12, shininess: 70, specular: 0x552222 });
const MEAT = new THREE.MeshPhongMaterial({ color: 0x5a0408, shininess: 40, specular: 0x331111 });
const CAVITY = new THREE.MeshLambertMaterial({ color: 0x2a0204 });
const BONE = new THREE.MeshLambertMaterial({ color: 0xe6dccb });
const GUT = new THREE.MeshPhongMaterial({ color: 0xc0606a, shininess: 90, specular: 0x663333 });
const HEART = new THREE.MeshPhongMaterial({ color: 0x6e0a12, shininess: 80, specular: 0x442222 });
const BRAIN = new THREE.MeshPhongMaterial({ color: 0xc9a0a0, shininess: 60, specular: 0x332222 });
const EYE = new THREE.MeshPhongMaterial({ color: 0xf2efe8, shininess: 100 });
const WOUND = new THREE.MeshLambertMaterial({ color: 0x4a0206 });
const UCYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const USPH = new THREE.IcosahedronGeometry(0.5, 1);
const BLOODC = new THREE.Color(0x5a0306);
const CHOKEC = new THREE.Color(0x5a4f86);

// ---------- droplets ----------
class Drops {
  constructor(max, size, color) {
    this.max = max; this.head = 0; this.live = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
    this.geo = new THREE.BufferGeometry();
    const a = new THREE.BufferAttribute(this.pos, 3); a.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute('position', a);
    this.pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ color, size, map: dotTex(), alphaTest: 0.5 }));
    this.pts.frustumCulled = false;
  }
  spawn(px, py, pz, vx, vy, vz, life) {
    const i = this.head++ % this.max, j = i * 3;
    this.pos[j] = px; this.pos[j + 1] = py; this.pos[j + 2] = pz;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.life[i] = life;
    this.live = 3;
  }
  update(dt, landSize) {
    if (this.live <= 0) return;
    let any = false;
    const P = this.pos, V = this.vel, Lf = this.life;
    for (let i = 0; i < this.max; i++) {
      if (Lf[i] <= 0) continue;
      any = true;
      const j = i * 3;
      V[j + 1] -= 9.8 * dt;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      Lf[i] -= dt;
      if (P[j + 1] <= 0.02) {
        if (Math.random() < landSize[1]) splatFloor(P[j], P[j + 2], landSize[0] * (0.5 + Math.random()));
        Lf[i] = 0;
      } else if (boxGrid && P[j + 1] < 3.6) {
        const b = wallHit(P[j], P[j + 1], P[j + 2]);
        if (b) { if (Math.random() < landSize[1] * 2.5) splatWall(P[j], P[j + 1], P[j + 2], b, landSize[0] * (0.6 + Math.random())); Lf[i] = 0; }
      }
      if (Lf[i] <= 0) P[j + 1] = -999;
    }
    this.geo.attributes.position.needsUpdate = true;
    if (!any) this.live--;
  }
  clear() { this.life.fill(0); for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -999; this.geo.attributes.position.needsUpdate = true; }
}
let dotT = null;
function dotTex() {
  if (dotT) return dotT;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 14, 0, Math.PI * 2); x.fill();
  return (dotT = new THREE.CanvasTexture(c));
}
let small, med, large;

// ---------- splatter decals (4 shapes in one texture) ----------
const DMAX = 220;
const decalSets = [];
let decalMat = null, poolMat = null;
function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  const r = rng(77);
  x.fillStyle = '#fff';
  for (let k = 0; k < 4; k++) {
    const cx = (k % 2) * 256 + 128, cy = ((k / 2) | 0) * 256 + 128;
    const big = k === 3;
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) { // the main blob
      const a = r() * 6.283, d = r() * (big ? 46 : 30);
      x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (big ? 40 : 22) + r() * (big ? 30 : 22), 0, 6.283); x.fill();
    }
    if (!big) {
      for (let i = 0; i < 26; i++) { // flung droplets with tails
        const a = r() * 6.283, d = 55 + r() * 60, s = 2 + r() * 7;
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
        x.beginPath(); x.ellipse(px, py, s * (1 + r() * 2), s, a, 0, 6.283); x.fill();
        if (r() < 0.5) { x.lineWidth = s * 0.7; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(px, py); x.lineTo(cx + Math.cos(a) * (d - 20 - r() * 20), cy + Math.sin(a) * (d - 20 - r() * 20)); x.stroke(); }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
function quadGeo(k) {
  const g = new THREE.PlaneGeometry(1, 1);
  const u0 = (k % 2) * 0.5, v0 = 0.5 - ((k / 2) | 0) * 0.5;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  return g;
}
const D_M = new THREE.Matrix4(), D_P = new THREE.Vector3(), D_Q = new THREE.Quaternion(), D_R = new THREE.Quaternion(), D_S = new THREE.Vector3();
let dCount = 0;
function placeDecal(pos, normal, size) {
  const set = decalSets[(Math.random() * 3) | 0];
  D_Q.setFromUnitVectors(ZP, normal);
  D_R.setFromAxisAngle(normal, Math.random() * 6.283);
  D_Q.premultiply(D_R);
  D_S.set(size, size * (0.8 + Math.random() * 0.4), 1);
  D_P.copy(pos).addScaledVector(normal, 0.006 + (dCount++ % 30) * 0.0004);
  D_M.compose(D_P, D_Q, D_S);
  set.mesh.setMatrixAt(set.head++ % DMAX, D_M);
  set.mesh.instanceMatrix.needsUpdate = true;
}
export function splatFloor(x, z, size) { placeDecal(TV2.set(x, 0, z), UP, size); }
export function splat(x, z, size) { splatFloor(x, z, size); }
const NRM = new THREE.Vector3();
function splatWall(x, y, z, b, size) {
  const d = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z];
  let k = 0; for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
  if (k === 0) { NRM.set(-1, 0, 0); x = b.x0; } else if (k === 1) { NRM.set(1, 0, 0); x = b.x1; } else if (k === 2) { NRM.set(0, 0, -1); z = b.z0; } else { NRM.set(0, 0, 1); z = b.z1; }
  placeDecal(TV2.set(x, y, z), NRM, size);
}
function wallHit(x, y, z) {
  const a = boxGrid.get(((Math.floor(x / 4) + 200) * 1000) + Math.floor(z / 4) + 200);
  if (!a) return null;
  for (const b of a) if (y < b.h && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}
export function setGoreWorld(L) {
  world = L; boxGrid = null;
  if (!L) return;
  boxGrid = new Map();
  for (const b of L.boxes) {
    if (b.h < 0.6) continue;
    for (let cx = Math.floor(b.x0 / 4); cx <= Math.floor(b.x1 / 4); cx++) for (let cz = Math.floor(b.z0 / 4); cz <= Math.floor(b.z1 / 4); cz++) {
      const k = (cx + 200) * 1000 + cz + 200;
      let a = boxGrid.get(k); if (!a) boxGrid.set(k, a = []); a.push(b);
    }
  }
}

// ---------- mist ----------
const mists = [];
let mistTex = null;
function initMist() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(120,0,6,.9)'); g.addColorStop(0.5, 'rgba(90,0,4,.45)'); g.addColorStop(1, 'rgba(60,0,2,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  mistTex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; root.add(s);
    mists.push({ s, t: 0, life: 0, v: new THREE.Vector3(), size: 1 });
  }
}
let mistHead = 0;
export function mist(pos, size = 0.8, dir) {
  const m = mists[mistHead++ % mists.length];
  m.s.position.copy(pos); m.t = 0; m.life = 0.7 + Math.random() * 0.4; m.size = size; m.s.visible = true;
  m.v.set((Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6);
  if (dir) m.v.addScaledVector(dir, 1.2);
}

// ---------- init ----------
export function initGore(scene) {
  root = new THREE.Group(); scene.add(root);
  small = new Drops(1800, 0.022, 0x9a000b); med = new Drops(1100, 0.045, 0x7c000a); large = new Drops(450, 0.085, 0x620008);
  root.add(small.pts, med.pts, large.pts);
  const atlas = makeAtlas();
  decalMat = new THREE.MeshPhongMaterial({ color: 0x6a0008, map: atlas, alphaTest: 0.5, shininess: 90, specular: 0x3a1111, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  poolMat = new THREE.MeshPhongMaterial({ color: 0x420206, map: atlas, alphaTest: 0.5, shininess: 120, specular: 0x552222, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (let k = 0; k < 3; k++) {
    const mesh = new THREE.InstancedMesh(quadGeo(k), decalMat, DMAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    D_M.makeScale(0, 0, 0); for (let i = 0; i < DMAX; i++) mesh.setMatrixAt(i, D_M);
    mesh.frustumCulled = false; root.add(mesh);
    decalSets.push({ mesh, head: 0 });
  }
  POOLGEO = quadGeo(3).rotateX(-Math.PI / 2);
  initMist();
}
let POOLGEO = null;

// pos, dir: Vector3-like. n droplets spread over three sizes.
export function blood(pos, dir, n, speed = 3, spread = 1.5, up = 1.5) {
  for (let k = 0; k < n; k++) {
    const r = Math.random();
    const set = r < 0.6 ? small : r < 0.9 ? med : large;
    const s = speed * (0.3 + Math.random() * 0.9) * (set === large ? 0.8 : 1);
    set.spawn(pos.x + (Math.random() - 0.5) * 0.08, pos.y + (Math.random() - 0.5) * 0.08, pos.z + (Math.random() - 0.5) * 0.08,
      dir.x * s + (Math.random() - 0.5) * spread, dir.y * s + Math.random() * up, dir.z * s + (Math.random() - 0.5) * spread,
      1.2 + Math.random() * 1.6);
  }
}
export function dripBlood(pos) {
  (Math.random() < 0.5 ? small : med).spawn(pos.x + (Math.random() - 0.5) * 0.06, pos.y, pos.z + (Math.random() - 0.5) * 0.06, 0, -0.3, 0, 2);
}

// ---------- body bits ----------
const gibs = [], spurts = [], corpses = [], pools = [], guts = [], beats = [];
function partOrigin(P, part) { return P[part] || P.torso; }
function partCenter(P, part, out) {
  const o = partOrigin(P, part);
  if (part === 'head') out.set(0, 0.2, 0);
  else if (part === 'torso') out.set(0, 0.32, 0);
  else out.set(0, -0.22, 0);
  return o.localToWorld(out);
}
function addMesh(parent, geo, material, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
// A raw cut: flesh disc with bone in the middle. axis: 'y' for neck/waist, 'x' for limbs at the joint.
function stump(parent, x, y, z, size, boneLen, down = false) {
  const g = new THREE.Group(); g.position.set(x, y, z); if (down) g.rotation.x = Math.PI; parent.add(g);
  addMesh(g, UCYL, FLESH, size, 0.035, size * 0.95, 0, 0, 0);
  addMesh(g, UCYL, MEAT, size * 0.7, 0.04, size * 0.65, 0, 0.004, 0);
  addMesh(g, UCYL, BONE, size * 0.28, boneLen, size * 0.28, 0, boneLen / 2, 0);
  return g;
}
function tint(obj, c, amt) {
  obj.traverse(o => {
    if (!o.isMesh || o.material === FLESH || o.material === MEAT || o.material === BONE || o.material === GUT || o.material === CAVITY || o.material === WOUND || o.material === HEART) return;
    if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; }
    if (o.material.color) o.material.color.lerp(c, amt);
  });
}
function addGib(o, v, av, bleed) {
  gibs.push({ o, v, av, bleed, rest: false });
  while (gibs.length > 90) { const old = gibs.shift(); old.o.removeFromParent(); }
}
function detach(P, name, d, r, force = 1) {
  const piv = P[name];
  if (!piv || !piv.parent || piv.parent === root) return null;
  const parent = piv.parent, local = piv.position.clone();
  piv.updateMatrixWorld(true);
  root.attach(piv);
  addGib(piv, new THREE.Vector3(d.x * (1.5 + r() * 2.5) * force + (r() - 0.5) * 1.5, 2 + r() * 3, d.z * (1.5 + r() * 2.5) * force + (r() - 0.5) * 1.5),
    new THREE.Vector3((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14), 3);
  return { parent, local, piv };
}

// Intestines: a chain of soft beads with rope physics, one end tied to the body.
class Gut {
  constructor(anchor, local, dir, n = 16) {
    this.a = anchor; this.local = local.clone(); this.n = n; this.seg = 0.07; this.t = 0;
    this.p = []; this.o = [];
    const s = anchor.localToWorld(local.clone());
    for (let i = 0; i < n; i++) {
      const p = s.clone().addScaledVector(dir, i * 0.02).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, -i * 0.01, (Math.random() - 0.5) * 0.03));
      this.p.push(p); this.o.push(p.clone().addScaledVector(dir, -0.025 - Math.random() * 0.02));
    }
    this.mesh = new THREE.InstancedMesh(USPH, GUT, n); this.mesh.frustumCulled = false; root.add(this.mesh);
    this.write();
  }
  update(dt) {
    this.t += dt;
    if (this.t > 10) return;
    const g = -9.8 * dt * dt;
    const a = this.a.parent ? this.a.localToWorld(TV.copy(this.local)) : null;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], o = this.o[i];
      if (i === 0 && a) { o.copy(p); p.copy(a); continue; }
      const vx = (p.x - o.x) * 0.985, vy = (p.y - o.y) * 0.985, vz = (p.z - o.z) * 0.985;
      o.copy(p); p.x += vx; p.y += vy + g; p.z += vz;
      if (p.y < 0.045) { p.y = 0.045; o.x = p.x - vx * 0.5; o.z = p.z - vz * 0.5; }
    }
    for (let it = 0; it < 6; it++) {
      for (let i = 1; i < this.n; i++) {
        const p0 = this.p[i - 1], p1 = this.p[i];
        TV2.subVectors(p1, p0); const d = TV2.length() || 1e-4, diff = (d - this.seg) / d;
        if (i === 1 && a) p1.addScaledVector(TV2, -diff);
        else { p0.addScaledVector(TV2, diff * 0.5); p1.addScaledVector(TV2, -diff * 0.5); }
      }
    }
    this.write();
  }
  write() {
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], q = this.p[Math.min(this.n - 1, i + 1)], pr = this.p[Math.max(0, i - 1)];
      TV2.subVectors(q, pr); if (TV2.lengthSq() < 1e-8) TV2.set(0, 1, 0); TV2.normalize();
      TQ.setFromUnitVectors(UP, TV2);
      TM.compose(p, TQ, TS.set(0.085, 0.12, 0.085));
      this.mesh.setMatrixAt(i, TM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
function spillGuts(anchor, local, dir, count = 2) {
  for (let i = 0; i < count; i++) {
    const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.3, (Math.random() - 0.5) * 0.6)).normalize();
    guts.push(new Gut(anchor, local, d, 13 + ((Math.random() * 6) | 0)));
  }
  while (guts.length > 14) guts.shift().mesh.removeFromParent();
}
function makeHeart() {
  const g = new THREE.Group();
  addMesh(g, USPH, HEART, 0.1, 0.12, 0.09, 0, 0, 0);
  addMesh(g, USPH, HEART, 0.07, 0.08, 0.07, 0.03, 0.04, 0.01);
  addMesh(g, UCYL, MEAT, 0.03, 0.06, 0.03, -0.01, 0.07, 0, 0, 0, 0.3);
  return g;
}
function organChunk(color) {
  const m = new THREE.Mesh(USPH, color);
  m.scale.set(0.07 + Math.random() * 0.06, 0.05 + Math.random() * 0.04, 0.06 + Math.random() * 0.05);
  return m;
}
// Opened chest: dark cavity, exposed ribs and a beating heart.
function openChest(torso, heartOut, d, r) {
  addMesh(torso, UBOX, CAVITY, 0.3, 0.34, 0.02, 0, 0.32, -0.128);
  addMesh(torso, UBOX, FLESH, 0.34, 0.03, 0.02, 0, 0.5, -0.127);
  addMesh(torso, UBOX, FLESH, 0.34, 0.03, 0.02, 0, 0.14, -0.127);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) addMesh(torso, UBOX, BONE, 0.13, 0.018, 0.022, s * 0.08, 0.44 - i * 0.055, -0.133, 0, s * 0.35, s * -0.25);
  addMesh(torso, UBOX, BONE, 0.025, 0.24, 0.02, 0, 0.33, -0.135);
  if (heartOut) {
    const h = makeHeart(); torso.updateMatrixWorld(true); h.position.copy(torso.localToWorld(new THREE.Vector3(0, 0.36, -0.15))); root.add(h);
    addGib(h, new THREE.Vector3(d.x * 2.5 + (r() - 0.5), 2 + r() * 1.5, d.z * 2.5 + (r() - 0.5)), new THREE.Vector3(r() * 8, r() * 8, r() * 8), 2);
    beats.push({ o: h, t: 5 });
  } else {
    const h = makeHeart(); h.position.set(0.04, 0.38, -0.12); torso.add(h); beats.push({ o: h, t: 3 });
  }
}

// ---------- hits ----------
export function hurtFX(char, part, dir) {
  if (!char) return;
  char.updateMatrixWorld(true);
  const P = char.userData.P;
  const at = partCenter(P, part, new THREE.Vector3());
  const d = TV.set(dir[0] * 0.8, 0.25, dir[1] * 0.8);
  blood(at, d, 70, 3, 1.3, 1.4);
  mist(at, 0.6, d);
  splatFloor(at.x + dir[0] * 0.6, at.z + dir[1] * 0.6, 0.35);
  const o = partOrigin(P, part);
  const w = new THREE.Mesh(UBOX, WOUND);
  if (part === 'head') { w.scale.set(0.09, 0.02, 0.012); w.position.set((Math.random() - 0.5) * 0.12, 0.2 + (Math.random() - 0.5) * 0.1, -0.13); }
  else if (part === 'torso') { w.scale.set(0.16, 0.025, 0.012); w.position.set((Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.3, -0.13); }
  else { w.scale.set(0.02, 0.1, 0.13); w.position.set(0, -0.15 - Math.random() * 0.1, 0); }
  w.rotation.z = (Math.random() - 0.5) * 1.5;
  o.add(w);
  spurts.push({ parent: o, local: w.position.clone(), axis: new THREE.Vector3(0, 0.2, -1).normalize(), t: 0.8, rate: 40 });
}

// g: { part, dir:[x,z], seed }, W: weapon definition (or {id:'choke'|'stomp'|'fists'|'throw'})
export function killFX(char, g, W) {
  const P = char.userData.P;
  const r = rng(g.seed | 0);
  const d = new THREE.Vector3(g.dir[0], 0, g.dir[1]);
  if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
  d.normalize();
  char.updateMatrixWorld(true);
  const at = partCenter(P, g.part, new THREE.Vector3());
  const limb = /^(arm|leg)/.test(g.part);
  const id = W.id;
  let style;
  if (id === 'choke') style = 'choke';
  else if (id === 'stomp' || (W.crush && (g.part === 'head' || r() < 0.5))) style = 'crush';
  else if (W.saw) style = g.part === 'head' ? 'decap' : limb ? 'limb' : 'halve';
  else if (W.impale) style = 'impale';
  else if (g.part === 'head') style = W.decap > 0 && r() < W.decap + 0.35 ? (id === 'axe' && r() < 0.45 ? 'split' : 'decap') : 'headwound';
  else if (limb) style = W.decap > 0 && r() < 0.8 ? 'limb' : 'bleed';
  else if (W.crush) style = 'cave';
  else if (W.decap > 0) style = r() < 0.45 && id !== 'cleaver' ? 'halve' : 'gut';
  else style = 'bleed';

  if (style === 'choke') {
    tint(P.head, CHOKEC, 0.55);
    if (P.mouth) P.mouth.scale.y = 0.07;
  } else {
    tint(char, BLOODC, 0.25);
    blood(at, TV.set(d.x, 0.35, d.z), W.crush || style === 'halve' ? 320 : 200, 3.8, 2, 2);
    mist(at, 1.1, d); mist(at, 0.8);
    splatFloor(at.x + d.x * 0.9, at.z + d.z * 0.9, 0.7 + r() * 0.4);
    splatFloor(at.x, at.z, 0.45);
  }
  const neckY = 0.59;
  switch (style) {
    case 'decap': {
      const cut = detach(P, 'head', d, r, 0.8);
      if (cut) {
        stump(P.torso, 0, neckY, 0, 0.12, 0.07);
        stump(cut.piv, 0, 0, 0, 0.12, 0.03, true);
        spurts.push({ parent: P.torso, local: new THREE.Vector3(0, neckY + 0.02, 0), axis: new THREE.Vector3(0, 1, 0.1).normalize(), t: 4.5, rate: 160, power: 4 });
        spurts.push({ parent: cut.piv, local: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, -1, 0), t: 2, rate: 40 });
      }
      break;
    }
    case 'split': {
      P.head.visible = false;
      stump(P.torso, 0, neckY, 0, 0.12, 0.05);
      P.head.updateMatrixWorld(true);
      const hp = P.head.localToWorld(new THREE.Vector3(0, 0.2, 0));
      const skin = char.userData.look.skin;
      for (const s of [-1, 1]) {
        const half = new THREE.Group(); half.position.copy(hp); half.quaternion.copy(P.head.getWorldQuaternion(TQ));
        addMesh(half, UBOX, mat(skin), 0.12, 0.27, 0.25, s * 0.065, 0, 0);
        addMesh(half, UBOX, FLESH, 0.01, 0.25, 0.23, -s * 0.001, 0, 0);
        addMesh(half, UBOX, BRAIN, 0.012, 0.12, 0.16, -s * 0.004, 0.05, 0.01);
        if (char.userData.look.hair) addMesh(half, UBOX, mat(char.userData.look.hair), 0.13, 0.07, 0.27, s * 0.065, 0.15, 0);
        root.add(half);
        const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(s * 1.6);
        addGib(half, new THREE.Vector3(side.x + d.x, 1.5 + r(), side.z + d.z), new THREE.Vector3(r() * 6, r() * 6, s * 8), 2.5);
      }
      spurts.push({ parent: P.torso, local: new THREE.Vector3(0, neckY + 0.03, 0), axis: new THREE.Vector3(0, 1, 0), t: 3.5, rate: 120, power: 3 });
      break;
    }
    case 'crush': {
      P.head.visible = false;
      stump(P.torso, 0, neckY, 0, 0.12, 0.05);
      P.head.updateMatrixWorld(true);
      const hp = P.head.localToWorld(new THREE.Vector3(0, 0.18, 0));
      blood(hp, TV.set(d.x * 0.4, 0.6, d.z * 0.4), 420, 4.5, 3.5, 3);
      mist(hp, 1.5); mist(hp, 1.1, d);
      const pieces = [[BONE, 7], [BRAIN, 6], [MEAT, 5], [EYE, 2]];
      for (const [m, n] of pieces) for (let i = 0; i < n; i++) {
        const o = m === EYE ? new THREE.Mesh(USPH, EYE) : m === BONE ? new THREE.Mesh(UBOX, BONE) : organChunk(m);
        if (m === EYE) o.scale.setScalar(0.035);
        if (m === BONE) o.scale.set(0.04 + r() * 0.06, 0.012, 0.04 + r() * 0.05);
        o.position.copy(hp); root.add(o);
        addGib(o, new THREE.Vector3(d.x * 2.5 + (r() - 0.5) * 6, 1.5 + r() * 4, d.z * 2.5 + (r() - 0.5) * 6), new THREE.Vector3(r() * 12, r() * 12, r() * 12), m === MEAT ? 1 : 0);
      }
      for (let i = 0; i < 7; i++) splatFloor(hp.x + d.x * (0.4 + r() * 2.2) + (r() - 0.5) * 1.4, hp.z + d.z * (0.4 + r() * 2.2) + (r() - 0.5) * 1.4, 0.3 + r() * 0.5);
      spurts.push({ parent: P.torso, local: new THREE.Vector3(0, neckY + 0.03, 0), axis: new THREE.Vector3(0, 1, 0), t: 3, rate: 120, power: 2.5 });
      break;
    }
    case 'halve': {
      const cut = detach(P, 'torso', d, r, 0.5);
      if (cut) {
        cut.piv.userData.isTorso = true;
        stump(char, 0, 1.02, 0, 0.36, 0.09);
        stump(cut.piv, 0, 0, 0, 0.36, 0.06, true);
        spillGuts(char, new THREE.Vector3(0, 1.03, -0.03), new THREE.Vector3(d.x, 0.3, d.z), 2);
        spillGuts(cut.piv, new THREE.Vector3(0, -0.01, -0.02), new THREE.Vector3(d.x, -0.5, d.z), 2);
        for (let i = 0; i < 3; i++) {
          const o = organChunk(i ? MEAT : HEART); o.position.copy(cut.piv.position); root.add(o);
          addGib(o, new THREE.Vector3(d.x * 2 + (r() - 0.5) * 3, 1 + r() * 2, d.z * 2 + (r() - 0.5) * 3), new THREE.Vector3(r() * 8, r() * 8, r() * 8), 1);
        }
        spurts.push({ parent: char, local: new THREE.Vector3(0, 1.04, 0), axis: new THREE.Vector3(0, 1, 0), t: 4, rate: 170, power: 3 });
        spurts.push({ parent: cut.piv, local: new THREE.Vector3(0, -0.02, 0), axis: new THREE.Vector3(0, -1, 0), t: 3, rate: 110, power: 2 });
      }
      break;
    }
    case 'gut': {
      openChest(P.torso, r() < 0.5, d, r);
      spillGuts(P.torso, new THREE.Vector3(0, 0.12, -0.13), new THREE.Vector3(d.x * 0.5, -0.4, d.z * 0.5 - 0.5), 2);
      spurts.push({ parent: P.torso, local: new THREE.Vector3(0, 0.35, -0.14), axis: new THREE.Vector3(0, 0.3, -1).normalize(), t: 3.5, rate: 110, power: 2.2 });
      break;
    }
    case 'cave': {
      openChest(P.torso, false, d, r);
      blood(at, TV.set(d.x, 0.5, d.z), 200, 3, 2, 2);
      spurts.push({ parent: P.head, local: new THREE.Vector3(0, 0.12, -0.13), axis: new THREE.Vector3(0, -0.2, -1).normalize(), t: 2.5, rate: 60 });
      break;
    }
    case 'limb': {
      const cut = detach(P, g.part, d, r, 1.2);
      if (cut) {
        const arm = g.part.startsWith('arm');
        stump(cut.parent, cut.local.x, cut.local.y, cut.local.z, 0.12, 0.06, !arm);
        stump(cut.piv, 0, 0, 0, 0.12, 0.05, !arm ? false : true);
        spurts.push({ parent: cut.parent, local: cut.local.clone(), axis: arm ? new THREE.Vector3(Math.sign(cut.local.x) || 1, -0.3, 0).normalize() : new THREE.Vector3(0, -1, 0), t: 4, rate: 130, power: 2.6 });
      }
      if (W.saw && r() < 0.6) { const o = ['armL', 'armR', 'legL', 'legR'].filter(n => n !== g.part)[(r() * 3) | 0]; const c2 = detach(P, o, d, r, 1.4); if (c2) stump(c2.parent, c2.local.x, c2.local.y, c2.local.z, 0.12, 0.06, true); }
      break;
    }
    case 'impale': {
      for (const z of [-0.13, 0.13]) addMesh(P.torso, UCYL, CAVITY, 0.08, 0.02, 0.08, 0, 0.32, z, Math.PI / 2);
      spurts.push({ parent: P.torso, local: new THREE.Vector3(0, 0.32, -0.14), axis: new THREE.Vector3(0, 0.1, -1).normalize(), t: 3, rate: 90, power: 2 });
      spurts.push({ parent: P.torso, local: new THREE.Vector3(0, 0.32, 0.14), axis: new THREE.Vector3(0, 0.1, 1).normalize(), t: 3, rate: 90, power: 2 });
      spillGuts(P.torso, new THREE.Vector3(0, 0.15, -0.13), new THREE.Vector3(0, -0.6, -0.6), 1);
      break;
    }
    case 'headwound': {
      addMesh(P.head, UBOX, WOUND, 0.2, 0.03, 0.02, 0, 0.24, -0.13, 0, 0, 0.3);
      spurts.push({ parent: P.head, local: new THREE.Vector3(0, 0.24, -0.13), axis: new THREE.Vector3(0, 0.3, -1).normalize(), t: 3, rate: 90, power: 2 });
      break;
    }
    default: {
      const o = partOrigin(P, g.part);
      addMesh(o, UBOX, WOUND, 0.18, 0.03, 0.02, 0, g.part === 'torso' ? 0.3 : -0.2, -0.13, 0, 0, 0.4);
      spurts.push({ parent: o, local: new THREE.Vector3(0, g.part === 'torso' ? 0.3 : -0.2, -0.13), axis: new THREE.Vector3(0, 0.2, -1).normalize(), t: 3, rate: 90, power: 2 });
    }
  }

  // The body drops in the direction of the blow (backwards when choked), then limbs splay and twitch.
  const fall = style === 'choke' ? d.clone().negate() : d;
  const axis = new THREE.Vector3().crossVectors(UP, fall).normalize();
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, char.rotation.y);
  const q1 = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(yawQ);
  const lean = char.rotation.x;
  char.rotation.x = 0;
  const q0 = lean ? q1.clone() : char.quaternion.clone();
  corpses.push({ char, P, t: style === 'impale' ? -0.7 : 0, q0, q1, y0: char.position.y, pool: null, twitch: 3, poolMax: style === 'choke' ? 0 : style === 'halve' || style === 'crush' ? 1.6 : 1.15, splayed: false, r });
}

// ---------- update ----------
export function updateGore(dt) {
  clock += dt;
  small.update(dt, [0.07, 0.04]); med.update(dt, [0.12, 0.12]); large.update(dt, [0.2, 0.3]);
  for (const m of mists) {
    if (!m.s.visible) continue;
    m.t += dt;
    const k = m.t / m.life;
    if (k >= 1) { m.s.visible = false; continue; }
    m.s.position.addScaledVector(m.v, dt);
    m.s.scale.setScalar(m.size * (0.3 + k * 1.2));
    m.s.material.opacity = 0.75 * (1 - k);
  }
  for (const g of gibs) {
    if (g.bleed > 0) {
      g.bleed -= dt;
      if (Math.random() < 0.7) { g.o.getWorldPosition(TV); blood(TV, TV2.set(0, 0.1, 0), 1, 0.5, 0.4, 0.3); }
    }
    if (g.rest) continue;
    g.v.y -= 9.8 * dt;
    g.o.position.addScaledVector(g.v, dt);
    g.o.rotation.x += g.av.x * dt; g.o.rotation.y += g.av.y * dt; g.o.rotation.z += g.av.z * dt;
    const floor = g.o.userData.isTorso ? 0.14 : 0.07;
    if (g.o.position.y < floor) {
      g.o.position.y = floor;
      if (Math.abs(g.v.y) > 1) { g.v.y *= -0.25; splatFloor(g.o.position.x, g.o.position.z, 0.25); } else g.v.y = 0;
      g.v.x *= 0.6; g.v.z *= 0.6; g.av.multiplyScalar(0.55);
      if (g.v.lengthSq() < 0.04) {
        g.rest = true; splatFloor(g.o.position.x, g.o.position.z, 0.35);
        if (g.o.userData.isTorso) { g.o.rotation.x = Math.PI / 2 * Math.sign(g.o.rotation.x || 1); g.o.rotation.z = 0; }
      }
    }
  }
  for (let i = spurts.length - 1; i >= 0; i--) {
    const s = spurts[i];
    s.t -= dt;
    if (s.t <= 0 || !s.parent.parent) { spurts.splice(i, 1); continue; }
    const beat = Math.sin(clock * 7.5 + i);
    const pulse = beat > 0.3 ? 1 : 0.2;
    const n = Math.max(1, Math.round(dt * (s.rate || 100) * pulse));
    const p = s.parent.localToWorld(TV.copy(s.local));
    const dir = TV2.copy(s.axis).transformDirection(s.parent.matrixWorld);
    blood(p, dir, n, (s.power || 1.5) * (0.4 + Math.min(1, s.t / 2)) * (pulse > 0.5 ? 1.3 : 0.6), 0.45, 0.3);
  }
  for (const gt of guts) gt.update(dt);
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i]; b.t -= dt;
    const k = Math.max(0, Math.sin(clock * 7.5)) * 0.18 * Math.min(1, b.t);
    b.o.scale.setScalar(1 + k);
    if (b.t <= 0) beats.splice(i, 1);
  }
  for (const c of corpses) {
    if (c.t < 1.5) {
      c.t += dt;
      if (c.t >= 0) {
        const k = Math.min(1, c.t / 0.55), e = k * k;
        c.char.quaternion.slerpQuaternions(c.q0, c.q1, e);
        c.char.position.y = c.y0 + (0.12 - c.y0) * e;
        if (k >= 1 && !c.splayed) {
          c.splayed = true;
          const r = c.r, P = c.P;
          if (P.armL.parent && P.armL.parent !== root) { P.armL.rotation.set(r() * 2.5 - 0.5, 0, -0.3 - r() * 1.2); P.elbowL.rotation.x = r() * 1.2; }
          if (P.armR.parent && P.armR.parent !== root) { P.armR.rotation.set(r() * 2.5 - 0.5, 0, 0.3 + r() * 1.2); P.elbowR.rotation.x = r() * 1.2; }
          if (P.legL.parent && P.legL.parent !== root) { P.legL.rotation.set(r() * 0.8, 0, -r() * 0.4); P.kneeL.rotation.x = -r() * 1.2; }
          if (P.legR.parent && P.legR.parent !== root) { P.legR.rotation.set(r() * 0.8, 0, r() * 0.4); P.kneeR.rotation.x = -r() * 1.2; }
          if (P.head.parent && P.head.parent !== root) P.head.rotation.set((r() - 0.5) * 0.8, (r() - 0.5) * 1.2, 0);
        }
        if (k >= 1 && !c.pool && c.poolMax > 0) {
          c.char.updateMatrixWorld(true);
          const p = c.char.localToWorld(TV.set(0, 1.15, 0));
          const m = new THREE.Mesh(POOLGEO, poolMat); m.position.set(p.x, 0.011, p.z); m.rotation.y = Math.random() * 6.283; m.scale.setScalar(0.1);
          root.add(m); c.pool = m; pools.push(m);
          while (pools.length > 40) pools.shift().removeFromParent();
        }
      }
    }
    if (c.splayed && c.twitch > 0) {
      c.twitch -= dt;
      if (Math.random() < dt * 9) {
        const P = c.P, list = [P.armL, P.armR, P.legL, P.kneeL, P.elbowR, P.head].filter(o => o && o.parent && o.parent !== root);
        const o = list[(Math.random() * list.length) | 0];
        if (o) o.rotation.x += (Math.random() - 0.5) * 0.35 * Math.min(1, c.twitch);
      }
    }
    if (c.pool && c.pool.scale.x < c.poolMax) c.pool.scale.setScalar(c.pool.scale.x + dt * 0.3);
  }
}

export function clearGore() {
  for (const g of gibs) g.o.removeFromParent();
  for (const p of pools) p.removeFromParent();
  for (const g of guts) g.mesh.removeFromParent();
  gibs.length = 0; spurts.length = 0; corpses.length = 0; pools.length = 0; guts.length = 0; beats.length = 0;
  small.clear(); med.clear(); large.clear();
  D_M.makeScale(0, 0, 0);
  for (const s of decalSets) { for (let i = 0; i < DMAX; i++) s.mesh.setMatrixAt(i, D_M); s.mesh.instanceMatrix.needsUpdate = true; s.head = 0; }
  for (const m of mists) m.s.visible = false;
}
