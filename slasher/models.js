// Characters, masks, weapons and props. Each body part is one merged mesh with vertex colours,
// so a full character is about a dozen draw calls and parts can still animate and come off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MASKS, OUTFITS, SKINS, SHIRTS, PANTS, HAIRS } from './data.js';

const cache = new Map();
export function mat(color, emissive) {
  const k = color + '|' + (emissive || '');
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    if (emissive) m.emissive = new THREE.Color(emissive);
    cache.set(k, m);
  }
  return m;
}
export const UBOX = new THREE.BoxGeometry(1, 1, 1);
const UCYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
export const CHAR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed(),
  sph: new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed(),
};
for (const g of Object.values(GEO)) g.deleteAttribute('uv');
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

// Collects coloured shapes and merges them into one mesh.
export class Piece {
  constructor() { this.list = []; }
  add(type, color, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = GEO[type].clone();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }
  mesh(material = CHAR_MAT) {
    const geo = mergeGeometries(this.list, false);
    this.list.forEach(g => g.dispose());
    this.list = [];
    return new THREE.Mesh(geo, material);
  }
}

export function shade(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }

// ---------- looks ----------
export function killerLook(l) {
  const o = (OUTFITS[l.outfit] || OUTFITS[0]).c;
  return { kind: 'killer', mask: l.mask, skin: SKINS[l.skin] || SKINS[0], shirt: o, pants: shade(o, 0.55), weapon: l.weapon };
}
export function camperLook(l) {
  return { kind: 'camper', skin: SKINS[l.skin] || SKINS[0], shirt: (OUTFITS[l.outfit] || OUTFITS[0]).c, pants: '#2f3e5c', hair: '#3a2615', hairStyle: 0 };
}
export function npcLook(i) {
  i = Math.abs(i | 0);
  const female = i % 2 === 0;
  return {
    kind: 'camper', female, skin: SKINS[i % 4], shirt: SHIRTS[(i * 7) % SHIRTS.length], pants: PANTS[(i * 3) % PANTS.length],
    hair: HAIRS[(i * 5) % HAIRS.length], hairStyle: female ? [1, 2, 1, 4][(i >> 1) % 4] : [0, 3, 4, 0][(i >> 1) % 4],
    shorts: i % 5 === 1, stripe: i % 3 === 0 ? '#ffffff' : null, glasses: i % 7 === 3, cap: ['#c0392b', '#1f4e8a', '#2e7d32'][i % 3],
    shoes: ['#e8e8e8', '#2a2a2a', '#a33'][i % 3],
  };
}
export function aiLook(seed) {
  const m = MASKS[Math.abs(seed | 0) % MASKS.length].id;
  return { kind: 'killer', mask: m, skin: SKINS[1], shirt: '#3a2a20', pants: '#1d1712', weapon: 'machete' };
}

// ---------- characters ----------
// Origin at the feet, facing -Z. Pivots: hips > legs > knees, torso (cut point at the waist) > arms > elbows, head.
export function makeChar(L) {
  const killer = L.kind === 'killer';
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const P = {};
  g.userData = { P, phase: Math.random() * 6, atk: 0, killer, look: L, lift: 0 };
  const skin = L.skin, shirt = L.shirt, pants = L.pants, shoes = killer ? '#141414' : (L.shoes || '#e8e8e8');

  const hips = new THREE.Group(); hips.position.set(0, 0.95, 0); g.add(hips); P.hips = hips;
  hips.add(new Piece().add('box', pants, 0.38, 0.16, 0.23, 0, 0, 0).mesh());
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.1 * s, -0.04, 0); hips.add(leg);
    leg.add(new Piece().add('box', pants, 0.17, 0.46, 0.19, 0, -0.23, 0).mesh());
    const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); leg.add(knee);
    knee.add(new Piece().add('box', L.shorts ? skin : pants, 0.15, 0.42, 0.17, 0, -0.21, 0).add('box', shoes, 0.17, 0.1, 0.27, 0, -0.45, -0.04).mesh());
    P[s < 0 ? 'legL' : 'legR'] = leg; P[s < 0 ? 'kneeL' : 'kneeR'] = knee;
  }

  const torso = new THREE.Group(); torso.position.set(0, 1.02, 0); g.add(torso); P.torso = torso;
  const tp = new Piece().add('box', shirt, 0.4, 0.2, 0.23, 0, 0.1, 0).add('box', shirt, 0.45, 0.38, 0.25, 0, 0.38, 0);
  if (killer) {
    tp.add('box', '#4a3b2c', 0.38, 0.62, 0.02, 0, 0.22, -0.135)
      .add('box', '#4a0606', 0.12, 0.09, 0.012, 0.07, 0.34, -0.143).add('box', '#3d0404', 0.08, 0.16, 0.012, -0.09, 0.12, -0.143)
      .add('box', '#5a0808', 0.05, 0.05, 0.012, 0.12, 0.05, -0.143).add('box', '#2a1a10', 0.46, 0.04, 0.26, 0, 0.0, 0);
  } else if (L.stripe) tp.add('box', L.stripe, 0.455, 0.06, 0.255, 0, 0.42, 0);
  torso.add(tp.mesh());
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0.29 * s, 0.53, 0); torso.add(arm);
    arm.add(new Piece().add('box', shirt, 0.13, 0.29, 0.14, 0, -0.13, 0).mesh());
    const elbow = new THREE.Group(); elbow.position.set(0, -0.28, 0); arm.add(elbow);
    elbow.add(new Piece().add('box', killer ? shirt : skin, 0.11, 0.27, 0.12, 0, -0.13, 0).add('box', killer ? '#1b1b1b' : skin, 0.1, 0.11, 0.1, 0, -0.31, 0).mesh());
    const hand = new THREE.Object3D(); hand.position.set(0, -0.33, -0.02); elbow.add(hand);
    P[s < 0 ? 'armL' : 'armR'] = arm; P[s < 0 ? 'elbowL' : 'elbowR'] = elbow; P[s < 0 ? 'handL' : 'handR'] = hand;
  }

  const neck = new THREE.Group(); neck.position.set(0, 0.59, 0); torso.add(neck); P.head = neck;
  const hp = new Piece().add('box', skin, 0.1, 0.08, 0.1, 0, 0.03, 0).add('box', skin, 0.24, 0.27, 0.25, 0, 0.2, 0);
  if (killer) addMask(hp, L.mask);
  else {
    hp.add('box', '#f4f1ea', 0.055, 0.035, 0.01, -0.06, 0.235, -0.126).add('box', '#f4f1ea', 0.055, 0.035, 0.01, 0.06, 0.235, -0.126)
      .add('box', '#1a120c', 0.025, 0.03, 0.012, -0.06, 0.235, -0.127).add('box', '#1a120c', 0.025, 0.03, 0.012, 0.06, 0.235, -0.127)
      .add('box', shade(L.hair, 0.8), 0.06, 0.015, 0.012, -0.06, 0.27, -0.127).add('box', shade(L.hair, 0.8), 0.06, 0.015, 0.012, 0.06, 0.27, -0.127)
      .add('box', shade(skin, 0.88), 0.04, 0.06, 0.03, 0, 0.19, -0.135);
    const hair = L.hair;
    switch (L.hairStyle | 0) {
      case 1: hp.add('box', hair, 0.26, 0.07, 0.27, 0, 0.35, 0).add('box', hair, 0.26, 0.36, 0.06, 0, 0.17, 0.125).add('box', hair, 0.03, 0.24, 0.22, -0.13, 0.23, 0.02).add('box', hair, 0.03, 0.24, 0.22, 0.13, 0.23, 0.02); break;
      case 2: hp.add('box', hair, 0.26, 0.07, 0.27, 0, 0.35, 0).add('box', hair, 0.26, 0.16, 0.05, 0, 0.26, 0.125).add('box', hair, 0.07, 0.24, 0.07, 0, 0.2, 0.18); break;
      case 3: hp.add('box', hair, 0.25, 0.03, 0.26, 0, 0.34, 0); break;
      case 4: hp.add('box', hair, 0.26, 0.05, 0.27, 0, 0.34, 0).add('box', L.cap || '#c0392b', 0.27, 0.07, 0.28, 0, 0.37, 0).add('box', L.cap || '#c0392b', 0.22, 0.02, 0.13, 0, 0.345, -0.18); break;
      default: hp.add('box', hair, 0.26, 0.07, 0.27, 0, 0.35, 0).add('box', hair, 0.26, 0.16, 0.05, 0, 0.26, 0.125);
    }
    if (L.glasses) hp.add('box', '#111', 0.21, 0.015, 0.012, 0, 0.255, -0.133).add('box', '#111', 0.07, 0.05, 0.008, -0.06, 0.235, -0.134).add('box', '#111', 0.07, 0.05, 0.008, 0.06, 0.235, -0.134);
  }
  const headMesh = hp.mesh(); neck.add(headMesh); P.headMesh = headMesh;
  if (killer) {
    const z = maskEyeZ(L.mask);
    const eyes = new THREE.Mesh(UBOX, mat('#ff2a1a', '#ff1a0a')); eyes.scale.set(0.15, 0.012, 0.004); eyes.position.set(0, 0.24, z); neck.add(eyes);
    g.scale.setScalar(1.08);
  } else {
    const mouth = new THREE.Mesh(UBOX, mat('#3a0808')); mouth.scale.set(0.07, 0.02, 0.01); mouth.position.set(0, 0.11, -0.127); neck.add(mouth); P.mouth = mouth;
  }
  return g;
}
function maskEyeZ(id) { return { sack: -0.154, pig: -0.143, skull: -0.139, grin: -0.162, doll: -0.134, gas: -0.167 }[id] || -0.154; }

function addMask(p, id) {
  const y = 0.2;
  const eyes = (z, dy = 0.04, c = '#050505') => { p.add('box', c, 0.06, 0.05, 0.01, -0.065, y + dy, z).add('box', c, 0.06, 0.05, 0.01, 0.065, y + dy, z); };
  switch (id) {
    case 'pig':
      p.add('box', '#d79c98', 0.27, 0.3, 0.28, 0, y, 0).add('cyl', '#c4807b', 0.12, 0.07, 0.12, 0, y - 0.03, -0.16, Math.PI / 2)
        .add('box', '#4a1f1f', 0.02, 0.02, 0.01, -0.022, y - 0.03, -0.196).add('box', '#4a1f1f', 0.02, 0.02, 0.01, 0.022, y - 0.03, -0.196)
        .add('box', '#d79c98', 0.07, 0.08, 0.03, -0.11, y + 0.17, -0.02).add('box', '#d79c98', 0.07, 0.08, 0.03, 0.11, y + 0.17, -0.02)
        .add('box', '#6a1a1a', 0.1, 0.02, 0.01, 0, y - 0.1, -0.141);
      eyes(-0.142); break;
    case 'skull':
      p.add('box', '#e6dfcc', 0.26, 0.3, 0.27, 0, y, 0); eyes(-0.137);
      p.add('box', '#050505', 0.03, 0.04, 0.01, 0, y - 0.02, -0.137).add('box', '#f4f0e4', 0.14, 0.035, 0.01, 0, y - 0.09, -0.137);
      for (let i = -2; i <= 2; i++) p.add('box', '#111', 0.004, 0.035, 0.012, i * 0.028, y - 0.09, -0.138);
      p.add('box', '#9a8f7a', 0.004, 0.1, 0.01, 0.05, y + 0.1, -0.137, 0, 0, 0.5);
      break;
    case 'grin':
      p.add('box', '#141414', 0.28, 0.32, 0.29, 0, y + 0.01, 0).add('box', '#efefe8', 0.24, 0.27, 0.02, 0, y, -0.15)
        .add('box', '#050505', 0.06, 0.025, 0.01, -0.06, y + 0.04, -0.161).add('box', '#050505', 0.06, 0.025, 0.01, 0.06, y + 0.04, -0.161)
        .add('box', '#8a0b10', 0.15, 0.03, 0.01, 0, y - 0.06, -0.161).add('box', '#8a0b10', 0.03, 0.04, 0.01, -0.085, y - 0.035, -0.161).add('box', '#8a0b10', 0.03, 0.04, 0.01, 0.085, y - 0.035, -0.161);
      break;
    case 'doll':
      p.add('box', '#ede3d6', 0.25, 0.28, 0.26, 0, y, 0).add('box', '#111', 0.27, 0.1, 0.28, 0, y + 0.15, 0).add('box', '#111', 0.27, 0.2, 0.05, 0, y + 0.05, 0.12);
      eyes(-0.132, 0.03, '#0a0a0a');
      p.add('box', '#d98c8c', 0.04, 0.025, 0.01, -0.08, y - 0.03, -0.132).add('box', '#d98c8c', 0.04, 0.025, 0.01, 0.08, y - 0.03, -0.132)
        .add('box', '#6a0d16', 0.05, 0.02, 0.01, 0, y - 0.08, -0.132).add('box', '#5a5048', 0.005, 0.12, 0.01, 0.03, y, -0.133, 0, 0, 0.4);
      break;
    case 'gas':
      p.add('box', '#2b2e29', 0.27, 0.3, 0.28, 0, y, 0)
        .add('cyl', '#0d1a1c', 0.09, 0.03, 0.09, -0.06, y + 0.04, -0.15, Math.PI / 2).add('cyl', '#0d1a1c', 0.09, 0.03, 0.09, 0.06, y + 0.04, -0.15, Math.PI / 2)
        .add('cyl', '#3b3f38', 0.11, 0.12, 0.11, 0, y - 0.08, -0.19, Math.PI / 2).add('box', '#1d1f1b', 0.3, 0.03, 0.03, 0, y + 0.05, 0.13);
      break;
    default: // burlap sack
      p.add('box', '#7b6844', 0.29, 0.33, 0.3, 0, y + 0.01, 0); eyes(-0.152);
      p.add('box', '#2a1d10', 0.15, 0.015, 0.01, 0, y - 0.07, -0.152);
      for (let i = -2; i <= 2; i++) p.add('box', '#2a1d10', 0.006, 0.04, 0.012, i * 0.03, y - 0.07, -0.153);
      p.add('box', '#5b4a2a', 0.3, 0.035, 0.31, 0, y - 0.12, 0).add('box', '#4a0606', 0.05, 0.07, 0.01, 0.09, y - 0.03, -0.152);
  }
}

// pose: '' | 'cower' | 'hide' | 'attack' | 'held' | 'choke' | 'down'
export function animChar(c, speed, dt, pose) {
  const u = c.userData, P = u.P;
  u.phase += dt * (1.6 + speed * 2.2);
  const ph = u.phase;
  const amp = Math.min(1, speed / 4.5), run = Math.min(1, speed / 3.2);
  const s = Math.sin(ph) * amp;
  let hipY = 0.95, tor = -Math.min(0.35, speed * 0.06), lA = -s * 0.9, rA = s * 0.9, lE = 0.25 + run * 0.9, rE = 0.25 + run * 0.9;
  let lL = s * 0.9, rL = -s * 0.9, lK = -Math.max(0, -Math.sin(ph)) * 1.3 * amp - 0.05, rK = -Math.max(0, Math.sin(ph)) * 1.3 * amp - 0.05;
  let head = 0, rootX = 0, lift = 0, mouth = 0.02, snap = false;
  if (u.killer) { rA = 0.45 + s * 0.2; rE = 0.5; }
  switch (pose) {
    case 'flee': mouth = 0.06; head = -0.1; break;
    case 'cower': hipY = 0.55; tor = -0.45; lL = rL = 1.5; lK = rK = -2.2; lA = rA = 2.6; lE = rE = 1.9; head = 0.35; mouth = 0.05; break;
    case 'hide': hipY = 0.5; tor = -0.25; lL = rL = 1.6; lK = rK = -2.3; lA = rA = 0.7; lE = rE = 1.6; break;
    case 'held': case 'choke': {
      const f = pose === 'choke' ? 7 : 4, k = Math.sin(ph * f);
      u.phase += dt * f;
      tor = 0.12; lA = 2.5 + k * 0.2; rA = 2.5 - k * 0.2; lE = rE = 1.6; lL = 0.5 + k * 0.7; rL = 0.5 - k * 0.7;
      lK = -0.5 - Math.abs(k) * 0.7; rK = -0.5 - Math.abs(k) * 0.7; head = pose === 'choke' ? 0.55 + Math.sin(ph * 9) * 0.08 : 0.25; mouth = 0.065; snap = true;
      break;
    }
    case 'down': {
      const k = Math.sin(ph * 2.5);
      rootX = 1.35; lift = 0.14; tor = -0.55; lA = rA = -0.8; lE = rE = 0.6; lL = 0.5 + k * 0.4; rL = 0.5 - k * 0.4; lK = rK = -0.9; head = -0.4; mouth = 0.06;
      break;
    }
    case 'attack': {
      u.atk += dt; const a = u.atk % 0.6;
      rA = a < 0.25 ? 0.4 + (a / 0.25) * 2.4 : Math.max(0.2, 2.8 - ((a - 0.25) / 0.2) * 2.8); rE = 0.3; snap = true;
      break;
    }
  }
  if (pose !== 'attack') u.atk = 0;
  const k = 1 - Math.exp(-dt * 12);
  const L = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
  L(P.torso.rotation, 'x', tor);
  L(P.armL.rotation, 'x', lA); L(P.elbowL.rotation, 'x', lE); L(P.elbowR.rotation, 'x', rE);
  if (snap) P.armR.rotation.x = rA; else L(P.armR.rotation, 'x', rA);
  L(P.legL.rotation, 'x', lL); L(P.legR.rotation, 'x', rL); L(P.kneeL.rotation, 'x', lK); L(P.kneeR.rotation, 'x', rK);
  L(P.head.rotation, 'x', head + (u.look2 || 0));
  L(P.hips.position, 'y', hipY); P.torso.position.y = P.hips.position.y + 0.07;
  L(c.rotation, 'x', rootX);
  u.lift += (lift - u.lift) * k;
  if (P.mouth) P.mouth.scale.y += (mouth - P.mouth.scale.y) * k;
}

// ---------- weapons (grip at the origin, pointing along -Z) ----------
const STEEL = '#b8bdc4';
const BLOOD = new THREE.Color('#5a0306');
export function makeWeapon(id) {
  const g = new THREE.Group();
  const blade = new THREE.MeshPhongMaterial({ color: STEEL, shininess: 80, specular: 0x999999 });
  const base = new THREE.Color(id === 'sledge' ? '#3a3a3a' : STEEL);
  blade.color.copy(base);
  const p = new Piece();
  let len = 0.6;
  const B = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(UBOX, blade); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); };
  switch (id) {
    case 'axe':
      p.add('box', '#6b4a2b', 0.04, 0.045, 0.72, 0, 0, -0.26).add('box', '#2a2a2a', 0.05, 0.08, 0.12, 0, 0.02, -0.57);
      B(0.014, 0.16, 0.13, 0, 0.12, -0.57); len = 0.66; break;
    case 'cleaver':
      p.add('box', '#2b1a10', 0.03, 0.035, 0.13, 0, 0, 0.02).add('box', '#777', 0.012, 0.04, 0.03, 0, 0.01, -0.06);
      B(0.008, 0.14, 0.26, 0, 0.04, -0.2); len = 0.33; break;
    case 'sledge':
      p.add('box', '#7a5a35', 0.035, 0.035, 0.9, 0, 0, -0.33); B(0.24, 0.11, 0.11, 0, 0, -0.8); len = 0.86; break;
    case 'chainsaw':
      p.add('box', '#d9661a', 0.13, 0.15, 0.28, 0, 0.02, 0.06).add('box', '#222', 0.03, 0.04, 0.16, 0, 0.13, 0.03).add('box', '#1e1e1e', 0.14, 0.05, 0.05, 0, -0.02, 0.2)
        .add('box', '#151515', 0.026, 0.014, 0.57, 0, 0.035, -0.36).add('box', '#151515', 0.026, 0.014, 0.57, 0, -0.035, -0.36);
      B(0.02, 0.06, 0.56, 0, 0, -0.36); len = 0.64; break;
    case 'fork':
      p.add('box', '#6b4a2b', 0.035, 0.035, 1.15, 0, 0, -0.33).add('box', '#555', 0.2, 0.025, 0.025, 0, 0, -0.9);
      for (const x of [-0.09, 0, 0.09]) B(0.014, 0.014, 0.26, x, 0, -1.03);
      len = 1.15; break;
    default: // machete
      p.add('box', '#1b1b1b', 0.035, 0.04, 0.16, 0, 0, 0.02).add('box', '#333', 0.05, 0.06, 0.015, 0, 0, -0.065);
      B(0.01, 0.06, 0.5, 0, 0.005, -0.32); B(0.01, 0.035, 0.1, 0, -0.007, -0.6); len = 0.64;
  }
  g.add(p.mesh());
  g.userData = { blade, base, len, id };
  return g;
}
export function setWeaponBlood(w, k) { const u = w && w.userData; if (u && u.blade) u.blade.color.copy(u.base).lerp(BLOOD, k); }

export function makeFlashlight() {
  const g = new THREE.Group();
  const p = new Piece().add('cyl', '#2b2b2e', 0.05, 0.18, 0.05, 0, 0, -0.02, Math.PI / 2).add('cyl', '#3a3a3e', 0.07, 0.05, 0.07, 0, 0, -0.13, Math.PI / 2);
  g.add(p.mesh());
  const lens = new THREE.Mesh(UCYL, mat('#fff6d8', '#fff6d8')); lens.scale.set(0.06, 0.01, 0.06); lens.rotation.x = Math.PI / 2; lens.position.z = -0.158; g.add(lens);
  return g;
}
export function makeGlove(color = '#1b1b1b') {
  const g = new THREE.Group();
  g.add(new Piece().add('box', color, 0.09, 0.1, 0.12, 0, -0.01, 0.02).add('box', color, 0.085, 0.04, 0.08, 0, 0, -0.07).add('box', color, 0.03, 0.04, 0.06, -0.05, 0.02, -0.02).mesh());
  return g;
}
// A boot that swings into view when you kick or stomp (desktop and phone).
export function makeBoot() {
  const g = new THREE.Group();
  g.add(new Piece().add('box', '#1d1712', 0.16, 0.5, 0.18, 0, 0.25, 0).add('box', '#141414', 0.18, 0.12, 0.34, 0, -0.02, -0.07).add('box', '#0a0a0a', 0.19, 0.04, 0.36, 0, -0.08, -0.07).mesh());
  return g;
}

const CONE = new THREE.ConeGeometry(1.4, 7, 14, 1, true).translate(0, -3.5, 0).rotateX(Math.PI / 2);
const CONE_MAT = new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
export function makeBeamCone() { const m = new THREE.Mesh(CONE, CONE_MAT); m.position.z = -0.16; return m; }

export function makeTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(8,4,6,.7)'; x.fillRect(0, 8, 256, 48);
  x.font = '700 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
  x.fillText(text.slice(0, 18), 128, 33);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(0.8, 0.2, 1);
  return s;
}

let senseTex = null;
export function makeSense() {
  if (!senseTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,60,50,1)'); gr.addColorStop(0.4, 'rgba(220,20,20,.6)'); gr.addColorStop(1, 'rgba(120,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    senseTex = new THREE.CanvasTexture(cv);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: senseTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(1.1, 1.6, 1); s.renderOrder = 15;
  return s;
}
