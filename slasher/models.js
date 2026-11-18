// Low-poly characters, masks, weapons and small props, built from boxes and cylinders.
import * as THREE from 'three';
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

function bx(p, c, sx, sy, sz, x, y, z, e) {
  const m = new THREE.Mesh(UBOX, typeof c === 'string' ? mat(c, e) : c);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); p.add(m); return m;
}
function cy(p, c, r, h, x, y, z, rx = 0, rz = 0, e) {
  const m = new THREE.Mesh(UCYL, typeof c === 'string' ? mat(c, e) : c);
  m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); p.add(m); return m;
}
export function shade(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }

// ---------- looks ----------
export function killerLook(l) {
  const o = (OUTFITS[l.outfit] || OUTFITS[0]).c;
  return { kind: 'killer', mask: l.mask, skin: SKINS[l.skin] || SKINS[0], shirt: o, pants: shade(o, 0.55), weapon: l.weapon };
}
export function camperLook(l) {
  return { kind: 'camper', skin: SKINS[l.skin] || SKINS[0], shirt: (OUTFITS[l.outfit] || OUTFITS[0]).c, pants: '#2f3e5c', hair: '#3a2615', long: false };
}
export function npcLook(i) {
  i = Math.abs(i | 0);
  return {
    kind: 'camper', skin: SKINS[i % 4], shirt: SHIRTS[(i * 7) % SHIRTS.length], pants: PANTS[(i * 3) % PANTS.length],
    hair: HAIRS[(i * 5) % HAIRS.length], long: i % 3 === 0,
  };
}
export function aiLook(seed) {
  const m = MASKS[Math.abs(seed | 0) % MASKS.length].id;
  return { kind: 'killer', mask: m, skin: SKINS[1], shirt: '#3a2a20', pants: '#1d1712', weapon: 'machete' };
}

// ---------- characters ----------
// Origin at the feet, facing -Z. Parts hang from pivots so they can animate and come off.
export function makeChar(L) {
  const g = new THREE.Group();
  const P = {};
  g.userData = { P, phase: Math.random() * 6, atk: 0, killer: L.kind === 'killer' };
  const killer = L.kind === 'killer';
  const shoes = killer ? '#141414' : '#e8e8e8';
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(0.1 * s, 0.92, 0); g.add(piv);
    bx(piv, L.pants, 0.17, 0.84, 0.19, 0, -0.42, 0);
    bx(piv, shoes, 0.18, 0.1, 0.27, 0, -0.87, -0.03);
    P[s < 0 ? 'legL' : 'legR'] = piv;
  }
  const torso = new THREE.Group(); torso.position.set(0, 0.92, 0); g.add(torso); P.torso = torso;
  bx(torso, L.pants, 0.4, 0.12, 0.23, 0, 0.04, 0);
  bx(torso, L.shirt, 0.44, 0.56, 0.25, 0, 0.36, 0);
  if (killer) {
    bx(torso, '#4a3b2c', 0.38, 0.6, 0.02, 0, 0.28, -0.135);
    bx(torso, '#4a0606', 0.12, 0.09, 0.01, 0.07, 0.38, -0.147);
    bx(torso, '#3d0404', 0.08, 0.14, 0.01, -0.09, 0.18, -0.147);
  }
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(0.29 * s, 0.6, 0); torso.add(piv);
    bx(piv, L.shirt, 0.13, 0.3, 0.14, 0, -0.13, 0);
    bx(piv, killer ? L.shirt : L.skin, 0.11, 0.3, 0.12, 0, -0.4, 0);
    bx(piv, killer ? '#1b1b1b' : L.skin, 0.1, 0.1, 0.1, 0, -0.6, 0);
    const hand = new THREE.Object3D(); hand.position.set(0, -0.62, -0.02); piv.add(hand);
    P[s < 0 ? 'armL' : 'armR'] = piv; P[s < 0 ? 'handL' : 'handR'] = hand;
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.64, 0); torso.add(neck); P.head = neck;
  bx(neck, L.skin, 0.1, 0.08, 0.1, 0, 0.03, 0);
  bx(neck, L.skin, 0.24, 0.27, 0.25, 0, 0.2, 0);
  if (killer) addMask(neck, L.mask);
  else {
    bx(neck, '#111', 0.04, 0.035, 0.01, -0.06, 0.23, -0.126);
    bx(neck, '#111', 0.04, 0.035, 0.01, 0.06, 0.23, -0.126);
    bx(neck, shade(L.skin, 0.7), 0.08, 0.02, 0.01, 0, 0.12, -0.126);
    bx(neck, L.hair, 0.26, 0.07, 0.27, 0, 0.35, 0);
    bx(neck, L.hair, 0.26, L.long ? 0.32 : 0.16, 0.05, 0, L.long ? 0.18 : 0.26, 0.125);
  }
  if (killer) g.scale.setScalar(1.08);
  return g;
}

function addMask(n, id) {
  const y = 0.2;
  const eyes = (z, dy = 0.04, c = '#050505') => { bx(n, c, 0.06, 0.05, 0.01, -0.065, y + dy, z); bx(n, c, 0.06, 0.05, 0.01, 0.065, y + dy, z); };
  let ez = -0.153;
  switch (id) {
    case 'pig':
      bx(n, '#d79c98', 0.27, 0.3, 0.28, 0, y, 0);
      cy(n, '#c4807b', 0.06, 0.07, 0, y - 0.03, -0.16, Math.PI / 2);
      bx(n, '#4a1f1f', 0.02, 0.02, 0.01, -0.022, y - 0.03, -0.196); bx(n, '#4a1f1f', 0.02, 0.02, 0.01, 0.022, y - 0.03, -0.196);
      bx(n, '#d79c98', 0.07, 0.08, 0.03, -0.11, y + 0.17, -0.02); bx(n, '#d79c98', 0.07, 0.08, 0.03, 0.11, y + 0.17, -0.02);
      eyes(-0.142); ez = -0.143; break;
    case 'skull':
      bx(n, '#e6dfcc', 0.26, 0.3, 0.27, 0, y, 0); eyes(-0.137);
      bx(n, '#050505', 0.03, 0.04, 0.01, 0, y - 0.02, -0.137);
      bx(n, '#f4f0e4', 0.14, 0.035, 0.01, 0, y - 0.09, -0.137);
      for (let i = -2; i <= 2; i++) bx(n, '#111', 0.004, 0.035, 0.012, i * 0.028, y - 0.09, -0.138);
      ez = -0.138; break;
    case 'grin':
      bx(n, '#141414', 0.28, 0.32, 0.29, 0, y + 0.01, 0);
      bx(n, '#efefe8', 0.24, 0.27, 0.02, 0, y, -0.15);
      bx(n, '#050505', 0.06, 0.025, 0.01, -0.06, y + 0.04, -0.161); bx(n, '#050505', 0.06, 0.025, 0.01, 0.06, y + 0.04, -0.161);
      bx(n, '#8a0b10', 0.15, 0.03, 0.01, 0, y - 0.06, -0.161);
      bx(n, '#8a0b10', 0.03, 0.04, 0.01, -0.085, y - 0.035, -0.161); bx(n, '#8a0b10', 0.03, 0.04, 0.01, 0.085, y - 0.035, -0.161);
      ez = -0.162; break;
    case 'doll':
      bx(n, '#ede3d6', 0.25, 0.28, 0.26, 0, y, 0);
      bx(n, '#111', 0.27, 0.1, 0.28, 0, y + 0.15, 0); bx(n, '#111', 0.27, 0.2, 0.05, 0, y + 0.05, 0.12);
      eyes(-0.132, 0.03, '#0a0a0a');
      bx(n, '#d98c8c', 0.04, 0.025, 0.01, -0.08, y - 0.03, -0.132); bx(n, '#d98c8c', 0.04, 0.025, 0.01, 0.08, y - 0.03, -0.132);
      bx(n, '#6a0d16', 0.05, 0.02, 0.01, 0, y - 0.08, -0.132);
      bx(n, '#5a5048', 0.005, 0.12, 0.01, 0.03, y, -0.133).rotation.z = 0.4;
      ez = -0.133; break;
    case 'gas':
      bx(n, '#2b2e29', 0.27, 0.3, 0.28, 0, y, 0);
      cy(n, '#0d1a1c', 0.045, 0.03, -0.06, y + 0.04, -0.15, Math.PI / 2); cy(n, '#0d1a1c', 0.045, 0.03, 0.06, y + 0.04, -0.15, Math.PI / 2);
      cy(n, '#3b3f38', 0.055, 0.12, 0, y - 0.08, -0.19, Math.PI / 2);
      ez = -0.166; break;
    default: // burlap sack
      bx(n, '#7b6844', 0.29, 0.33, 0.3, 0, y + 0.01, 0); eyes(-0.152);
      bx(n, '#2a1d10', 0.15, 0.015, 0.01, 0, y - 0.07, -0.152);
      for (let i = -2; i <= 2; i++) bx(n, '#2a1d10', 0.006, 0.04, 0.012, i * 0.03, y - 0.07, -0.153);
      bx(n, '#5b4a2a', 0.3, 0.035, 0.31, 0, y - 0.12, 0);
  }
  // A faint red glint in the eyes.
  bx(n, '#ff2a1a', 0.02, 0.012, 0.004, -0.065, y + 0.04, ez - 0.001, '#ff1a0a');
  bx(n, '#ff2a1a', 0.02, 0.012, 0.004, 0.065, y + 0.04, ez - 0.001, '#ff1a0a');
}

// pose: '' walking, 'cower', 'attack'
export function animChar(c, speed, dt, pose) {
  const u = c.userData, P = u.P;
  const amp = Math.min(1, speed / 4.5) * 0.95;
  u.phase += dt * (1.5 + speed * 2.3);
  const s = Math.sin(u.phase) * amp;
  let tx = -Math.min(0.3, speed * 0.05), la = -s * 0.9, ra = s * 0.9, ll = s, rl = -s;
  if (u.killer) ra = 0.4 + s * 0.2;
  if (pose === 'cower') { tx = -0.55; la = 2.5; ra = 2.5; ll = -0.3; rl = 0.5; }
  let snap = false;
  if (pose === 'attack') {
    u.atk += dt; const a = u.atk % 0.6;
    ra = a < 0.25 ? 0.4 + (a / 0.25) * 2.4 : Math.max(0.2, 2.8 - ((a - 0.25) / 0.2) * 2.8);
    snap = true;
  } else u.atk = 0;
  const k = 1 - Math.exp(-dt * 14);
  P.torso.rotation.x += (tx - P.torso.rotation.x) * k;
  P.armL.rotation.x += (la - P.armL.rotation.x) * k;
  P.armR.rotation.x = snap ? ra : P.armR.rotation.x + (ra - P.armR.rotation.x) * k;
  P.legL.rotation.x += (ll - P.legL.rotation.x) * k;
  P.legR.rotation.x += (rl - P.legR.rotation.x) * k;
}

// ---------- weapons (grip at the origin, pointing along -Z) ----------
const STEEL = '#b8bdc4';
const BLOOD = new THREE.Color('#5a0306');
export function makeWeapon(id) {
  const g = new THREE.Group();
  const blade = new THREE.MeshPhongMaterial({ color: STEEL, shininess: 80, specular: 0x999999 });
  const base = new THREE.Color(id === 'sledge' ? '#3a3a3a' : STEEL);
  blade.color.copy(base);
  let len = 0.6;
  switch (id) {
    case 'axe':
      bx(g, '#6b4a2b', 0.04, 0.045, 0.72, 0, 0, -0.26); bx(g, '#2a2a2a', 0.05, 0.08, 0.12, 0, 0.02, -0.57);
      bx(g, blade, 0.014, 0.16, 0.13, 0, 0.12, -0.57); len = 0.66; break;
    case 'cleaver':
      bx(g, '#2b1a10', 0.03, 0.035, 0.13, 0, 0, 0.02); bx(g, '#777', 0.012, 0.04, 0.03, 0, 0.01, -0.06);
      bx(g, blade, 0.008, 0.14, 0.26, 0, 0.04, -0.2); len = 0.33; break;
    case 'sledge':
      bx(g, '#7a5a35', 0.035, 0.035, 0.9, 0, 0, -0.33); bx(g, blade, 0.24, 0.11, 0.11, 0, 0, -0.8); len = 0.86; break;
    case 'chainsaw':
      bx(g, '#d9661a', 0.13, 0.15, 0.28, 0, 0.02, 0.06); bx(g, '#222', 0.03, 0.04, 0.16, 0, 0.13, 0.03);
      bx(g, '#1e1e1e', 0.14, 0.05, 0.05, 0, -0.02, 0.2); bx(g, blade, 0.02, 0.06, 0.56, 0, 0, -0.36);
      bx(g, '#151515', 0.026, 0.014, 0.57, 0, 0.035, -0.36); bx(g, '#151515', 0.026, 0.014, 0.57, 0, -0.035, -0.36);
      len = 0.64; break;
    case 'fork':
      bx(g, '#6b4a2b', 0.035, 0.035, 1.15, 0, 0, -0.33); bx(g, '#555', 0.2, 0.025, 0.025, 0, 0, -0.9);
      for (const x of [-0.09, 0, 0.09]) bx(g, blade, 0.014, 0.014, 0.26, x, 0, -1.03);
      len = 1.15; break;
    default: // machete
      bx(g, '#1b1b1b', 0.035, 0.04, 0.16, 0, 0, 0.02); bx(g, '#333', 0.05, 0.06, 0.015, 0, 0, -0.065);
      bx(g, blade, 0.01, 0.06, 0.5, 0, 0.005, -0.32); bx(g, blade, 0.01, 0.035, 0.1, 0, -0.007, -0.6); len = 0.64;
  }
  g.userData = { blade, base, len, id };
  return g;
}
export function setWeaponBlood(w, k) { const u = w && w.userData; if (u && u.blade) u.blade.color.copy(u.base).lerp(BLOOD, k); }

export function makeFlashlight() {
  const g = new THREE.Group();
  cy(g, '#2b2b2e', 0.025, 0.18, 0, 0, -0.02, Math.PI / 2);
  cy(g, '#3a3a3e', 0.035, 0.05, 0, 0, -0.13, Math.PI / 2);
  cy(g, '#fff6d8', 0.03, 0.01, 0, 0, -0.158, Math.PI / 2, 0, '#fff6d8');
  return g;
}
export function makeGlove(color = '#1b1b1b') {
  const g = new THREE.Group();
  bx(g, color, 0.09, 0.1, 0.12, 0, -0.01, 0.02);
  bx(g, color, 0.085, 0.04, 0.08, 0, 0.0, -0.07);
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
