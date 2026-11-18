// Gore: blood droplets, splats and pools on the ground, severed parts that tumble and bleed,
// and corpses that drop. Everything is pooled so a massacre stays cheap to draw.
import * as THREE from 'three';
import { UBOX, mat } from './models.js';

let root = null;
const MAXP = 2400;
const pPos = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP);
let pHead = 0, pGeo = null, pLive = 0;
const MAXD = 600;
let decals = null, dHead = 0;
const gibs = [], spurts = [], corpses = [], pools = [];

const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), TV = new THREE.Vector3(), TV2 = new THREE.Vector3();
const WOUND = new THREE.MeshLambertMaterial({ color: 0x5c0306 });
const POOLMAT = new THREE.MeshPhongMaterial({ color: 0x3a0204, shininess: 70, specular: 0x442222, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const POOLGEO = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const BLOODC = new THREE.Color(0x5a0306);
let clock = 0;

function rng(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function initGore(scene) {
  root = new THREE.Group(); scene.add(root);
  for (let i = 0; i < MAXP; i++) pPos[i * 3 + 1] = -999;
  pGeo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pPos, 3); attr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', attr);
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const dx = dot.getContext('2d'); dx.fillStyle = '#fff'; dx.beginPath(); dx.arc(16, 16, 14, 0, Math.PI * 2); dx.fill();
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x8a0309, size: 0.04, map: new THREE.CanvasTexture(dot), alphaTest: 0.5 }));
  pts.frustumCulled = false; root.add(pts);
  const dg = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  decals = new THREE.InstancedMesh(dg, POOLMAT, MAXD);
  decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  M4.makeScale(0, 0, 0);
  for (let i = 0; i < MAXD; i++) decals.setMatrixAt(i, M4);
  decals.frustumCulled = false; root.add(decals);
}

export function splat(x, z, size) {
  P3.set(x, 0.014 + (dHead % 40) * 0.0004, z);
  Q4.setFromAxisAngle(UP, Math.random() * 6.283);
  S3.set(size * (0.7 + Math.random() * 0.6), 1, size * (0.7 + Math.random() * 0.6));
  M4.compose(P3, Q4, S3);
  decals.setMatrixAt(dHead++ % MAXD, M4);
  decals.instanceMatrix.needsUpdate = true;
}

export function blood(pos, dir, n, speed = 3, spread = 1.5, up = 1.5) {
  for (let k = 0; k < n; k++) {
    const i = pHead++ % MAXP, j = i * 3;
    pPos[j] = pos.x + (Math.random() - 0.5) * 0.08;
    pPos[j + 1] = pos.y + (Math.random() - 0.5) * 0.08;
    pPos[j + 2] = pos.z + (Math.random() - 0.5) * 0.08;
    const s = speed * (0.3 + Math.random() * 0.9);
    pVel[j] = dir.x * s + (Math.random() - 0.5) * spread;
    pVel[j + 1] = dir.y * s + Math.random() * up;
    pVel[j + 2] = dir.z * s + (Math.random() - 0.5) * spread;
    pLife[i] = 1.2 + Math.random() * 1.5;
  }
  pLive = 3;
}

export function dripBlood(pos) {
  TV2.set(0, -0.2, 0);
  blood(pos, TV2, 2, 0.5, 0.15, 0);
}

function partCenter(P, part, out) {
  const o = P[part] || P.torso;
  if (part === 'head') out.set(0, 0.2, 0);
  else if (part === 'torso') out.set(0, 0.35, 0);
  else out.set(0, -0.35, 0);
  return o.localToWorld(out);
}

function tint(obj, amt) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; }
    if (o.material.color) o.material.color.lerp(BLOODC, amt);
  });
}

export function hurtFX(char, part, dir) {
  if (!char) return;
  char.updateMatrixWorld(true);
  const at = partCenter(char.userData.P, part, new THREE.Vector3());
  blood(at, TV.set(dir[0] * 0.8, 0.3, dir[1] * 0.8), 45, 2.6, 1.2, 1.4);
  splat(at.x + dir[0] * 0.5, at.z + dir[1] * 0.5, 0.25);
}

// g: { part, w, dir:[x,z], seed }, W: weapon definition
export function killFX(char, g, W) {
  const P = char.userData.P;
  const r = rng(g.seed | 0);
  const d = new THREE.Vector3(g.dir[0], 0, g.dir[1]);
  if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
  d.normalize();
  char.updateMatrixWorld(true);
  const at = partCenter(P, g.part, new THREE.Vector3());
  tint(char, 0.3);
  blood(at, TV.set(d.x, 0.35, d.z), W.crush ? 260 : 160, 3.6, 2, 2);
  splat(at.x + d.x * 0.8, at.z + d.z * 0.8, 0.5 + r() * 0.4);
  splat(at.x, at.z, 0.35);

  const detach = (name, force = 1) => {
    const piv = P[name];
    if (!piv || piv.parent === root || !piv.parent) return;
    const parent = piv.parent;
    const local = piv.position.clone();
    const wound = new THREE.Mesh(UBOX, WOUND);
    wound.scale.set(name === 'head' ? 0.13 : 0.11, 0.04, name === 'head' ? 0.13 : 0.11);
    wound.position.copy(local); parent.add(wound);
    piv.updateMatrixWorld(true);
    root.attach(piv);
    gibs.push({
      o: piv, rest: false, bleed: 2.2,
      v: new THREE.Vector3(d.x * (2 + r() * 2.5) * force + (r() - 0.5) * 1.5, 2.4 + r() * 3, d.z * (2 + r() * 2.5) * force + (r() - 0.5) * 1.5),
      av: new THREE.Vector3((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14),
    });
    const axis = name === 'head' ? new THREE.Vector3(0, 1, 0) : name.startsWith('arm') ? new THREE.Vector3(Math.sign(local.x), 0.3, 0) : new THREE.Vector3(0, -1, 0);
    spurts.push({ parent, local, axis: axis.normalize(), t: 2.5 + r() * 1.5 });
    while (gibs.length > 70) { const old = gibs.shift(); old.o.removeFromParent(); }
  };

  const limb = /^(arm|leg)/.test(g.part);
  if (W.crush && (g.part === 'head' || r() < 0.45)) {
    // The skull bursts.
    const head = P.head;
    const hp = head.localToWorld(new THREE.Vector3(0, 0.2, 0));
    head.visible = false;
    const wound = new THREE.Mesh(UBOX, WOUND); wound.scale.set(0.13, 0.05, 0.13); wound.position.copy(head.position); head.parent.add(wound);
    blood(hp, TV.set(d.x * 0.5, 0.8, d.z * 0.5), 300, 4, 3, 3);
    const cols = ['#7a0a0a', '#e8dccb', '#5a0306', '#d39f76'];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(UBOX, mat(cols[i % cols.length]));
      const s = 0.04 + r() * 0.06; m.scale.set(s, s, s); m.position.copy(hp); root.add(m);
      gibs.push({ o: m, rest: false, bleed: 1, v: new THREE.Vector3(d.x * 3 + (r() - 0.5) * 5, 2 + r() * 4, d.z * 3 + (r() - 0.5) * 5), av: new THREE.Vector3(r() * 10, r() * 10, r() * 10) });
    }
    for (let i = 0; i < 5; i++) splat(hp.x + d.x * (0.5 + r() * 2) + (r() - 0.5), hp.z + d.z * (0.5 + r() * 2) + (r() - 0.5), 0.2 + r() * 0.35);
    spurts.push({ parent: head.parent, local: head.position.clone(), axis: new THREE.Vector3(0, 1, 0), t: 3 });
  } else {
    const decap = g.part === 'head' ? r() < W.decap + 0.3 : !limb && r() < W.decap * 0.6;
    if (decap) detach('head', 1);
    if (limb && (W.decap > 0 || W.saw) && r() < 0.75) detach(g.part, 1.2);
    if (W.saw) {
      const others = ['armL', 'armR', 'legL', 'legR'].filter(n => n !== g.part);
      detach(others[(r() * others.length) | 0], 1.4);
      if (r() < 0.5) detach(others[(r() * others.length) | 0], 1.4);
    }
  }
  if (W.impale) spurts.push({ parent: P.torso, local: new THREE.Vector3(0, 0.35, -0.13), axis: new THREE.Vector3(0, 0.2, -1).normalize(), t: 2 });

  // The body drops in the direction of the blow.
  const axis = new THREE.Vector3().crossVectors(UP, d).normalize();
  const q0 = char.quaternion.clone();
  const q1 = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(q0);
  corpses.push({ char, t: W.impale ? -0.7 : 0, q0, q1, y0: char.position.y, pool: null });
}

export function updateGore(dt) {
  clock += dt;
  // droplets
  if (pLive > 0) {
    let any = false;
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) continue;
      any = true;
      const j = i * 3;
      pVel[j + 1] -= 9.8 * dt;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      pLife[i] -= dt;
      if (pPos[j + 1] <= 0.02) {
        if (Math.random() < 0.12) splat(pPos[j], pPos[j + 2], 0.04 + Math.random() * 0.12);
        pLife[i] = 0;
      }
      if (pLife[i] <= 0) pPos[j + 1] = -999;
    }
    pGeo.attributes.position.needsUpdate = true;
    if (!any) pLive--;
  }
  // severed parts
  for (const g of gibs) {
    if (g.bleed > 0) {
      g.bleed -= dt;
      if (Math.random() < 0.6) blood(g.o.getWorldPosition(TV), TV2.set(0, 0.2, 0), 1, 0.6, 0.4, 0.4);
    }
    if (g.rest) continue;
    g.v.y -= 9.8 * dt;
    g.o.position.addScaledVector(g.v, dt);
    g.o.rotation.x += g.av.x * dt; g.o.rotation.y += g.av.y * dt; g.o.rotation.z += g.av.z * dt;
    if (g.o.position.y < 0.08) {
      g.o.position.y = 0.08;
      if (Math.abs(g.v.y) > 1) { g.v.y *= -0.3; splat(g.o.position.x, g.o.position.z, 0.18); } else g.v.y = 0;
      g.v.x *= 0.7; g.v.z *= 0.7; g.av.multiplyScalar(0.6);
      if (g.v.lengthSq() < 0.04) { g.rest = true; splat(g.o.position.x, g.o.position.z, 0.28); }
    }
  }
  // arterial spray from stumps, pulsing like a heartbeat
  for (let i = spurts.length - 1; i >= 0; i--) {
    const s = spurts[i];
    s.t -= dt;
    if (s.t <= 0 || !s.parent.parent) { spurts.splice(i, 1); continue; }
    const pulse = Math.sin(clock * 9) > 0.1 ? 1 : 0.25;
    const n = Math.max(1, Math.round(dt * 110 * pulse));
    const p = s.parent.localToWorld(TV.copy(s.local));
    const dir = TV2.copy(s.axis).transformDirection(s.parent.matrixWorld);
    blood(p, dir, n, 1.2 + Math.min(2.5, s.t), 0.5, 0.3);
  }
  // falling bodies and spreading pools
  for (const c of corpses) {
    if (c.t < 1.5) {
      c.t += dt;
      if (c.t >= 0) {
        const k = Math.min(1, c.t / 0.55), e = k * k;
        c.char.quaternion.slerpQuaternions(c.q0, c.q1, e);
        c.char.position.y = c.y0 + 0.12 * e;
        if (k >= 1 && !c.pool) {
          c.char.updateMatrixWorld(true);
          const p = c.char.localToWorld(TV.set(0, 1.1, 0));
          const m = new THREE.Mesh(POOLGEO, POOLMAT); m.position.set(p.x, 0.012, p.z); m.scale.setScalar(0.1);
          root.add(m); c.pool = m; pools.push(m);
          while (pools.length > 40) pools.shift().removeFromParent();
        }
      }
    }
    if (c.pool && c.pool.scale.x < 1.15) c.pool.scale.setScalar(c.pool.scale.x + dt * 0.22);
  }
}

export function clearGore() {
  for (const g of gibs) g.o.removeFromParent();
  for (const p of pools) p.removeFromParent();
  gibs.length = 0; spurts.length = 0; corpses.length = 0; pools.length = 0;
  for (let i = 0; i < MAXP; i++) { pLife[i] = 0; pPos[i * 3 + 1] = -999; }
  if (pGeo) pGeo.attributes.position.needsUpdate = true;
  M4.makeScale(0, 0, 0);
  for (let i = 0; i < MAXD; i++) decals.setMatrixAt(i, M4);
  decals.instanceMatrix.needsUpdate = true;
  dHead = 0;
}
