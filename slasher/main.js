// Cheet Slasher: the game. Menu, rounds, AI, combat, input, networking glue and the render loop.
import * as THREE from 'three';
import { hostServer, joinServer, MAX_PLAYERS } from './net.js';
import { audioInit, sfx, setSaw, say } from './audio.js';
import { LEVELS, MAPS, WEAPONS, WEAPON, MASKS, OUTFITS, SKINS, CAMPER_NAMES, VERBS, NAME_A, NAME_B } from './data.js';
import { makeChar, animChar, makeWeapon, setWeaponBlood, makeFlashlight, makeBeamCone, makeTag, makeSense, makeGlove, makeBoot, killerLook, camperLook, npcLook, aiLook } from './models.js';
import { getLayout, buildMap, buildMenu, buildSky, resolve, los, blocked, openPoint, mulberry } from './world.js';
import { initGore, updateGore, killFX, hurtFX, clearGore, dripBlood, setGoreWorld, blood, mist } from './gore.js';

// ---------- basics ----------
const params = new URLSearchParams(location.search);
const LOCAL_NET = params.get('net') === 'local';
const TOUCH = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const QUEST = /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const UP = new THREE.Vector3(0, 1, 0);
const TV = new THREE.Vector3(), TV2 = new THREE.Vector3(), TV3 = new THREE.Vector3(), TQ = new THREE.Quaternion(), TM = new THREE.Matrix4();
const PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
const POSES = ['', 'flee', 'cower', 'attack', 'held', 'choke', 'down', 'hide'];
const SPECIAL = { fists: { id: 'fists', dmg: 14, reach: 1.5, swing: 0.35 }, choke: { id: 'choke' }, stomp: { id: 'stomp', crush: true } };
const SPECIAL_VERBS = { fists: 'beaten to death', choke: 'strangled', stomp: 'stomped to death' };
const weaponDef = id => WEAPON[id] || SPECIAL[id] || WEAPON.machete;
const LINES = {
  flee: ['Help!', 'Somebody help me!', 'Run!', 'Oh my god, run!', 'Get away from me!', "He's got a knife!", 'Help us!'],
  hurt: ['Please! Please stop!', 'No no no!', 'It hurts!', 'Stop!'],
  held: ['Let me go!', "Please don't kill me!", 'No! Please!', 'Help me!'],
  cower: ["Please, I'll do anything", "Don't hurt me", 'Please, no'],
};
const pick = a => a[(Math.random() * a.length) | 0];

// ---------- renderer & scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !QUEST, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUEST ? 1 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
try { renderer.xr.setFoveation(1); } catch (e) {}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 6, 40);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
camera.position.set(0, 1.65, 0);
scene.add(new THREE.HemisphereLight(0x50608a, 0x0b0a08, 0.75));
const moonLight = new THREE.DirectionalLight(0xa8b8ff, 0.55); moonLight.position.set(-30, 60, -50); scene.add(moonLight);
buildSky(scene);
initGore(scene);
const charsGroup = new THREE.Group(); scene.add(charsGroup);
const menu = buildMenu(scene);
let world = null;

// ---------- profile ----------
function randomName() { return NAME_A[(Math.random() * NAME_A.length) | 0] + ' ' + NAME_B[(Math.random() * NAME_B.length) | 0]; }
const look = Object.assign({ mask: 'sack', outfit: 0, skin: 0, weapon: 'machete', role: 'killer', name: '' }, (() => { try { return JSON.parse(store.get('cs-look') || '{}'); } catch (e) { return {}; } })());
if (!look.name) look.name = randomName();
if (!WEAPON[look.weapon]) look.weapon = 'machete';
function saveLook() { store.set('cs-look', JSON.stringify(look)); }
function meInfo() { return { id: G.myId, name: look.name, role: look.role, look: { mask: look.mask, outfit: look.outfit, skin: look.skin, weapon: look.weapon } }; }

// ---------- game state ----------
const G = {
  mode: 'menu', tab: 'play', role: 'solo', net: null, myId: 'host', code: '', codeEntry: '', err: '', connecting: false, welcomed: false,
  players: new Map(), ents: new Map(), sel: { map: 'hood', level: 0 }, phase: 'lobby', timeLeft: 0, levelIdx: 0, mapId: 'hood', round: null,
  me: { hp: 100, dead: false, stamina: 6, role: 'killer', swingT: 0, hitDone: true, senseT: 0, senseCD: 0, exhausted: false },
  yaw: 0, pitch: 0, paused: false, endInfo: null, blood: 0, kills: new Map(), feed: [], lastHost: 0, sendT: 0, pingT: 0, now: 0,
  head: new THREE.Vector3(), hitCD: new Map(), prevTip: new THREE.Vector3(), tipValid: false, tipSpd: 0, lastWhoosh: 0, sawTick: 0,
  weapon: null, pickups: new Map(), pkSeq: 1, hold: { L: null, R: null }, choke: { L: false, R: false }, rmbT: 0, kickT: 0, kickCD: 0, partyT: 0,
  handPrev: { L: new THREE.Vector3(), R: new THREE.Vector3() }, handVel: { L: new THREE.Vector3(), R: new THREE.Vector3() }, punchCD: 0,
  flashOn: true, turnLatch: false, shake: 0, splatA: 0, hbT: 0, menuDist: 2.2, locked: false, wasLocked: false, lobbyTimer: 0,
};
G.players.set('host', meInfo());

// ---------- held items, lights ----------
const vm = new THREE.Group(); camera.add(vm); vm.position.set(0.3, -0.34, -0.5);
let vmItem = null, vrItem = null, vrGlove = null;
const flash = new THREE.SpotLight(0xfff0d0, 0, 30, 0.42, 0.5, 1.3);
const flashTarget = new THREE.Object3D(); flashTarget.position.set(0, 0, -5); flash.add(flashTarget); flash.target = flashTarget;
camera.add(flash);
const boot = makeBoot(); boot.visible = false; camera.add(boot);
const aura = new THREE.PointLight(0xb8a8c0, 0, 16, 1); aura.position.set(0, 0.45, 0.1); camera.add(aura);

const hands = [0, 1].map(i => {
  const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff4040 }));
  ray.scale.z = 3; ray.visible = false; ctrl.add(ray);
  const h = { i, ctrl, grip, ray, handed: null, src: null };
  ctrl.addEventListener('connected', e => { h.handed = e.data.handedness; h.src = e.data; refreshHeld(); });
  ctrl.addEventListener('disconnected', () => { h.handed = null; h.src = null; refreshHeld(); });
  ctrl.addEventListener('selectstart', () => { if (panelShown()) { const b = panelHitFrom(ctrl); if (b) pressButton(b); } });
  return h;
});
const handOf = s => hands.find(h => h.handed === s);
function buzz(h, v, ms) { try { h && h.src && h.src.gamepad && h.src.gamepad.hapticActuators && h.src.gamepad.hapticActuators[0] && h.src.gamepad.hapticActuators[0].pulse(v, ms); } catch (e) {} }
function buzzAll(v, ms) { hands.forEach(h => buzz(h, v, ms)); }

// Eye height on a flat screen: the killer is a big man.
function eyeH() { return G.mode === 'play' && G.me.role === 'killer' && !G.me.dead ? 1.82 : 1.65; }
function myRole() { return G.mode === 'play' ? G.me.role : look.role; }
function refreshHeld() {
  for (const o of [vmItem, vrItem, vrGlove]) if (o) o.removeFromParent();
  const role = myRole();
  const wid = G.mode === 'play' ? G.weapon : look.weapon;
  if (role === 'killer' && wid) {
    vmItem = makeWeapon(wid); vmItem.rotation.set(0.95, 0.1, -0.15);
    vrItem = makeWeapon(wid); vrItem.rotation.set(-0.35, 0, 0);
    setWeaponBlood(vmItem, G.blood); setWeaponBlood(vrItem, G.blood);
  } else if (role === 'killer') {
    vmItem = makeGlove(); vmItem.scale.setScalar(1.6); vmItem.position.set(0.02, 0.05, 0.05);
    vrItem = makeGlove(); vrItem.userData.len = 0.08; vmItem.userData.len = 0.08;
  } else {
    vmItem = makeFlashlight(); vmItem.rotation.set(0.05, 0.08, 0);
    vrItem = makeFlashlight();
  }
  vm.add(vmItem);
  const rh = handOf('right') || hands.find(h => h.handed !== 'left') || hands[0];
  rh.grip.add(vrItem);
  const lh = handOf('left');
  if (lh) { vrGlove = makeGlove(role === 'killer' ? '#1b1b1b' : (SKINS[look.skin] || SKINS[0])); lh.grip.add(vrGlove); } else vrGlove = null;
  G.tipValid = false;
  const holder = renderer.xr.isPresenting ? vrItem : vmItem;
  if (role === 'camper') { holder.add(flash); flash.position.set(0, 0, -0.16); } else { camera.add(flash); flash.position.set(0, 0, 0); }
  updateLights();
}
function updateLights() {
  const play = G.mode === 'play';
  flash.intensity = play && G.me.role === 'camper' && G.flashOn && !G.me.dead ? 55 : 0;
  aura.intensity = play ? (G.me.role === 'killer' ? 5 : G.me.dead ? 4 : 1.2) : 0;
}

// ---------- HUD (a small panel that floats in front of your face) ----------
const hudC = document.createElement('canvas'); hudC.width = 1024; hudC.height = 200;
const hx = hudC.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudC); hudTex.colorSpace = THREE.SRGBColorSpace;
const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.11), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
hud.renderOrder = 20; hud.position.set(0, -0.34, -0.8); hud.visible = false; camera.add(hud);
let hudT = 0;

// Blood that splashes onto your view.
const spC = document.createElement('canvas'); spC.width = spC.height = 512;
const spx = spC.getContext('2d');
const spTex = new THREE.CanvasTexture(spC); spTex.colorSpace = THREE.SRGBColorSpace;
const splatMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: spTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, fog: false }));
splatMesh.renderOrder = 19; splatMesh.position.z = -0.22; splatMesh.visible = false; camera.add(splatMesh);
function screenSplat(k) {
  if (G.splatA <= 0.02) spx.clearRect(0, 0, 512, 512);
  const n = 6 + Math.round(k * 18);
  for (let i = 0; i < n; i++) {
    const edge = Math.random() < 0.7;
    let x = Math.random() * 512, y = Math.random() * 512;
    if (edge) { if (Math.random() < 0.5) x = Math.random() < 0.5 ? Math.random() * 120 : 392 + Math.random() * 120; else y = Math.random() < 0.5 ? Math.random() * 120 : 392 + Math.random() * 120; }
    const rad = 10 + Math.random() * 50 * (0.5 + k);
    const g = spx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(110,0,4,.95)'); g.addColorStop(0.7, 'rgba(80,0,3,.85)'); g.addColorStop(1, 'rgba(60,0,2,0)');
    spx.fillStyle = g; spx.beginPath(); spx.arc(x, y, rad, 0, Math.PI * 2); spx.fill();
    if (Math.random() < 0.5) { spx.fillStyle = 'rgba(90,0,3,.85)'; spx.fillRect(x - 3, y, 6, 30 + Math.random() * 90); }
  }
  spTex.needsUpdate = true;
  G.splatA = Math.min(1, G.splatA + 0.4 + k * 0.6);
}

// ---------- 3D menu panel ----------
const UIW = 1280, UIH = 800;
const uiC = document.createElement('canvas'); uiC.width = UIW; uiC.height = UIH;
const ux = uiC.getContext('2d');
const uiTex = new THREE.CanvasTexture(uiC); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 4;
const uiMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshBasicMaterial({ map: uiTex, transparent: true, fog: false, toneMapped: false }));
uiMesh.renderOrder = 10;
let uiButtons = [], uiHover = -1, uiScreen = 'menu', uiDirty = true;
const DRIPS = Array.from({ length: 22 }, () => ({ x: 30 + Math.random() * (UIW - 60), l: 10 + Math.random() * 60, w: 6 + Math.random() * 12 }));
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TITLE = 'Impact, "Arial Black", "Arial Narrow", sans-serif';

function rr(x, y, w, h, r) {
  ux.beginPath(); ux.moveTo(x + r, y); ux.lineTo(x + w - r, y); ux.quadraticCurveTo(x + w, y, x + w, y + r); ux.lineTo(x + w, y + h - r);
  ux.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ux.lineTo(x + r, y + h); ux.quadraticCurveTo(x, y + h, x, y + h - r); ux.lineTo(x, y + r); ux.quadraticCurveTo(x, y, x + r, y); ux.closePath();
}
function text(s, x, y, size, color, align = 'left', weight = 800, font = FONT) {
  ux.font = `${weight} ${size}px ${font}`; ux.fillStyle = color; ux.textAlign = align; ux.textBaseline = 'middle'; ux.fillText(s, x, y);
}
function btn(x, y, w, h, label, fn, o = {}) {
  const i = uiButtons.length;
  uiButtons.push({ x, y, w, h, fn, disabled: !!o.disabled });
  const hov = i === uiHover && !o.disabled;
  ux.fillStyle = o.fill || (o.sel ? '#7d0d14' : o.primary ? '#a3121b' : hov ? '#3a1e22' : 'rgba(255,255,255,.06)');
  rr(x, y, w, h, 12); ux.fill();
  ux.lineWidth = o.sel ? 5 : 2;
  ux.strokeStyle = o.sel ? '#ff5a5f' : hov ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.16)';
  ux.stroke();
  if (o.draw) o.draw(x, y, w, h);
  else if (label) {
    const c = o.disabled ? 'rgba(241,233,228,.38)' : '#f3e9e4';
    text(label, x + w / 2, y + h / 2 - (o.sub ? 13 : 0), o.size || 28, c, 'center');
    if (o.sub) text(o.sub, x + w / 2, y + h / 2 + 20, 19, o.disabled ? 'rgba(200,190,185,.35)' : '#bfb0aa', 'center', 600);
  }
}
function label(s, x, y) { text(s, x, y, 20, '#b99a94', 'left', 800); }

function drawUI() {
  uiButtons = [];
  ux.clearRect(0, 0, UIW, UIH);
  ux.fillStyle = 'rgba(11,6,8,.94)'; rr(0, 0, UIW, UIH, 28); ux.fill();
  ux.strokeStyle = 'rgba(170,20,28,.75)'; ux.lineWidth = 4; ux.stroke();
  ux.fillStyle = '#6e0a10';
  for (const d of DRIPS) { ux.fillRect(d.x, 2, d.w, d.l); ux.beginPath(); ux.arc(d.x + d.w / 2, 2 + d.l, d.w / 2 + 1, 0, Math.PI * 2); ux.fill(); }
  if (uiScreen === 'pause') drawPause();
  else if (uiScreen === 'end') drawEnd();
  else drawMenu();
  uiTex.needsUpdate = true;
  uiDirty = false;
}

function statusLine() {
  if (G.connecting) return 'Connecting…';
  if (G.role === 'host') return `Server ${G.code} · ${G.players.size}/${MAX_PLAYERS} players`;
  if (G.role === 'client') return `Joined ${G.code} · ${G.players.size}/${MAX_PLAYERS} players`;
  return 'Offline · Solo';
}
const isClient = () => G.role === 'client';
function drawMenu() {
  text('CHEET SLASHER', 40, 64, 62, '#d4141c', 'left', 400, TITLE);
  text(statusLine(), UIW - 40, 64, 22, '#bfb0aa', 'right', 700);
  const tabs = [['play', 'PLAY'], ['char', 'CHARACTER'], ['weapon', 'WEAPON'], ['mp', 'MULTIPLAYER']];
  tabs.forEach(([id, name], i) => btn(40 + i * 302, 108, 288, 62, name, () => { G.tab = id; }, { sel: G.tab === id, size: 26 }));
  if (G.tab === 'char') drawCharTab();
  else if (G.tab === 'weapon') drawWeaponTab();
  else if (G.tab === 'mp') drawMpTab();
  else drawPlayTab();
}

function drawPlayTab() {
  const locked = isClient();
  label(locked ? 'MAP (the host picks)' : 'MAP', 40, 208);
  MAPS.forEach((m, i) => btn(40 + i * 604, 228, 590, 150, '', () => { if (!locked) { G.sel.map = m.id; selChanged(); } }, {
    sel: G.sel.map === m.id, disabled: locked && G.sel.map !== m.id,
    draw: (x, y, w, h) => { drawMapIcon(m.id, x + 24, y + 22, 150, 106); text(m.name, x + 200, y + 58, 34, '#f3e9e4'); text(m.sub, x + 200, y + 100, 22, '#bfb0aa', 'left', 600); },
  }));
  label('LEVEL', 40, 408);
  LEVELS.forEach((l, i) => btn(40 + i * 242, 428, 228, 108, `${i + 1}. ${l.name}`, () => { if (!locked) { G.sel.level = i; selChanged(); } }, {
    sel: G.sel.level === i, sub: `${l.victims} campers`, size: 24, disabled: locked && G.sel.level !== i,
  }));
  label('PLAY AS', 40, 566);
  btn(40, 586, 300, 100, 'KILLER', () => setRole('killer'), { sel: look.role === 'killer', sub: 'Hunt them all' });
  btn(356, 586, 300, 100, 'CAMPER', () => setRole('camper'), { sel: look.role === 'camper', sub: G.role === 'solo' ? 'Survive an AI killer' : 'Survive until dawn' });
  if (locked) btn(880, 586, 360, 100, 'WAITING FOR HOST', null, { disabled: true, sub: 'The host starts the round' });
  else btn(880, 586, 360, 100, G.role === 'host' ? 'START FOR ALL' : 'START', startRound, { primary: true, size: 36 });
  const tip = renderer.xr.isPresenting
    ? 'Swing to attack · Grip grabs (trigger chokes) · Right grip drops/picks up weapons · X kick/stomp · A sense · Y menu'
    : TOUCH ? 'Left pad moves · Drag to look · Buttons attack, sprint and sense'
    : 'WASD move · Shift sprint · Click attack · Right-click grab (hold to choke) · Q kick/stomp · G drop/pick up · T throw · F sense';
  text(tip, 40, 742, 19, '#8f8480', 'left', 600);
  if (G.err) text(G.err, UIW - 40, 742, 20, '#ff6a6a', 'right', 700);
}
function drawMapIcon(id, x, y, w, h) {
  ux.save(); ux.fillStyle = '#0c1220'; rr(x, y, w, h, 10); ux.fill(); ux.clip();
  ux.fillStyle = '#e9e3cc'; ux.beginPath(); ux.arc(x + w - 30, y + 26, 12, 0, Math.PI * 2); ux.fill();
  if (id === 'hood') {
    ux.fillStyle = '#1a1e26';
    for (let i = 0; i < 3; i++) { const hx0 = x + 10 + i * 48; ux.fillRect(hx0, y + 60, 38, 46); ux.beginPath(); ux.moveTo(hx0 - 4, y + 60); ux.lineTo(hx0 + 19, y + 40); ux.lineTo(hx0 + 42, y + 60); ux.fill(); }
    ux.fillStyle = '#ffcc6e'; ux.fillRect(x + 20, y + 72, 9, 9); ux.fillRect(x + 116, y + 70, 9, 9);
  } else {
    ux.fillStyle = '#0f1a14';
    for (let i = 0; i < 5; i++) { const tx = x + 6 + i * 34; ux.beginPath(); ux.moveTo(tx, y + h); ux.lineTo(tx + 16, y + 30 + (i % 2) * 14); ux.lineTo(tx + 32, y + h); ux.fill(); }
    ux.fillStyle = '#ff8a2a'; ux.beginPath(); ux.moveTo(x + 66, y + h - 4); ux.lineTo(x + 75, y + h - 26); ux.lineTo(x + 84, y + h - 4); ux.fill();
  }
  ux.restore();
}
function drawCharTab() {
  label(look.role === 'killer' ? 'MASK' : 'MASK (killers only)', 40, 208);
  MASKS.forEach((m, i) => btn(40 + i * 202, 228, 190, 92, m.name, () => { look.mask = m.id; lookChanged(); }, { sel: look.mask === m.id, size: 22 }));
  label('OUTFIT', 40, 350);
  OUTFITS.forEach((o, i) => btn(40 + i * 150, 370, 136, 84, '', () => { look.outfit = i; lookChanged(); }, {
    sel: look.outfit === i, draw: (x, y, w, h) => { ux.fillStyle = o.c; rr(x + 12, y + 12, w - 24, h - 40, 8); ux.fill(); text(o.n, x + w / 2, y + h - 16, 18, '#e8dcd6', 'center', 700); },
  }));
  label('SKIN', 40, 484);
  SKINS.forEach((s, i) => btn(40 + i * 150, 504, 136, 84, '', () => { look.skin = i; lookChanged(); }, {
    sel: look.skin === i, draw: (x, y, w, h) => { ux.fillStyle = s; rr(x + 14, y + 14, w - 28, h - 28, 8); ux.fill(); },
  }));
  label('NAME', 40, 618);
  text(look.name, 40, 668, 40, '#f3e9e4', 'left', 800);
  btn(640, 630, 300, 80, 'RANDOM NAME', () => { look.name = randomName(); lookChanged(); }, { size: 24 });
  text('Your character is shown on the right.', 40, 742, 19, '#8f8480', 'left', 600);
}
function drawWeaponTab() {
  WEAPONS.forEach((w, i) => {
    const c = i % 3, r = (i / 3) | 0;
    btn(40 + c * 408, 196 + r * 280, 392, 262, '', () => { look.weapon = w.id; lookChanged(); }, {
      sel: look.weapon === w.id,
      draw: (x, y) => {
        text(w.name, x + 24, y + 40, 32, '#f3e9e4');
        text(w.desc, x + 24, y + 80, 18, '#bfb0aa', 'left', 600);
        const stats = [['DAMAGE', w.saw ? 1 : w.dmg / 100], ['REACH', w.reach / 2.7], ['SPEED', w.saw ? 1 : 1 - w.swing / 1.1], ['GORE', w.crush || w.saw ? 1 : 0.35 + w.decap]];
        stats.forEach(([n, v], k) => {
          const yy = y + 122 + k * 34;
          text(n, x + 24, yy, 16, '#a6948e', 'left', 800);
          ux.fillStyle = 'rgba(255,255,255,.08)'; rr(x + 120, yy - 8, 240, 16, 8); ux.fill();
          ux.fillStyle = '#c0141d'; rr(x + 120, yy - 8, Math.max(16, 240 * clamp(v, 0, 1)), 16, 8); ux.fill();
        });
      },
    });
  });
  text('Killers only. In VR you physically swing the weapon: swing harder for more damage.', 40, 762, 19, '#8f8480', 'left', 600);
}
function drawMpTab() {
  if (G.net && (G.role === 'host' || G.welcomed)) {
    label('SERVER CODE', 40, 208);
    text(G.code.split('').join(' '), 40, 262, 64, '#ff5a5f', 'left', 900);
    text(G.role === 'host' ? 'You are hosting. Friends enter this code under Multiplayer → Join.' : 'Connected. Pick Killer or Camper in the Play tab.', 420, 262, 20, '#bfb0aa', 'left', 600);
    label(`PLAYERS (${G.players.size}/${MAX_PLAYERS})`, 40, 326);
    [...G.players.values()].slice(0, 20).forEach((p, i) => {
      const x = 40 + ((i / 10) | 0) * 600, y = 360 + (i % 10) * 34;
      text(p.role === 'killer' ? 'KILLER' : 'CAMPER', x, y, 17, p.role === 'killer' ? '#ff5a5f' : '#e8e0d0', 'left', 900);
      text(p.name + (p.id === G.myId ? '  (you)' : p.id === 'host' ? '  (host)' : ''), x + 100, y, 22, '#f3e9e4', 'left', 700);
    });
    btn(880, 700, 360, 72, G.role === 'host' ? 'CLOSE SERVER' : 'LEAVE SERVER', () => leaveServer(''), { size: 24 });
    return;
  }
  label('HOST A SERVER', 40, 208);
  btn(40, 228, 560, 150, G.connecting ? 'CREATING…' : 'HOST SERVER', hostGame, { primary: !G.connecting, disabled: G.connecting, size: 38, sub: 'Up to 20 players. Share the 5-digit code.' });
  text('Each player picks Killer or Camper.', 40, 420, 22, '#d8cdc8', 'left', 600);
  text('No killers? An AI killer joins the hunt.', 40, 456, 22, '#d8cdc8', 'left', 600);
  text('Works between Quest headsets, PCs and phones.', 40, 492, 22, '#d8cdc8', 'left', 600);
  label('JOIN WITH A CODE', 680, 208);
  for (let i = 0; i < 5; i++) {
    ux.fillStyle = 'rgba(255,255,255,.07)'; rr(680 + i * 108, 228, 96, 100, 12); ux.fill();
    ux.strokeStyle = i === G.codeEntry.length ? '#ff5a5f' : 'rgba(255,255,255,.18)'; ux.lineWidth = 3; ux.stroke();
    text(G.codeEntry[i] || '', 728 + i * 108, 280, 56, '#f3e9e4', 'center', 900);
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'join'];
  keys.forEach((k, i) => {
    const c = i % 3, r = (i / 3) | 0;
    btn(680 + c * 180, 348 + r * 92, 168, 80, k === 'del' ? 'DELETE' : k === 'join' ? 'JOIN' : k, () => keypad(k), {
      size: k.length > 1 ? 24 : 36, primary: k === 'join' && G.codeEntry.length === 5, disabled: (k === 'join' && G.codeEntry.length !== 5) || G.connecting,
    });
  });
  if (G.err) text(G.err, 40, 742, 21, '#ff6a6a', 'left', 700);
  else text(LOCAL_NET ? 'Test mode: servers only reach other tabs in this browser.' : 'Connections go directly between players over the internet.', 40, 742, 19, '#8f8480', 'left', 600);
}
function drawPause() {
  text('PAUSED', UIW / 2, 120, 84, '#d4141c', 'center', 400, TITLE);
  btn(440, 220, 400, 100, 'RESUME', resume, { primary: true, size: 34 });
  if (G.role === 'host') btn(440, 340, 400, 100, 'END ROUND FOR ALL', () => broadcastAll({ t: 'lobby' }), { size: 28 });
  btn(440, G.role === 'host' ? 460 : 340, 400, 100, G.role === 'solo' ? 'QUIT TO MENU' : G.role === 'host' ? 'CLOSE SERVER' : 'LEAVE SERVER',
    () => { if (G.role === 'solo') backToMenu(); else leaveServer(''); }, { size: 28 });
  const lines = renderer.xr.isPresenting
    ? ['Swing to attack (hold the trigger to rev a chainsaw). Grip a camper to grab them, squeeze the trigger to choke.', 'Right grip drops, throws or picks up weapons. X kicks or stomps. Click the left stick to sprint. A senses victims.']
    : ['Click to attack. Hold right-click on a camper to grab and choke them. Q kicks, or stomps someone on the ground.', 'G drops or picks up a weapon, T throws it. F senses victims (or toggles a camper\'s flashlight).'];
  lines.forEach((l, i) => text(l, UIW / 2, 640 + i * 36, 22, '#bfb0aa', 'center', 600));
  if (G.role !== 'solo') text('The game keeps running for everyone else while this is open.', UIW / 2, 730, 19, '#8f8480', 'center', 600);
}
function drawEnd() {
  const e = G.endInfo || {};
  const killersWon = e.winner === 'killers';
  text(killersWon ? 'NOBODY SURVIVED' : 'DAWN BREAKS', UIW / 2, 120, 84, killersWon ? '#d4141c' : '#f0d9a0', 'center', 400, TITLE);
  const mine = G.me.role;
  const msg = killersWon ? (mine === 'killer' ? 'Every camper is dead. You win.' : 'The killers got everyone.') : (mine === 'camper' ? (G.me.dead ? 'The sun came up, but not for you.' : 'You survived the night.') : 'Some campers lived to see the sunrise.');
  text(msg, UIW / 2, 200, 30, '#e8dcd6', 'center', 700);
  const list = (e.kills || []).slice(0, 6);
  if (list.length) {
    label('KILLS', 440, 262);
    list.forEach(([name, n], i) => { text(name, 440, 300 + i * 38, 26, '#f3e9e4', 'left', 700); text(String(n), 840, 300 + i * 38, 26, '#ff5a5f', 'right', 900); });
  }
  if (G.role === 'solo') {
    const next = killersWon && G.levelIdx < LEVELS.length - 1 && mine === 'killer';
    if (next) btn(140, 560, 320, 100, 'NEXT LEVEL', () => { G.sel.level = G.levelIdx + 1; G.sel.map = G.mapId; startRound(); }, { primary: true, size: 30 });
    btn(next ? 480 : 300, 560, 320, 100, 'PLAY AGAIN', () => { G.sel.level = G.levelIdx; G.sel.map = G.mapId; startRound(); }, { primary: !next, size: 30 });
    btn(next ? 820 : 660, 560, 320, 100, 'MENU', backToMenu, { size: 30 });
  } else if (G.role === 'host') {
    btn(440, 560, 400, 100, 'BACK TO LOBBY', () => broadcastAll({ t: 'lobby' }), { primary: true, size: 30 });
    text('Everyone returns to the lobby in a few seconds.', UIW / 2, 700, 20, '#8f8480', 'center', 600);
  } else text('Waiting for the host…', UIW / 2, 600, 26, '#bfb0aa', 'center', 700);
}

// Panel placement and picking
function panelShown() { return G.mode === 'menu' || uiScreen === 'pause' || uiScreen === 'end'; }
function placeMenuPanel() { menu.group.add(uiMesh); uiMesh.position.set(0, 1.45, -2.2); uiMesh.rotation.set(0, 0, 0); }
function showPanel(screen) {
  uiScreen = screen; uiDirty = true; uiHover = -1;
  setTimeout(updateDom, 0);
  if (!screen) { if (uiMesh.parent !== menu.group) uiMesh.removeFromParent(); return; }
  if (G.mode === 'menu') { placeMenuPanel(); return; }
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(TV); camera.getWorldDirection(TV2); TV2.y = 0; if (TV2.lengthSq() < 1e-4) TV2.set(0, 0, -1); TV2.normalize();
  scene.add(uiMesh);
  uiMesh.position.copy(TV).addScaledVector(TV2, 1.6); uiMesh.position.y = TV.y - 0.1;
  uiMesh.lookAt(TV.x, uiMesh.position.y, TV.z);
  if (document.pointerLockElement) document.exitPointerLock();
}
const raycaster = new THREE.Raycaster();
function hitBtn() {
  if (!uiMesh.parent) return null;
  const hit = raycaster.intersectObject(uiMesh, false)[0];
  if (!hit || !hit.uv) return null;
  const px = hit.uv.x * UIW, py = (1 - hit.uv.y) * UIH;
  return { dist: hit.distance, idx: uiButtons.findIndex(b => !b.disabled && b.fn && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) };
}
const ndc = new THREE.Vector2(9, 9);
function panelHitFromCamera() { raycaster.setFromCamera(ndc, camera); return hitBtn(); }
function panelHitFrom(ctrl) {
  ctrl.updateMatrixWorld(true);
  TM.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(TM);
  return hitBtn();
}
function pressButton(res) {
  if (!res || res.idx < 0) return;
  const b = uiButtons[res.idx];
  if (!b || b.disabled || !b.fn) return;
  sfx('click');
  b.fn();
  uiDirty = true;
}
function updatePointer() {
  if (!panelShown()) { hands.forEach(h => (h.ray.visible = false)); return; }
  let hov = -1;
  if (renderer.xr.isPresenting) {
    for (const h of hands) {
      if (!h.src) { h.ray.visible = false; continue; }
      const res = panelHitFrom(h.ctrl);
      h.ray.visible = true; h.ray.scale.z = res ? res.dist : 3;
      if (res && res.idx >= 0 && hov < 0) hov = res.idx;
    }
  } else {
    const res = panelHitFromCamera();
    if (res) hov = res.idx;
    canvas.style.cursor = hov >= 0 ? 'pointer' : 'default';
  }
  if (hov !== uiHover) { uiHover = hov; uiDirty = true; }
}

// Menu preview mannequin
let previewChar = null;
function refreshPreview() {
  if (previewChar) previewChar.removeFromParent();
  previewChar = makeChar(look.role === 'killer' ? killerLook(look) : camperLook(look));
  const P = previewChar.userData.P;
  if (look.role === 'killer') { const w = makeWeapon(look.weapon); P.handR.add(w); P.armR.rotation.x = 0.5; }
  else { P.handR.add(makeFlashlight()); P.armR.rotation.x = 1.2; }
  menu.preview.add(previewChar);
}

// ---------- menu actions ----------
function lookChanged() { saveLook(); refreshPreview(); refreshHeld(); sendInfo(); uiDirty = true; }
function setRole(r) { look.role = r; lookChanged(); }
function selChanged() { if (G.role === 'host') broadcastRoster(); uiDirty = true; }
function keypad(k) {
  G.err = '';
  if (k === 'del') G.codeEntry = G.codeEntry.slice(0, -1);
  else if (k === 'join') { if (G.codeEntry.length === 5) joinGame(G.codeEntry); }
  else if (G.codeEntry.length < 5) G.codeEntry += k;
  uiDirty = true;
}

// ---------- networking ----------
function sanitizeInfo(p, id) {
  p = p || {};
  const l = p.look || {};
  return {
    id, name: String(p.name || 'Player').slice(0, 20), role: p.role === 'camper' ? 'camper' : 'killer',
    look: { mask: MASKS.some(m => m.id === l.mask) ? l.mask : 'sack', outfit: clamp(l.outfit | 0, 0, OUTFITS.length - 1), skin: clamp(l.skin | 0, 0, SKINS.length - 1), weapon: WEAPON[l.weapon] ? l.weapon : 'machete' },
  };
}
function rosterList() { return [...G.players.values()].map(p => ({ id: p.id, name: p.name, role: p.role, look: p.look, rr: p.rr })); }
function broadcastRoster() { if (G.role === 'host' && G.net) G.net.broadcast({ t: 'roster', players: rosterList(), sel: G.sel }); uiDirty = true; }
function broadcastAll(m) { if (G.role === 'host' && G.net) G.net.broadcast(m); onGameMsg(m); }
function sendInfo() {
  const cur = G.players.get(G.myId);
  const info = meInfo(); if (cur) info.rr = cur.rr;
  G.players.set(G.myId, info);
  if (G.role === 'client' && G.net) G.net.send({ t: 'info', p: info });
  if (G.role === 'host') broadcastRoster();
}

async function hostGame() {
  if (G.net || G.connecting) return;
  G.connecting = true; G.err = ''; uiDirty = true;
  for (let tries = 0; tries < 4; tries++) {
    const code = String(10000 + Math.floor(Math.random() * 90000));
    try {
      const net = await hostServer(code, { onMessage: hostOnMessage, onLeave: hostOnLeave }, LOCAL_NET);
      G.net = net; G.role = 'host'; G.myId = 'host'; G.code = code;
      G.players.clear(); G.players.set('host', meInfo());
      G.connecting = false; uiDirty = true;
      return;
    } catch (e) {
      if (e.message !== 'taken') { G.err = e.message; break; }
    }
  }
  G.connecting = false; uiDirty = true;
}
async function joinGame(code) {
  if (G.net || G.connecting) return;
  G.connecting = true; G.err = ''; uiDirty = true;
  try {
    const net = await joinServer(code, { onMessage: clientOnMessage, onClose: r => { if (G.net) leaveServer(r); } }, LOCAL_NET);
    G.net = net; G.role = 'client'; G.myId = net.id; G.code = code; G.welcomed = false;
    G.lastHost = performance.now();
    net.send({ t: 'hello', p: meInfo() });
    clearTimeout(G.welcomeTimer);
    G.welcomeTimer = setTimeout(() => { if (G.net && !G.welcomed) leaveServer('No server with that code answered.'); }, 8000);
  } catch (e) { G.err = e.message; }
  G.connecting = false; uiDirty = true;
}
function leaveServer(reason) {
  clearTimeout(G.welcomeTimer); clearTimeout(G.lobbyTimer);
  if (G.net) { try { if (G.role === 'host') G.net.broadcast({ t: 'bye' }); G.net.close(); } catch (e) {} }
  G.net = null; G.role = 'solo'; G.myId = 'host'; G.code = ''; G.welcomed = false;
  G.players.clear(); G.players.set('host', meInfo());
  if (G.mode === 'play') backToMenu();
  G.err = reason || ''; uiDirty = true;
}
addEventListener('pagehide', () => { if (G.net) { try { if (G.role === 'host') G.net.broadcast({ t: 'bye' }); G.net.close(); } catch (e) {} } });

function hostOnMessage(from, m) {
  if (!m || typeof m !== 'object') return;
  const p = G.players.get(from);
  if (p) p.seen = performance.now();
  switch (m.t) {
    case 'hello': {
      if (p) return;
      if (G.players.size >= MAX_PLAYERS) { G.net.send(from, { t: 'full' }); setTimeout(() => G.net && G.net.kick(from), 300); return; }
      const info = sanitizeInfo(m.p, from); info.seen = performance.now();
      if (G.phase === 'playing') info.rr = info.role;
      G.players.set(from, info);
      let round = null;
      if (G.phase === 'playing') { round = roundSnapshot(from); ensurePlayerEnt(from, round.spawns[from]); }
      G.net.send(from, { t: 'welcome', id: from, players: rosterList(), sel: G.sel, round });
      broadcastRoster();
      feed(`${info.name} joined`);
      break;
    }
    case 'info': if (p) { const rr = p.rr; Object.assign(p, sanitizeInfo(m.p, from)); p.rr = rr; p.seen = performance.now(); broadcastRoster(); } break;
    case 's': if (p && Array.isArray(m.a)) { p.st = m.a; applyPlayerState(from, m.a); } break;
    case 'hit': if (p && p.rr === 'killer' && m.w !== 'stomp' && m.w !== 'choke') hostHit(m.id, m.part, Math.min(160, +m.dmg || 0), m.dir, m.w, from); break;
    case 'grab': if (p && p.rr === 'killer' && (m.h === 'L' || m.h === 'R')) hostGrab(m.id, from, m.h); break;
    case 'release': { const e = G.ents.get(m.id); if (e && e.heldBy === from) hostRelease(m.id, Array.isArray(m.v) ? m.v.map(v => clamp(+v || 0, -15, 15)) : [0, 0, 0]); break; }
    case 'choke': hostChoke(m.id, from, m.on); break;
    case 'kick': if (p && p.rr === 'killer' && Array.isArray(m.dir)) hostKick(m.id, m.dir, from); break;
    case 'take': if (p) hostTake(m.id, from); break;
    case 'drop': if (p && p.rr === 'killer') hostDrop(m, from); break;
    case 'bye': hostOnLeave(from); break;
  }
}
function hostOnLeave(id) {
  const p = G.players.get(id);
  if (!p || id === 'host') return;
  G.players.delete(id);
  removeEnt(id);
  if (G.net) G.net.kick(id);
  broadcastRoster();
  broadcastAll({ t: 'feed', s: `${p.name} left` });
}
function clientOnMessage(m) {
  if (!m || typeof m !== 'object') return;
  G.lastHost = performance.now();
  switch (m.t) {
    case 'welcome':
      G.welcomed = true; clearTimeout(G.welcomeTimer); G.myId = m.id; G.err = '';
      applyRoster(m.players); G.sel = m.sel || G.sel; G.tab = 'play';
      if (m.round) enterRound(m.round);
      uiDirty = true; break;
    case 'roster': applyRoster(m.players); if (m.sel) G.sel = m.sel; uiDirty = true; break;
    case 'full': leaveServer('That server is full (20 players).'); break;
    case 'bye': leaveServer('The host closed the server.'); break;
    default: onGameMsg(m);
  }
}
function applyRoster(list) {
  const next = new Map();
  for (const p of list || []) { const old = G.players.get(p.id); next.set(p.id, Object.assign(old || {}, p)); }
  G.players = next;
  for (const id of [...G.ents.keys()]) { const e = G.ents.get(id); if (e.player && !next.has(id)) removeEnt(id); }
}

function onGameMsg(m) {
  switch (m.t) {
    case 'start': enterRound(m); break;
    case 'snap': if (G.role === 'client' && G.mode === 'play') applySnap(m); break;
    case 'hurt': onHurt(m); break;
    case 'kill': onKill(m); break;
    case 'end': onEnd(m); break;
    case 'lobby': clearTimeout(G.lobbyTimer); backToMenu(); break;
    case 'feed': feed(m.s); break;
    case 'pk+': { const pk = spawnPickup(m.id, m.w, m.p, m.r, m.v, m.by); if (pk && m.by !== G.myId) sfxAt('swing', m.p[0], m.p[2], 0.5, 0.8); break; }
    case 'pk-': {
      removePickup(m.id);
      if (m.by === G.myId) {
        if (G.weapon) dropWeapon(TV.set(0, 1, 0));
        G.weapon = m.w; refreshHeld(); sfx('clink'); buzz(handOf('right'), 0.6, 60);
      }
      break;
    }
    case 'grabbed': {
      const e = G.ents.get(m.id); if (e) { e.heldBy = m.by; e.heldKey = m.h; }
      if (m.by === G.myId) { G.hold[m.h] = m.id; G.rmbT = 0; buzz(handOf(m.h === 'L' ? 'left' : 'right'), 1, 120); sfx('punch', 0.5, 0.7); }
      break;
    }
    case 'released': { const e = G.ents.get(m.id); if (e) e.heldBy = null; for (const k of ['L', 'R']) if (G.hold[k] === m.id) { G.hold[k] = null; G.choke[k] = false; } break; }
    case 'fx': if (m.k === 'stomp') { sfxAt('stomp', m.x, m.z); sfxAt('crunch', m.x, m.z, 0.7); } else sfxAt('stomp', m.x, m.z, 0.7); break;
  }
}

// ---------- entities (everyone except you) ----------
function makeEnt(id, role, name, cl, x, z, yaw, kind) {
  const char = makeChar(cl);
  char.position.set(x, 0, z); char.rotation.y = yaw;
  charsGroup.add(char);
  const e = { id, role, name, char, kind, x, z, yaw, tx: x, tz: z, ty: 1.65, tyaw: yaw, pitch: 0, tpitch: 0, speed: 0, pose: 0, prevPose: 0, dead: false, hp: 100, flags: 0, hand: null, lastScream: -9, dripT: 0, wounded: false };
  const P = char.userData.P;
  if (role === 'killer') { e.held = makeWeapon(cl.weapon || 'machete'); P.handR.add(e.held); }
  else if (kind === 'player') { e.held = makeFlashlight(); e.cone = makeBeamCone(); e.held.add(e.cone); P.handR.add(e.held); }
  e.tag = makeTag(name, role === 'killer' ? '#ff6a6a' : '#ffffff'); e.tag.position.set(0, 2.1, 0); char.add(e.tag);
  e.sense = makeSense(); e.sense.position.y = 1.15; e.sense.visible = false; char.add(e.sense);
  G.ents.set(id, e);
  return e;
}
function removeEnt(id) {
  const e = G.ents.get(id);
  if (!e) return;
  if (!e.dead) e.char.removeFromParent();
  if (e.held) e.held.removeFromParent();
  G.ents.delete(id);
}
function playerCharLook(p, role) { const l = p.look || {}; return role === 'killer' ? killerLook(l) : camperLook(l); }
function ensurePlayerEnt(id, sp) {
  if (G.ents.has(id) || id === G.myId || G.mode !== 'play') return null;
  const p = G.players.get(id); if (!p) return null;
  const role = p.rr || p.role;
  return makeEnt(id, role, p.name, playerCharLook(p, role), sp ? sp[0] : 0, sp ? sp[1] : 0, sp ? sp[2] : 0, 'player');
}
function applyPlayerState(id, a) {
  const e = G.ents.get(id);
  if (!e || e.dead) return;
  e.tx = a[0]; e.ty = a[1]; e.tz = a[2]; e.tyaw = a[3]; e.tpitch = a[4]; e.flags = a[5] | 0;
  e.wi = a.length > 6 ? a[6] | 0 : -1;
  e.hand = a.length >= 17 ? a.slice(10, 17) : null;
}

// ---------- rounds ----------
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
function startRound() {
  if (G.role === 'client') return;
  clearTimeout(G.lobbyTimer);
  const L = getLayout(G.sel.map), lvl = LEVELS[G.sel.level];
  const seed = (Math.random() * 1e9) | 0, r = mulberry(seed);
  const spots = shuffle(L.camper.slice(), r);
  const npcs = [];
  for (let i = 0; i < lvl.victims; i++) {
    const s = spots[i % spots.length], j = i >= spots.length ? 1.4 : 0.4;
    npcs.push(['n' + i, CAMPER_NAMES[(seed + i) % CAMPER_NAMES.length], (seed >>> 3) + i, r2(s.x + (r() - 0.5) * j), r2(s.z + (r() - 0.5) * j), r2(r() * 6.28), 0]);
  }
  if (G.role === 'solo') { G.players.clear(); G.players.set('host', meInfo()); }
  for (const p of G.players.values()) p.rr = p.role;
  const hasKiller = [...G.players.values()].some(p => p.rr === 'killer');
  const ks = shuffle(L.killer.slice(), r);
  if (!hasKiller) npcs.push(['ai', 'The Butcher', seed, ks[0].x, ks[0].z, r2(yawTo(ks[0].x, ks[0].z, 0, 0)), 0]);
  const spawns = {};
  let ki = hasKiller ? 0 : 1, ci = lvl.victims + 3;
  for (const p of G.players.values()) {
    if (p.rr === 'killer') { const s = ks[ki++ % ks.length]; spawns[p.id] = [r2(s.x), r2(s.z), r2(yawTo(s.x, s.z, 0, 0)), 'killer']; }
    else { const s = spots[ci++ % spots.length]; spawns[p.id] = [r2(s.x + (r() - 0.5) * 1.5), r2(s.z + (r() - 0.5) * 1.5), r2(r() * 6.28), 'camper']; }
  }
  const pickups = L.weapons.map((w, i) => ['w' + i, w.w, [r2(w.x), r2(w.y), r2(w.z)], [r2(w.rx), r2(w.ry), r2(w.rz)]]);
  for (const h of L.hide) h.taken = null;
  broadcastAll({ t: 'start', map: G.sel.map, level: G.sel.level, seed, npcs, spawns, time: lvl.time, pickups });
  broadcastRoster();
}
function roundSnapshot(forId) {
  const m = Object.assign({}, G.round);
  m.npcs = [...G.ents.values()].filter(e => e.kind === 'npc' || e.kind === 'ai').map(e => [e.id, e.name, e.li, r2(e.x), r2(e.z), r2(e.yaw), e.dead ? 1 : 0]);
  m.spawns = {};
  for (const p of G.players.values()) {
    if (p.id === forId) {
      const L = getLayout(G.mapId);
      const s = p.rr === 'killer' ? L.killer[(Math.random() * L.killer.length) | 0] : L.camper[(Math.random() * L.camper.length) | 0];
      m.spawns[p.id] = [r2(s.x), r2(s.z), 0, p.rr];
    } else {
      const e = p.id === G.myId ? null : G.ents.get(p.id);
      const pos = p.id === G.myId ? G.head : e ? { x: e.x, z: e.z } : { x: 0, z: 0 };
      m.spawns[p.id] = [r2(pos.x), r2(pos.z), 0, p.rr || p.role];
    }
  }
  m.time = Math.round(G.timeLeft);
  m.pickups = [...G.pickups.values()].map(pk => [pk.id, pk.w, [r2(pk.obj.position.x), r2(pk.obj.position.y), r2(pk.obj.position.z)], [r2(pk.obj.rotation.x), r2(pk.obj.rotation.y), r2(pk.obj.rotation.z)]]);
  m.kills = [...G.kills.entries()];
  m.dead = [...G.players.values()].filter(p => p.id === G.myId ? G.me.dead : G.ents.get(p.id) && G.ents.get(p.id).dead).map(p => p.id);
  return m;
}
function clearRound() {
  for (const id of [...G.ents.keys()]) removeEnt(id);
  while (charsGroup.children.length) charsGroup.children[0].removeFromParent();
  clearGore();
  G.pickups.clear(); G.hold.L = G.hold.R = null; G.choke.L = G.choke.R = false; boot.visible = false;
  setGoreWorld(null);
  if (world) { world.dispose(); world = null; }
  setSaw(0);
}
function enterRound(m) {
  clearRound();
  clearTimeout(G.lobbyTimer);
  G.mapId = m.map; G.levelIdx = m.level; G.phase = 'playing'; G.mode = 'play'; G.paused = false; G.endInfo = null;
  G.timeLeft = m.time; G.round = m; G.kills = new Map(m.kills || []); G.feed = []; G.hitCD.clear();
  menu.group.visible = false;
  showPanel(null);
  world = buildMap(m.map, scene);
  setGoreWorld(world.layout);
  for (const pk of m.pickups || []) spawnPickup(pk[0], pk[1], pk[2], pk[3]);
  const lvl = LEVELS[m.level];
  for (const n of m.npcs) {
    const [id, name, li, x, z, yaw, dead] = n;
    if (dead) continue;
    const isAI = id === 'ai';
    const e = makeEnt(id, isAI ? 'killer' : 'camper', name, isAI ? aiLook(li) : npcLook(li), x, z, yaw, isAI ? 'ai' : 'npc');
    e.li = li;
    e.tag.visible = false;
    if (G.role !== 'client') e.ai = isAI ? newKillerAI() : newCamperAI();
  }
  for (const p of G.players.values()) {
    if (p.id === G.myId) continue;
    const sp = m.spawns[p.id];
    if (sp) p.rr = sp[3];
    const e = ensurePlayerEnt(p.id, sp);
    if (e && m.dead && m.dead.includes(p.id)) { e.dead = true; e.char.removeFromParent(); }
  }
  const mine = m.spawns[G.myId] || [0, 0, 0, look.role];
  G.me = { hp: 100, dead: false, stamina: 6, role: mine[3], swingT: 0, hitDone: true, senseT: 0, senseCD: 0, exhausted: false };
  const mp = G.players.get(G.myId); if (mp) mp.rr = mine[3];
  G.blood = 0; G.flashOn = true; G.splatA = 0;
  G.weapon = G.me.role === 'killer' ? look.weapon : null;
  placeRig(mine[0], mine[1], mine[2]);
  refreshHeld();
  hud.visible = true;
  sfx('sting');
  const victims = m.npcs.filter(n => n[0] !== 'ai').length;
  if (G.me.role === 'killer') setTimeout(() => G.mode === 'play' && feed(renderer.xr.isPresenting ? 'Grip to grab, trigger to choke, X to kick' : TOUCH ? 'GRAB to grab and choke, KICK to kick or stomp' : 'Right-click to grab and choke · Q to kick or stomp'), 4500);
  feed(`${lvl.name}: ` + (G.me.role === 'killer' ? `kill all ${victims + [...G.players.values()].filter(p => p.rr === 'camper').length} campers` : 'survive until dawn'));
  updateDom();
}
function backToMenu() {
  clearRound();
  G.mode = 'menu'; G.phase = 'lobby'; G.paused = false; G.endInfo = null;
  menu.group.visible = true; hud.visible = false; splatMesh.visible = false; G.splatA = 0;
  G.yaw = 0; G.pitch = -0.06;
  placeRig(0, 0, 0);
  showPanel('menu');
  refreshHeld();
  if (document.pointerLockElement) document.exitPointerLock();
  updateDom();
}
function campersAlive() {
  let n = 0;
  for (const e of G.ents.values()) if (e.role === 'camper' && !e.dead) n++;
  if (G.me.role === 'camper' && !G.me.dead) n++;
  return n;
}
function endRound(winner) {
  if (G.phase !== 'playing') return;
  const kills = [...G.kills.entries()].map(([id, n]) => [nameOf(id), n]).sort((a, b) => b[1] - a[1]);
  broadcastAll({ t: 'end', winner, kills });
  if (G.role === 'host') {
    if (winner === 'killers' && G.sel.level < LEVELS.length - 1) G.sel.level++;
    G.lobbyTimer = setTimeout(() => { if (G.phase === 'ended') broadcastAll({ t: 'lobby' }); }, 12000);
  }
}
function onEnd(m) {
  G.phase = 'ended'; G.endInfo = m;
  setSaw(0);
  const won = (m.winner === 'killers') === (G.me.role === 'killer');
  sfx(won ? 'win' : 'lose');
  showPanel('end');
}

function nameOf(id) {
  if (id === 'ai') return 'The Butcher';
  if (id === G.myId) return look.name;
  const p = G.players.get(id); if (p) return p.name;
  const e = G.ents.get(id); return e ? e.name : 'someone';
}
function feed(s) { G.feed.push({ s, t: G.now }); if (G.feed.length > 4) G.feed.shift(); hudT = 0; }

// ---------- damage ----------
function hostHit(id, part, dmg, dir, w, by) {
  if (G.phase !== 'playing' || !(dmg > 0)) return;
  if (!PARTS.includes(part)) part = 'torso';
  if (!WEAPON[w] && !SPECIAL[w]) w = 'machete';
  let alive;
  if (id === G.myId) {
    if (G.me.dead || G.me.role !== 'camper') return;
    G.me.hp -= dmg; alive = G.me.hp > 0;
  } else {
    const e = G.ents.get(id);
    if (!e || e.dead || e.role !== 'camper') return;
    e.hp -= dmg; alive = e.hp > 0;
    if (e.ai && alive && e.ai.state !== 'held' && e.ai.state !== 'down') panic(e, by, part);
  }
  const d = [r2((dir && dir[0]) || 0), r2((dir && dir[1]) || 0)];
  if (alive) broadcastAll({ t: 'hurt', id, part, dir: d, w });
  else broadcastAll({ t: 'kill', id, by, part, dir: d, w, seed: (Math.random() * 1e9) | 0 });
}
function posOf(id) {
  if (id === G.myId) return { x: G.head.x, y: G.head.y, z: G.head.z };
  const e = G.ents.get(id);
  return e ? { x: e.x, y: (e.ty || 1.65), z: e.z } : null;
}
// Where a player's grabbing hand is, as the host sees it.
function grabPosOf(by, key) {
  if (by === G.myId) { const v = handPos(key, new THREE.Vector3()); return { x: v.x, y: v.y, z: v.z }; }
  const p = G.players.get(by), st = p && p.st;
  if (st && st.length >= 10 && (st[7] || st[9])) return { x: st[7], y: st[8], z: st[9] };
  const e = G.ents.get(by);
  if (!e) return null;
  return { x: e.x - Math.sin(e.yaw) * 0.6, y: 1.4, z: e.z - Math.cos(e.yaw) * 0.6 };
}
function hostGrab(id, by, key) {
  const e = G.ents.get(id);
  if (!e || e.dead || !e.ai || e.role !== 'camper' || e.heldBy || G.phase !== 'playing') return;
  const gp = grabPosOf(by, key);
  if (!gp || Math.hypot(gp.x - e.x, gp.z - e.z) > 2.2) return;
  e.heldBy = by; e.heldKey = key; e.choking = false;
  e.ai.state = 'held'; e.ai.escT = 0; e.pose = 4;
  broadcastAll({ t: 'grabbed', id, by, h: key });
}
function hostRelease(id, v) {
  const e = G.ents.get(id);
  if (!e || !e.heldBy) return;
  const by = e.heldBy;
  e.heldBy = null; e.choking = false;
  broadcastAll({ t: 'released', id });
  if (e.dead || !e.ai) return;
  const sp = Math.hypot(v[0], v[1], v[2]);
  if (sp > 2.5) {
    e.ai.state = 'down'; e.ai.t = 2.6; e.ai.vx = v[0] * 1.1; e.ai.vz = v[2] * 1.1; e.pose = 6;
    hostHit(id, 'torso', 8, [v[0] / sp, v[2] / sp], 'fists', by);
  } else {
    e.ai.state = 'flee'; e.ai.stamina = Math.max(e.ai.stamina, 2); e.pose = 1;
    const k = posOf(by); if (k) { e.ai.kx = k.x; e.ai.kz = k.z; e.ai.lastSeen = G.now; }
  }
}
function hostChoke(id, by, on) { const e = G.ents.get(id); if (e && e.heldBy === by) e.choking = !!on; }
function hostKick(id, dir, by) {
  if (id === G.myId) { hostHit(id, 'torso', 15, dir, 'fists', by); return; }
  const e = G.ents.get(id);
  if (!e || e.dead || e.role !== 'camper') return;
  const st = e.ai ? e.ai.state : '';
  if (e.pose === 6 || e.pose === 2 || e.pose === 7 || st === 'down' || st === 'cower' || st === 'hide') {
    broadcastAll({ t: 'fx', k: 'stomp', x: r2(e.x), z: r2(e.z) });
    hostHit(id, 'head', 45, dir, 'stomp', by);
  } else {
    if (e.heldBy) hostRelease(id, [0, 0, 0]);
    if (e.ai) { e.ai.state = 'down'; e.ai.t = 2.4; e.ai.vx = dir[0] * 3.5; e.ai.vz = dir[1] * 3.5; e.pose = 6; }
    broadcastAll({ t: 'fx', k: 'kick', x: r2(e.x), z: r2(e.z) });
    hostHit(id, 'torso', 10, dir, 'fists', by);
  }
}
function hostTake(id, by) {
  const pk = G.pickups.get(id);
  if (!pk || pk.v) return;
  const p = G.players.get(by);
  if (!p || (p.rr || p.role) !== 'killer') return;
  broadcastAll({ t: 'pk-', id, by, w: pk.w });
}
function hostDrop(m, by) {
  if (!WEAPON[m.w] || !Array.isArray(m.p) || !Array.isArray(m.v)) return;
  broadcastAll({ t: 'pk+', id: 'p' + G.pkSeq++, w: m.w, p: m.p, r: m.r || [0, 0, 0], v: m.v, by });
}
function voiceOf(e) { return e.char && e.char.userData.look.female ? 1.25 : 0.85; }
function onHurt(m) {
  if (m.id === G.myId) {
    screenSplat(0.4); buzzAll(0.8, 120); sfx('hurt'); sfx('pain', 0.8, 1); G.shake = 0.25;
    return;
  }
  const e = G.ents.get(m.id);
  if (!e || e.dead) return;
  hurtFX(e.char, m.part, m.dir);
  e.wounded = true;
  sfxAt(m.w === 'fists' || m.w === 'stomp' ? 'punch' : 'hit', e.x, e.z);
  sfxAt('pain', e.x, e.z, 1, voiceOf(e));
  if (e.kind !== 'player' && Math.random() < 0.4) sayAt(pick(LINES.hurt), e);
  if (m.part && m.part.startsWith('leg')) e.limp = true;
}
function onKill(m) {
  const W = weaponDef(m.w);
  const verb = SPECIAL_VERBS[m.w] || VERBS[W.id] || 'killed';
  const killer = nameOf(m.by);
  G.kills.set(m.by, (G.kills.get(m.by) || 0) + 1);
  for (const k of ['L', 'R']) if (G.hold[k] === m.id) { G.hold[k] = null; G.choke[k] = false; }
  if (m.id === G.myId) {
    if (G.me.dead) return;
    G.me.dead = true; G.me.hp = 0; G.me.deadAt = G.now;
    screenSplat(1); sfx('gore'); sfx('death'); sfx('sting', 0.8); buzzAll(1, 400);
    feed(`You were ${verb} by ${killer}`);
    updateLights();
    return;
  }
  const e = G.ents.get(m.id);
  if (!e || e.dead) return;
  e.dead = true; e.heldBy = null;
  if (e.tag) e.tag.removeFromParent();
  if (e.sense) e.sense.removeFromParent();
  if (e.cone) e.cone.removeFromParent();
  if (e.held && e.held.parent === charsGroup) e.held.removeFromParent();
  killFX(e.char, m, W);
  if (m.w !== 'choke') { sfxAt('gore', e.x, e.z); sfxAt('squelch', e.x, e.z, 0.8); }
  if (m.w === 'stomp' || W.crush) sfxAt('crunch', e.x, e.z);
  sfxAt('death', e.x, e.z, 1, voiceOf(e));
  feed(`${e.name} was ${verb} by ${killer}`);
  if (m.by === G.myId) {
    if (G.weapon && m.w === G.weapon) { G.blood = Math.min(0.85, G.blood + 0.22); setWeaponBlood(vmItem, G.blood); setWeaponBlood(vrItem, G.blood); }
    if (Math.hypot(e.x - G.head.x, e.z - G.head.z) < 2.4 && m.w !== 'choke') screenSplat(0.6);
    buzzAll(1, 200);
  }
}
function sayAt(text, e) {
  const d = Math.hypot(e.x - G.head.x, e.z - G.head.z);
  if (d < 22) say(text, 1 - d / 24, voiceOf(e) > 1 ? 1.7 : 1.05);
}
function sfxAt(kind, x, z, vol = 1, pitch = 1) {
  const d = Math.hypot(x - G.head.x, z - G.head.z);
  const v = vol * Math.max(0, 1 - d / 38);
  if (v > 0.02) sfx(kind, v, pitch);
}

// ---------- AI (runs on the host, or locally in solo) ----------
function newCamperAI() { return { state: Math.random() < 0.5 ? 'idle' : 'walk', t: Math.random() * 4, stamina: 5, losT: Math.random() * 0.3, sees: false, lastSeen: -99, kx: 0, kz: 0, dx: 0, dz: 1, steerT: 0, wx: null, wz: null }; }
function newKillerAI() { return { tgt: null, tx: 0, tz: 0, hunting: false, retarget: 0, atkCD: 0, swing: 0, struck: true, dx: 0, dz: 1, steerT: 0, wx: null, wz: null }; }

function killerSpots() {
  const out = [];
  if (G.me.role === 'killer') out.push({ x: G.head.x, z: G.head.z });
  for (const e of G.ents.values()) if (e.role === 'killer' && !e.dead) out.push({ x: e.x, z: e.z });
  return out;
}
function camperTargets() {
  const out = [];
  if (G.me.role === 'camper' && !G.me.dead) out.push({ id: G.myId, x: G.head.x, z: G.head.z });
  for (const e of G.ents.values()) if (e.role === 'camper' && !e.dead) out.push({ id: e.id, x: e.x, z: e.z, e });
  return out;
}
function steer(e, wx, wz, dt, speed) {
  const ai = e.ai, L = world.layout;
  ai.steerT -= dt;
  if (ai.steerT <= 0) {
    ai.steerT = 0.25;
    let best = -1e9, bx = wx, bz = wz;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let s = dx * wx + dz * wz + (dx * ai.dx + dz * ai.dz) * 0.35;
      if (blocked(L, e.x + dx * 1.2, e.z + dz * 1.2, 0.35)) s -= 3;
      else if (blocked(L, e.x + dx * 3, e.z + dz * 3, 0.35)) s -= 1.1;
      if (s > best) { best = s; bx = dx; bz = dz; }
    }
    ai.dx = bx; ai.dz = bz;
  }
  const p = { x: e.x + ai.dx * speed * dt, z: e.z + ai.dz * speed * dt };
  resolve(L, p, 0.3);
  e.speed = Math.hypot(p.x - e.x, p.z - e.z) / Math.max(dt, 1e-3);
  e.x = p.x; e.z = p.z;
  if (e.speed > 0.2) e.yaw = angLerp(e.yaw, Math.atan2(-ai.dx, -ai.dz), 1 - Math.exp(-dt * 8));
}
function pickWander(e, away) {
  const L = world.layout;
  for (let i = 0; i < 8; i++) {
    const p = openPoint(L);
    if (away && Math.hypot(p.x - away.x, p.z - away.z) < 15) continue;
    if (Math.hypot(p.x - e.x, p.z - e.z) > 35) continue;
    e.ai.wx = p.x; e.ai.wz = p.z; return;
  }
  const p = openPoint(L); e.ai.wx = p.x; e.ai.wz = p.z;
}
function alertNear(src, kx, kz) {
  for (const o of G.ents.values()) {
    if (!o.ai || o === src || o.dead || o.role !== 'camper') continue;
    if (['flee', 'cower', 'hide', 'tohide', 'held', 'down'].includes(o.ai.state)) continue;
    if (Math.hypot(o.x - src.x, o.z - src.z) < 15) { o.ai.state = 'flee'; o.ai.kx = kx; o.ai.kz = kz; o.ai.lastSeen = G.now; o.pose = 1; }
  }
}
function panic(e, by, part) {
  let kx = e.x + 1, kz = e.z;
  if (by === G.myId) { kx = G.head.x; kz = G.head.z; }
  else { const k = G.ents.get(by); if (k) { kx = k.x; kz = k.z; } }
  const ai = e.ai;
  if (ai.hideSpot) { ai.hideSpot.taken = null; ai.hideSpot = null; }
  if (ai.state !== undefined) { ai.state = 'flee'; ai.kx = kx; ai.kz = kz; ai.lastSeen = G.now; ai.stamina = Math.min(5, ai.stamina + 1.5); e.pose = 1; }
  if (part && part.startsWith('leg')) e.limp = true;
}
function findHide(e) {
  const L = world.layout;
  let best = null, bd = 18;
  for (const h of L.hide) {
    if (h.taken && h.taken !== e.id) continue;
    const d = Math.hypot(h.x - e.x, h.z - e.z);
    const away = Math.hypot(h.x - e.ai.kx, h.z - e.ai.kz);
    if (away < 8) continue;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function updateCamperAI(e, dt, lvl, killers) {
  const ai = e.ai;
  if (ai.state === 'held') return;
  let kd = 1e9, kx = 0, kz = 0;
  for (const k of killers) { const d = Math.hypot(k.x - e.x, k.z - e.z); if (d < kd) { kd = d; kx = k.x; kz = k.z; } }
  ai.losT -= dt;
  if (ai.losT <= 0) {
    ai.losT = 0.3;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const facing = kd < 1e8 ? (fx * (kx - e.x) + fz * (kz - e.z)) / Math.max(kd, 0.01) : -1;
    const hidden = ai.state === 'hide';
    ai.sees = kd < (hidden ? 3 : 4) || (!hidden && kd < lvl.sight && (facing > -0.3 || kd < 7) && los(world.layout, e.x, e.z, kx, kz)) || (hidden && kd < 6 && los(world.layout, e.x, e.z, kx, kz));
  }
  if (ai.state === 'down') {
    // knocked flat: slide, then scoot backwards away from the killer, then scramble up and run
    e.pose = 6; ai.t -= dt;
    const p = { x: e.x + ai.vx * dt, z: e.z + ai.vz * dt };
    ai.vx *= Math.exp(-dt * 3); ai.vz *= Math.exp(-dt * 3);
    if (Math.hypot(ai.vx, ai.vz) < 0.4 && kd < 1e8) {
      const ax = e.x - kx, az = e.z - kz, l = Math.hypot(ax, az) || 1;
      p.x += (ax / l) * 0.45 * dt; p.z += (az / l) * 0.45 * dt;
      e.yaw = angLerp(e.yaw, Math.atan2(ax / l, az / l), dt * 4);
    }
    resolve(world.layout, p, 0.3); e.x = p.x; e.z = p.z; e.speed = 0.5; e.y = Math.max(0, (e.y || 0) - dt * 3);
    if (ai.t <= 0) { ai.state = 'flee'; ai.kx = kx; ai.kz = kz; ai.lastSeen = G.now; ai.stamina = Math.max(ai.stamina, 2); e.pose = 1; }
    return;
  }
  if (ai.sees) {
    ai.lastSeen = G.now; ai.kx = kx; ai.kz = kz;
    if (ai.state !== 'flee' && ai.state !== 'cower') {
      if (ai.hideSpot) { ai.hideSpot.taken = null; ai.hideSpot = null; }
      ai.state = 'flee'; e.pose = 1; alertNear(e, kx, kz);
    }
  }
  const spdMul = lvl.speed * (e.limp ? 0.65 : 1);
  e.y = 0;
  switch (ai.state) {
    case 'idle':
      e.speed = 0; ai.t -= dt; e.pose = 0;
      if (ai.t <= 0) { ai.state = 'walk'; pickWander(e); }
      break;
    case 'walk': {
      e.pose = 0;
      if (ai.wx === null) pickWander(e);
      const dx = ai.wx - e.x, dz = ai.wz - e.z, d = Math.hypot(dx, dz);
      if (d < 1.2) { ai.state = 'idle'; ai.t = 2 + Math.random() * 6; ai.wx = null; break; }
      steer(e, dx / d, dz / d, dt, 1.3 * spdMul);
      break;
    }
    case 'flee': {
      e.pose = 1;
      let ax = e.x - ai.kx, az = e.z - ai.kz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const sprint = ai.stamina > 0;
      if (sprint) ai.stamina -= dt;
      steer(e, ax, az, dt, (sprint ? 4.6 : 2.4) * spdMul);
      if (!sprint && kd < 2.6 && Math.random() < dt * 0.6) { ai.state = 'cower'; ai.t = 1.2 + Math.random() * 1.2; e.pose = 2; }
      // out of sight for a moment: look for somewhere to hide
      if (G.now - ai.lastSeen > 2.5 && kd > 9) {
        const h = findHide(e);
        if (h) { h.taken = e.id; ai.hideSpot = h; ai.state = 'tohide'; ai.step = h.door ? 0 : 1; ai.t = 14; break; }
      }
      if (G.now - ai.lastSeen > 8 && kd > lvl.sight) { ai.state = 'walk'; e.pose = 0; pickWander(e, { x: ai.kx, z: ai.kz }); }
      break;
    }
    case 'tohide': {
      e.pose = 1; ai.t -= dt;
      const h = ai.hideSpot, tgt = ai.step === 0 ? h.door : h;
      const dx = tgt.x - e.x, dz = tgt.z - e.z, d = Math.hypot(dx, dz);
      if (ai.step === 0 && d < 0.9) ai.step = 1;
      else if (ai.step === 1 && d < 0.5 || ai.t <= 0) { ai.state = 'hide'; ai.t = 20 + Math.random() * 20; e.pose = 7; e.speed = 0; break; }
      if (ai.step === 1 && d < 3) { // the last few steps are direct, through doorways
        const p = { x: e.x + (dx / d) * 3 * dt, z: e.z + (dz / d) * 3 * dt }; resolve(world.layout, p, 0.25);
        e.speed = 3; e.x = p.x; e.z = p.z; e.yaw = angLerp(e.yaw, Math.atan2(-dx, -dz), dt * 8);
      } else steer(e, dx / d, dz / d, dt, 3.6 * spdMul);
      break;
    }
    case 'hide':
      e.speed = 0; e.pose = 7; ai.t -= dt;
      if (ai.t <= 0) { if (ai.hideSpot) ai.hideSpot.taken = null; ai.hideSpot = null; ai.state = 'walk'; e.pose = 0; pickWander(e, { x: ai.kx, z: ai.kz }); }
      break;
    case 'cower':
      e.speed = 0; e.pose = 2; ai.t -= dt;
      if (ai.t <= 0) { ai.state = 'flee'; ai.stamina = 1.5; e.pose = 1; }
      break;
  }
  if (ai.state !== 'flee' && ai.state !== 'tohide') ai.stamina = Math.min(5, ai.stamina + dt * 0.5);
}
// A held victim hangs from the hand that grabbed them, struggles, and may wriggle free.
function updateHeld(e, dt) {
  const ai = e.ai, by = e.heldBy;
  const gp = grabPosOf(by, e.heldKey), hp = posOf(by);
  if (!gp || !hp || (by !== G.myId && !G.players.has(by))) { hostRelease(e.id, [0, 0, 0]); return; }
  const dx = gp.x - hp.x, dzz = gp.z - hp.z, l = Math.hypot(dx, dzz) || 1;
  e.x = gp.x + (dx / l) * 0.12; e.z = gp.z + (dzz / l) * 0.12; e.y = clamp(gp.y - 1.55, 0, 0.8);
  e.yaw = Math.atan2(-(hp.x - e.x), -(hp.z - e.z)); e.speed = 0;
  e.pose = e.choking ? 5 : 4;
  if (e.choking) {
    e.hp -= 22 * dt;
    if (e.hp <= 0) { e.hp = 0; broadcastAll({ t: 'kill', id: e.id, by, part: 'head', dir: [r2(dx / l), r2(dzz / l)], w: 'choke', seed: (Math.random() * 1e9) | 0 }); }
  } else {
    ai.escT += dt;
    if (ai.escT > 4 && Math.random() < dt * 0.45) {
      hostRelease(e.id, [0, 0, 0]);
      broadcastAll({ t: 'feed', s: `${e.name} broke free!` });
    }
  }
}
function updateKillerAI(e, dt, lvl) {
  const ai = e.ai;
  ai.atkCD -= dt; ai.retarget -= dt;
  const targets = camperTargets();
  if (ai.retarget <= 0) {
    ai.retarget = 0.5;
    let best = null, bd = 1e9;
    for (const c of targets) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      const seen = d < 6 || (d < 22 && los(world.layout, e.x, e.z, c.x, c.z));
      if (seen && d < bd) { bd = d; best = c; }
    }
    if (best) { ai.tgt = best.id; ai.hunting = true; }
  }
  const tgt = ai.tgt ? targets.find(c => c.id === ai.tgt) : null;
  if (ai.tgt && !tgt) ai.tgt = null;
  if (tgt) { ai.tx = tgt.x; ai.tz = tgt.z; }
  if (ai.swing > 0) {
    ai.swing -= dt; e.pose = 3; e.speed = 0;
    if (!ai.struck && ai.swing < 0.28) {
      ai.struck = true;
      if (tgt && Math.hypot(tgt.x - e.x, tgt.z - e.z) < 2) {
        const d = Math.hypot(tgt.x - e.x, tgt.z - e.z) || 1;
        hostHit(tgt.id, Math.random() < 0.3 ? 'head' : Math.random() < 0.5 ? 'torso' : ['armL', 'armR', 'legL', 'legR'][(Math.random() * 4) | 0], 50, [(tgt.x - e.x) / d, (tgt.z - e.z) / d], 'machete', 'ai');
        sfxAt('hit', e.x, e.z);
      }
    }
    return;
  }
  e.pose = 0;
  const dx = ai.tx - e.x, dz = ai.tz - e.z, d = Math.hypot(dx, dz) || 1;
  if (tgt && d < 1.5 && ai.atkCD <= 0) {
    ai.swing = 0.6; ai.struck = false; ai.atkCD = 1.15; e.yaw = Math.atan2(-dx, -dz);
    sfxAt('swing', e.x, e.z);
    return;
  }
  if (tgt || (ai.hunting && d > 1.5)) { steer(e, dx / d, dz / d, dt, (tgt ? 4.0 : 3.0) * lvl.speed); if (!tgt && d < 2) ai.hunting = false; }
  else {
    if (ai.wx === null || Math.hypot(ai.wx - e.x, ai.wz - e.z) < 1.5) pickWander(e);
    steer(e, (ai.wx - e.x) / (Math.hypot(ai.wx - e.x, ai.wz - e.z) || 1), (ai.wz - e.z) / (Math.hypot(ai.wx - e.x, ai.wz - e.z) || 1), dt, 2.3 * lvl.speed);
  }
}
function hostSim(dt) {
  G.timeLeft -= dt;
  const lvl = LEVELS[G.levelIdx];
  const killers = killerSpots();
  const npcs = [];
  for (const e of G.ents.values()) {
    if (!e.ai || e.dead) continue;
    if (e.heldBy) updateHeld(e, dt);
    if (e.dead) continue;
    if (e.role === 'camper') updateCamperAI(e, dt, lvl, killers); else updateKillerAI(e, dt, lvl);
    npcs.push(e);
  }
  for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) {
    const a = npcs[i], b = npcs[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (a.heldBy || b.heldBy) continue;
    if (d2 < 0.36 && d2 > 1e-6) { const d = Math.sqrt(d2), k = (0.6 - d) / d * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
  if (campersAlive() === 0 || (G.role === 'solo' && G.me.role === 'camper' && G.me.dead && G.now - G.me.deadAt > 2.5)) endRound('killers');
  else if (G.timeLeft <= 0) endRound('campers');
}

// ---------- your character ----------
function placeRig(x, z, yaw) {
  G.yaw = yaw;
  rig.rotation.y = yaw;
  if (renderer.xr.isPresenting) {
    const off = TV.set(camera.position.x, 0, camera.position.z).applyAxisAngle(UP, yaw);
    rig.position.set(x - off.x, 0, z - off.z);
  } else {
    rig.position.set(x, 0, z);
    if (G.mode === 'play') G.pitch = 0;
  }
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(G.head);
}
function turnRig(a) {
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(TV);
  TV2.copy(rig.position).sub(TV).applyAxisAngle(UP, a);
  rig.position.copy(TV).add(TV2);
  G.yaw += a; rig.rotation.y = G.yaw;
}
const deadzone = v => (Math.abs(v) < 0.15 ? 0 : v);
function moveLocal(dt) {
  const vr = renderer.xr.isPresenting;
  let mx = 0, mz = 0, sprint = false;
  if (!(G.paused && !vr)) {
    if (vr) { mx = deadzone(VR.mx); mz = -deadzone(VR.my); sprint = VR.sprint; }
    else {
      mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
      mz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0);
      sprint = !!(K.ShiftLeft || K.ShiftRight || T.sprint);
      if (T.active) { mx += T.mx; mz += T.mz; }
    }
  }
  if (vr) {
    const t = VR.turn;
    if (Math.abs(t) > 0.7 && !G.turnLatch) { G.turnLatch = true; turnRig(-Math.sign(t) * Math.PI / 4); }
    else if (Math.abs(t) < 0.3) G.turnLatch = false;
  } else { rig.rotation.y = G.yaw; camera.rotation.set(G.pitch, 0, 0); }
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(G.head);
  let fx, fz;
  if (vr) { camera.getWorldDirection(TV); fx = TV.x; fz = TV.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
  else { fx = -Math.sin(G.yaw); fz = -Math.cos(G.yaw); }
  const rx = -fz, rz = fx;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  const me = G.me;
  let speed = 3.0;
  const moving = Math.hypot(mx, mz) > 0.2;
  if (me.dead) speed = 4.5;
  else if (me.role === 'killer') { if (sprint && moving) speed = 4.4; }
  else {
    if (sprint && moving && !me.exhausted) { speed = 5.2; me.stamina -= dt; if (me.stamina <= 0) { me.stamina = 0; me.exhausted = true; } }
    else { me.stamina = Math.min(6, me.stamina + dt * 0.6); if (me.stamina > 1.5) me.exhausted = false; }
  }
  const p = { x: G.head.x + (fx * mz + rx * mx) * speed * dt, z: G.head.z + (fz * mz + rz * mx) * speed * dt };
  if (world) { if (me.dead) { const B = world.layout.half - 0.5; p.x = clamp(p.x, -B, B); p.z = clamp(p.z, -B, B); } else resolve(world.layout, p, 0.3); }
  rig.position.x += p.x - G.head.x; rig.position.z += p.z - G.head.z;
  G.head.x = p.x; G.head.z = p.z;
  if (G.shake > 0 && !vr) { G.shake -= dt; camera.position.x = (Math.random() - 0.5) * G.shake * 0.08; camera.position.y = eyeH() + (Math.random() - 0.5) * G.shake * 0.08; }
  else if (!vr) { camera.position.x = 0; camera.position.y = eyeH(); }
}

// ---------- combat ----------
function targets() {
  const out = [];
  for (const e of G.ents.values()) if (e.role === 'camper' && !e.dead && e.char) out.push(e);
  return out;
}
function hitPart(p, t) {
  const y = p.y - (t.y || 0);
  const dx = p.x - t.x, dz = p.z - t.z;
  if (t.pose === 6) { // lying on the ground
    if (y > 0.6 || dx * dx + dz * dz > 0.85 * 0.85) return null;
    const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw), along = -(dx * fx + dz * fz);
    return along > 0.95 ? 'head' : along > 0.35 ? 'torso' : dx * Math.cos(t.yaw) - dz * Math.sin(t.yaw) < 0 ? 'legL' : 'legR';
  }
  const crouch = t.pose === 2 || t.pose === 7 ? 0.45 : 0;
  if (y < 0.05 || y > 1.95 - crouch) return null;
  const rad = y > 1.5 - crouch ? 0.2 : 0.33;
  if (dx * dx + dz * dz > rad * rad) return null;
  const side = dx * Math.cos(t.yaw) - dz * Math.sin(t.yaw);
  if (y > 1.52 - crouch) return 'head';
  if (y > 0.9 - crouch * 0.5) return Math.abs(side) > 0.2 ? (side < 0 ? 'armL' : 'armR') : 'torso';
  return side < 0 ? 'legL' : 'legR';
}
function curWeapon() { return G.weapon ? WEAPON[G.weapon] : SPECIAL.fists; }
function doHit(id, part, dmg, dir, w) {
  w = w || G.weapon || 'fists';
  if (G.role === 'client') G.net.send({ t: 'hit', id, part, dmg: Math.round(dmg), dir: [r2(dir[0]), r2(dir[1])], w });
  else hostHit(id, part, dmg, dir, w, G.myId);
}
function bladeHits(w, len, cb) {
  const seen = new Set();
  for (const k of [0.35, 0.6, 0.85, 1]) {
    const p = w.localToWorld(TV3.set(0, 0, -len * k));
    for (const t of targets()) {
      if (seen.has(t.id)) continue;
      const part = hitPart(p, t);
      if (part) { seen.add(t.id); cb(t, part); }
    }
  }
}
// Where a hand is: the controller in VR, or a point in front of you on a screen.
function handPos(key, out) {
  if (renderer.xr.isPresenting) {
    const h = handOf(key === 'L' ? 'left' : 'right');
    if (h && h.src) return h.grip.getWorldPosition(out);
  }
  camera.getWorldPosition(out); camera.getWorldDirection(TV2);
  const fl = Math.hypot(TV2.x, TV2.z) || 1, fx = TV2.x / fl, fz = TV2.z / fl, side = key === 'L' ? -1 : 1;
  out.x += fx * 0.85 - fz * side * 0.12; out.z += fz * 0.85 + fx * side * 0.12; out.y -= 0.3;
  return out;
}
function updateHandVel(dt) {
  for (const k of ['L', 'R']) {
    handPos(k, TV3);
    const v = TV2.copy(TV3).sub(G.handPrev[k]).divideScalar(Math.max(dt, 1e-3));
    if (v.lengthSq() > 900) v.set(0, 0, 0);
    G.handVel[k].lerp(v, 0.4);
    G.handPrev[k].copy(TV3);
  }
}
const tipState = { R: { p: new THREE.Vector3(), ok: false, spd: 0, whoosh: 0 }, L: { p: new THREE.Vector3(), ok: false, spd: 0, whoosh: 0 } };
function swingHand(dt, key, item, W) {
  const st = tipState[key];
  if (!item || !item.parent || !item.parent.visible) { st.ok = false; return; }
  item.updateWorldMatrix(true, false);
  const len = item.userData.len || 0.1;
  const tip = item.localToWorld(TV.set(0, 0, -len));
  if (!st.ok) { st.p.copy(tip); st.ok = true; return; }
  const vel = TV2.copy(tip).sub(st.p).divideScalar(Math.max(dt, 1e-3));
  st.p.copy(tip);
  st.spd = lerp(st.spd, vel.length(), 0.5);
  const hl = Math.hypot(vel.x, vel.z) || 1, dir = [vel.x / hl, vel.z / hl];
  const hand = handOf(key === 'L' ? 'left' : 'right');
  if (W.saw) {
    setSaw(VR.trigger ? 2 : 1);
    if (VR.trigger) {
      buzz(hand, 0.25, 30);
      G.sawTick -= dt;
      if (G.sawTick <= 0) {
        G.sawTick = 0.12;
        camera.getWorldDirection(TV3); const fd = [TV3.x, TV3.z];
        bladeHits(item, len, (t, part) => { doHit(t.id, part, W.dmg * 0.12, fd, W.id); buzz(hand, 1, 60); });
      }
    }
    return;
  }
  const fists = W.id === 'fists';
  if (st.spd > 3.2 && G.now - st.whoosh > 0.35) { st.whoosh = G.now; sfx('swing', fists ? 0.35 : 0.7, fists ? 1.4 : 1); }
  if (st.spd < (fists ? 2.6 : 2.0)) return;
  bladeHits(item, len, (t, part) => {
    const k = key + t.id;
    if ((G.hitCD.get(k) || 0) > G.now) return;
    G.hitCD.set(k, G.now + 0.45);
    const dmg = (fists ? 14 : W.dmg) * clamp(st.spd / 4, 0.6, 1.5);
    doHit(t.id, part, dmg, dir, W.id);
    buzz(hand, 1, 90);
    sfx(fists ? 'punch' : 'hit');
  });
}
function strikeCone(W, dmg, quiet) {
  camera.getWorldDirection(TV);
  const fl = Math.hypot(TV.x, TV.z) || 1;
  let best = null, bs = 1e9, bd = 0;
  for (const t of targets()) {
    const dx = t.x - G.head.x, dzz = t.z - G.head.z, d = Math.hypot(dx, dzz);
    if (d > (W.reach || 1.5) + 0.3 || d < 0.01) continue;
    const cos = (dx * TV.x + dzz * TV.z) / (d * fl);
    if (cos < 0.7) continue;
    const s = d * (1.6 - cos);
    if (s < bs) { bs = s; best = t; bd = d; }
  }
  if (!best) return false;
  let part;
  if (best.pose === 6) part = Math.random() < 0.5 ? 'torso' : 'head';
  else {
    const crouch = best.pose === 2 || best.pose === 7 ? 0.45 : 0;
    const y = clamp(G.head.y + (TV.y / fl) * bd - (best.y || 0), 0.3, 1.8);
    part = y > 1.5 - crouch ? 'head' : y > 0.9 - crouch * 0.5 ? (Math.random() < 0.25 ? (Math.random() < 0.5 ? 'armL' : 'armR') : 'torso') : (Math.random() < 0.5 ? 'legL' : 'legR');
  }
  doHit(best.id, part, dmg, [TV.x / fl, TV.z / fl], W.id);
  if (!quiet) { sfx(W.id === 'fists' ? 'punch' : 'hit'); G.shake = 0.18; }
  return true;
}
function desktopMelee(dt, W) {
  const me = G.me;
  if (W.saw) {
    if (H.attack) {
      setSaw(2); G.shake = Math.max(G.shake, 0.05);
      G.sawTick -= dt;
      if (G.sawTick <= 0) { G.sawTick = 0.12; strikeCone(W, W.dmg * 0.12, true); }
    } else setSaw(1);
    vm.rotation.set(H.attack ? (Math.random() - 0.5) * 0.04 : 0, 0, 0);
    return;
  }
  setSaw(0);
  const swing = W.swing || 0.35;
  if ((E.attack || H.attack) && me.swingT <= 0) { me.swingT = swing; me.hitDone = false; sfx('swing', W.id === 'fists' ? 0.35 : 1, W.id === 'fists' ? 1.4 : 1); }
  if (me.swingT > 0) {
    me.swingT -= dt;
    const p = clamp(1 - me.swingT / swing, 0, 1);
    if (!me.hitDone && p >= 0.4) { me.hitDone = true; strikeCone(W, W.dmg, false); }
    if (W.id === 'fists') vm.rotation.set(0, 0, 0), vm.position.z = -0.5 - Math.sin(p * Math.PI) * 0.35;
    else {
      const rx = p < 0.25 ? (p / 0.25) * 0.5 : p < 0.5 ? 0.5 - ((p - 0.25) / 0.25) * 2.2 : -1.7 + ((p - 0.5) / 0.5) * 1.7;
      const ry = p < 0.25 ? -(p / 0.25) * 0.3 : p < 0.5 ? -0.3 + ((p - 0.25) / 0.25) * 0.9 : 0.6 - ((p - 0.5) / 0.5) * 0.6;
      vm.rotation.set(rx, ry, 0);
    }
  } else { vm.rotation.set(0, 0, 0); vm.position.z = -0.5; }
}

// ---------- grabbing, choking, kicking ----------
function nearestCamperTo(p, maxD, npcOnly) {
  let best = null, bd = maxD;
  for (const e of G.ents.values()) {
    if (e.role !== 'camper' || e.dead || !e.char || (npcOnly && e.kind !== 'npc') || (e.heldBy && e.heldBy !== G.myId)) continue;
    const by = e.y || 0;
    const d = Math.hypot(e.x - p.x, clamp(p.y, by + (e.pose === 6 ? 0 : 0.3), by + (e.pose === 6 ? 0.4 : 1.7)) - p.y, e.z - p.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function tryGrab(key) {
  const hp = handPos(key, new THREE.Vector3());
  const e = nearestCamperTo(hp, renderer.xr.isPresenting ? 0.55 : 1.2, true);
  if (!e) return false;
  if (G.role === 'client') G.net.send({ t: 'grab', id: e.id, h: key });
  else hostGrab(e.id, G.myId, key);
  return true;
}
function releaseHold(key, vel) {
  const id = G.hold[key];
  if (!id) return;
  G.hold[key] = null; G.choke[key] = false;
  const v = [r2(vel.x), r2(vel.y), r2(vel.z)];
  if (G.role === 'client') G.net.send({ t: 'release', id, v });
  else hostRelease(id, v);
}
function setChoke(key, on) {
  if (G.choke[key] === on) return;
  G.choke[key] = on;
  const id = G.hold[key];
  if (!id) return;
  if (G.role === 'client') G.net.send({ t: 'choke', id, on: on ? 1 : 0 });
  else hostChoke(id, G.myId, on);
}
function tryKick() {
  if (G.kickCD > 0) return;
  G.kickCD = 0.75; G.kickT = 0.45;
  sfx('swing', 0.5, 0.6);
  camera.getWorldDirection(TV);
  const fl = Math.hypot(TV.x, TV.z) || 1, fx = TV.x / fl, fz = TV.z / fl;
  let best = null, bd = 1e9;
  for (const t of targets()) {
    const dx = t.x - G.head.x, dzz = t.z - G.head.z, d = Math.hypot(dx, dzz);
    if (d > 1.7 || (d > 0.35 && (dx * fx + dzz * fz) / d < 0.55)) continue;
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return;
  buzzAll(0.8, 120);
  if (G.role === 'client') G.net.send({ t: 'kick', id: best.id, dir: [r2(fx), r2(fz)] });
  else hostKick(best.id, [fx, fz], G.myId);
}

// ---------- weapons lying around ----------
function spawnPickup(id, w, p, rot, v, thrower) {
  if (G.pickups.has(id)) return null;
  const obj = makeWeapon(w);
  obj.position.set(p[0], p[1], p[2]);
  if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
  charsGroup.add(obj);
  const pk = { id, w, obj, v: v ? new THREE.Vector3(v[0], v[1], v[2]) : null, spin: v ? new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, -12 - Math.random() * 6) : null, thrower: thrower || null };
  G.pickups.set(id, pk);
  return pk;
}
function removePickup(id) { const pk = G.pickups.get(id); if (pk) { pk.obj.removeFromParent(); G.pickups.delete(id); } }
function nearestPickup(p, maxD) {
  let best = null, bd = maxD;
  for (const pk of G.pickups.values()) {
    if (pk.v) continue;
    pk.obj.getWorldPosition(TV2);
    const d = TV2.distanceTo(p);
    if (d < bd) { bd = d; best = pk; }
  }
  return best;
}
function lookPoint(out) { camera.getWorldPosition(out); camera.getWorldDirection(TV2); return out.addScaledVector(TV2, 1.1); }
function tryTake(p, maxD) {
  const pk = nearestPickup(p, maxD);
  if (!pk) return false;
  if (G.role === 'client') G.net.send({ t: 'take', id: pk.id });
  else hostTake(pk.id, G.myId);
  return true;
}
function dropWeapon(vel) {
  if (!G.weapon) return;
  const item = renderer.xr.isPresenting ? vrItem : vmItem;
  item.getWorldPosition(TV3); item.getWorldQuaternion(TQ);
  const eu = new THREE.Euler().setFromQuaternion(TQ);
  const m = { t: 'drop', w: G.weapon, p: [r2(TV3.x), r2(TV3.y), r2(TV3.z)], r: [r2(eu.x), r2(eu.y), r2(eu.z)], v: [r2(vel.x), r2(vel.y), r2(vel.z)] };
  G.weapon = null; setSaw(0); refreshHeld();
  sfx('swing', 0.5, 0.8);
  if (G.role === 'client') G.net.send(m); else hostDrop(m, G.myId);
}
function updatePickups(dt) {
  const L = world && world.layout;
  const near = G.me.role === 'killer' && !G.me.dead && !G.weapon;
  const hp = near ? (renderer.xr.isPresenting ? handPos('R', TV3) : lookPoint(TV3)) : null;
  for (const pk of G.pickups.values()) {
    const o = pk.obj;
    if (pk.v) {
      pk.v.y -= 9.8 * dt;
      const ox = o.position.x, oz = o.position.z;
      o.position.addScaledVector(pk.v, dt);
      o.rotateX(pk.spin.z * dt);
      if (L && o.position.y < 3 && blocked(L, o.position.x, o.position.z, 0.05)) { o.position.x = ox; o.position.z = oz; pk.v.x *= -0.3; pk.v.z *= -0.3; }
      if (G.role !== 'client' && pk.thrower && pk.v.length() > 5) {
        for (const t of targets()) {
          const part = hitPart(o.position, t);
          if (part) {
            const W = WEAPON[pk.w], sp = Math.hypot(pk.v.x, pk.v.z) || 1;
            hostHit(t.id, part, W.dmg * 0.9, [pk.v.x / sp, pk.v.z / sp], pk.w, pk.thrower);
            pk.v.multiplyScalar(0.15); pk.thrower = null;
            break;
          }
        }
      }
      if (o.position.y <= 0.06) {
        o.position.y = 0.06; pk.v = null; pk.thrower = null;
        o.rotation.set(0, o.rotation.y, Math.PI / 2);
        sfxAt('clink', o.position.x, o.position.z, 0.8);
      }
    }
    const blade = o.userData.blade;
    if (blade) {
      o.getWorldPosition(TV2);
      const lit = hp && !pk.v && TV2.distanceTo(hp) < (renderer.xr.isPresenting ? 0.45 : 1.6);
      blade.emissive.setHex(lit ? 0x442222 : 0x000000);
    }
  }
}

// ---------- your turn each frame ----------
function combatLocal(dt) {
  const me = G.me;
  me.senseCD = Math.max(0, me.senseCD - dt);
  me.senseT = Math.max(0, me.senseT - dt);
  G.kickCD = Math.max(0, G.kickCD - dt); G.kickT = Math.max(0, G.kickT - dt);
  if (me.dead || G.phase !== 'playing') { setSaw(0); for (const k of ['L', 'R']) if (G.hold[k]) releaseHold(k, TV.set(0, 0, 0)); return; }
  if (me.role === 'camper') {
    if (E.sense || E.flashToggle) { G.flashOn = !G.flashOn; updateLights(); sfx('click', 0.5, 0.6); }
    return;
  }
  if (E.sense && me.senseCD <= 0) { me.senseT = 4; me.senseCD = 20; sfx('sense'); }
  updateHandVel(dt);
  const vr = renderer.xr.isPresenting;
  if (vr) {
    if (edge('lg', VR.lgrip) && !G.hold.L) tryGrab('L');
    if (!VR.lgrip && G.hold.L) releaseHold('L', G.handVel.L);
    setChoke('L', !!G.hold.L && VR.ltrig);
    if (edge('rg', VR.rgrip) && !G.hold.R) {
      if (G.weapon) dropWeapon(G.handVel.R.clone().multiplyScalar(1.3));
      else if (!tryTake(handPos('R', new THREE.Vector3()), 0.45)) tryGrab('R');
    }
    if (!VR.rgrip && G.hold.R) releaseHold('R', G.handVel.R);
    setChoke('R', !!G.hold.R && VR.trigger);
    if (edge('x', VR.x)) tryKick();
  } else {
    const grabHeld = H.rmb || T.grab;
    if (grabHeld && !G.grabWas && !G.hold.L) tryGrab('L');
    G.grabWas = grabHeld;
    if (G.hold.L) {
      if (!grabHeld) releaseHold('L', TV.set(0, 0, 0));
      else { G.rmbT += dt; setChoke('L', G.rmbT > 0.35); }
    } else G.rmbT = 0;
    camera.getWorldDirection(TV2);
    if (E.kick) {
      if (G.hold.L) releaseHold('L', TV.copy(TV2).multiplyScalar(7).add(TV3.set(0, 2, 0)));
      else tryKick();
    }
    if (E.item) { if (G.weapon) dropWeapon(TV.copy(TV2).multiplyScalar(2.5).add(TV3.set(0, 1, 0))); else tryTake(lookPoint(new THREE.Vector3()), 1.8); }
    if (E.throwW && G.weapon) dropWeapon(TV.copy(TV2).multiplyScalar(15).add(TV3.set(0, 1.5, 0)));
  }
  const W = curWeapon();
  if (vr) { swingHand(dt, 'R', vrItem, W); if (!G.hold.L) swingHand(dt, 'L', vrGlove, SPECIAL.fists); }
  else desktopMelee(dt, W);
  // the boot swinging into view
  boot.visible = G.kickT > 0 && !vr;
  if (boot.visible) { const k = Math.sin((1 - G.kickT / 0.45) * Math.PI); boot.position.set(0.12, -1.1 + k * 0.55, -0.35 - k * 0.45); boot.rotation.set(-0.9 + k * 0.4, 0, 0); }
  if (G.blood > 0.3 && vr && Math.random() < dt * 2.5 && vrItem && vrItem.parent && G.weapon) {
    dripBlood(vrItem.localToWorld(TV.set(0, 0, -vrItem.userData.len * 0.8)));
  }
}

// ---------- remote characters on screen ----------
function updateEnts(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const e of G.ents.values()) {
    if (e.dead) continue;
    const c = e.char;
    const mine = G.hold.L === e.id ? 'L' : G.hold.R === e.id ? 'R' : null;
    if (mine) {
      // You are holding this one: pin them to your hand right away, without waiting for the host.
      const gp = handPos(mine, TV);
      const dx = gp.x - G.head.x, dzz = gp.z - G.head.z, l = Math.hypot(dx, dzz) || 1;
      e.x = gp.x + (dx / l) * 0.12; e.z = gp.z + (dzz / l) * 0.12; e.y = clamp(gp.y - 1.55, 0, 0.8);
      e.tx = e.x; e.tz = e.z; e.yaw = Math.atan2(-(G.head.x - e.x), -(G.head.z - e.z)); e.tyaw = e.yaw;
    } else if (!e.ai) {
      const ox = e.x, oz = e.z;
      e.x = lerp(e.x, e.tx, k); e.z = lerp(e.z, e.tz, k); e.yaw = angLerp(e.yaw, e.tyaw, k); e.pitch = lerp(e.pitch, e.tpitch, k);
      e.y = lerp(e.y || 0, e.ny || 0, k);
      if (e.kind === 'player') e.speed = lerp(e.speed, Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, 1e-3), 0.2);
    }
    const dist = Math.hypot(e.x - G.head.x, e.z - G.head.z);
    c.visible = dist < 50;
    c.position.x = e.x; c.position.z = e.z; c.rotation.y = e.yaw;
    const swinging = e.kind === 'player' && e.role === 'killer' && e.flags & 2 && !e.hand;
    let pose = POSES[e.pose] || '';
    if (swinging) pose = 'attack';
    if (c.visible) animChar(c, e.speed, dt, pose);
    c.position.y = (e.y || 0) + c.userData.lift;
    if (e.kind === 'player') c.userData.look2 = clamp(e.pitch, -0.8, 0.8);
    // a remote killer's weapon follows what they are holding right now
    if (e.kind === 'player' && e.role === 'killer' && e.wi !== undefined && e.wi !== e.curWi) {
      e.curWi = e.wi;
      if (e.held) e.held.removeFromParent();
      e.held = e.wi >= 0 && WEAPONS[e.wi] ? makeWeapon(WEAPONS[e.wi].id) : null;
      if (e.held) c.userData.P.handR.add(e.held);
    }
    if (e.held) {
      if (e.hand) {
        if (e.held.parent !== charsGroup) charsGroup.add(e.held);
        e.held.position.lerp(TV.set(e.hand[0], e.hand[1], e.hand[2]), k);
        e.held.quaternion.slerp(TQ.set(e.hand[3], e.hand[4], e.hand[5], e.hand[6]), k);
        e.held.visible = c.visible;
      } else if (e.held.parent !== c.userData.P.handR) { c.userData.P.handR.add(e.held); e.held.position.set(0, 0, 0); e.held.quaternion.identity(); }
    }
    if (e.cone) e.cone.visible = !!(e.flags & 8);
    const sameTeam = e.role === G.me.role && e.kind === 'player';
    e.tag.visible = sameTeam && dist < 30;
    e.sense.visible = G.me.role === 'killer' && G.me.senseT > 0 && e.role === 'camper';
    // voices
    if (e.kind !== 'player' && e.role === 'camper' && e.pose !== e.prevPose) {
      const v = voiceOf(e);
      if (e.pose === 1 && G.now - e.lastScream > 5) { e.lastScream = G.now; sfxAt('scream', e.x, e.z, 1, v); if (Math.random() < 0.6) setTimeout(() => !e.dead && sayAt(pick(LINES.flee), e), 900); }
      else if (e.pose === 4) { sfxAt('scream', e.x, e.z, 1, v); sayAt(pick(LINES.held), e); }
      else if (e.pose === 2 && Math.random() < 0.6) sayAt(pick(LINES.cower), e);
      else if (e.pose === 6) sfxAt('pain', e.x, e.z, 1, v);
    }
    if (e.pose === 5) {
      e.gaspT = (e.gaspT || 0) - dt;
      if (e.gaspT <= 0) { e.gaspT = 0.55 + Math.random() * 0.3; sfxAt('gasp', e.x, e.z, 1, voiceOf(e)); }
      const hm = c.userData.P.headMesh;
      if (hm) { if (!hm.userData.own) { hm.material = hm.material.clone(); hm.userData.own = true; } hm.material.color.lerp(TV3.set(0.55, 0.5, 0.85), dt * 0.25); }
    }
    e.prevPose = e.pose;
    if (e.wounded) { e.dripT -= dt; if (e.dripT <= 0) { e.dripT = 0.12; dripBlood(TV.set(e.x, (e.y || 0) + 1.0, e.z)); } }
  }
}

// ---------- network ticking ----------
function myState() {
  camera.getWorldDirection(TV);
  const yaw = Math.atan2(-TV.x, -TV.z), pitch = Math.asin(clamp(TV.y, -1, 1));
  const flags = (G.me.dead ? 1 : 0) | (G.me.swingT > 0 ? 2 : 0) | (G.me.role === 'camper' && G.flashOn ? 8 : 0);
  const a = [r2(G.head.x), r2(G.head.y), r2(G.head.z), r2(yaw), r2(pitch), flags, G.weapon ? WEAPONS.findIndex(w => w.id === G.weapon) : -1];
  const gk = G.hold.L ? 'L' : G.hold.R ? 'R' : null;
  if (gk) { handPos(gk, TV2); a.push(r2(TV2.x), r2(TV2.y), r2(TV2.z)); } else a.push(0, 0, 0);
  const item = renderer.xr.isPresenting ? vrItem : null;
  if (item && item.parent) {
    item.getWorldPosition(TV2); item.getWorldQuaternion(TQ);
    a.push(r2(TV2.x), r2(TV2.y), r2(TV2.z), r3(TQ.x), r3(TQ.y), r3(TQ.z), r3(TQ.w));
  }
  return a;
}
function netTick(dt) {
  if (!G.net) return;
  const now = performance.now();
  G.sendT -= dt; G.pingT -= dt;
  if (G.role === 'client') {
    if (G.mode === 'play' && G.sendT <= 0) { G.sendT = 0.1; G.net.send({ t: 's', a: myState() }); }
    if (G.pingT <= 0) { G.pingT = 3; if (G.mode !== 'play') G.net.send({ t: 'ping' }); }
    if (G.welcomed && now - G.lastHost > 12000) leaveServer('Lost connection to the server.');
  } else if (G.role === 'host') {
    if (G.mode === 'play' && G.sendT <= 0) {
      G.sendT = 0.1;
      const n = [], p = [];
      for (const e of G.ents.values()) if (!e.dead && (e.kind === 'npc' || e.kind === 'ai')) n.push([e.id, r2(e.x), r2(e.z), r2(e.yaw), r2(e.speed), e.pose, r2(e.y || 0)]);
      p.push(['host', ...myState()]);
      for (const pl of G.players.values()) if (pl.id !== 'host' && pl.st) p.push([pl.id, ...pl.st]);
      G.net.broadcast({ t: 'snap', tl: Math.round(G.timeLeft), n, p });
    }
    if (G.pingT <= 0) {
      G.pingT = 2;
      if (G.mode !== 'play') G.net.broadcast({ t: 'ping' });
      for (const pl of [...G.players.values()]) if (pl.id !== 'host' && pl.seen && now - pl.seen > 12000) hostOnLeave(pl.id);
    }
  }
}
function applySnap(m) {
  G.timeLeft = m.tl;
  for (const n of m.n) {
    const e = G.ents.get(n[0]);
    if (!e || e.dead) continue;
    e.tx = n[1]; e.tz = n[2]; e.tyaw = n[3]; e.speed = n[4]; e.pose = n[5]; e.ny = n[6] || 0;
  }
  for (const a of m.p) {
    const id = a[0];
    if (id === G.myId) continue;
    if (!G.ents.has(id) && !(a[6] & 1)) ensurePlayerEnt(id, [a[1], a[3], a[4]]);
    applyPlayerState(id, a.slice(1));
  }
}

// ---------- HUD ----------
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function drawHud() {
  hx.clearRect(0, 0, 1024, 200);
  hx.fillStyle = 'rgba(8,4,6,.62)'; hx.beginPath(); hx.roundRect ? hx.roundRect(0, 0, 1024, 200, 26) : hx.rect(0, 0, 1024, 200); hx.fill();
  const me = G.me, alive = campersAlive();
  hx.textBaseline = 'middle';
  hx.font = `900 58px ${FONT}`; hx.textAlign = 'left';
  if (me.dead) { hx.fillStyle = '#ff4a4a'; hx.fillText('YOU DIED · spectating', 30, 58); }
  else if (me.role === 'killer') { hx.fillStyle = '#ff5a5f'; hx.fillText(`CAMPERS LEFT ${alive}`, 30, 58); }
  else { hx.fillStyle = '#f0e6d0'; hx.fillText(`SURVIVE · ${alive} ALIVE`, 30, 58); }
  hx.textAlign = 'right'; hx.fillStyle = G.timeLeft < 30 ? '#ff5a5f' : '#f0e6d0';
  hx.fillText(fmtTime(G.timeLeft), 994, 58);
  hx.font = `700 34px ${FONT}`; hx.textAlign = 'left';
  const last = G.feed[G.feed.length - 1];
  if (last && G.now - last.t < 6) { hx.fillStyle = '#e8dcd6'; hx.fillText(last.s.slice(0, 52), 30, 145); }
  else if (!me.dead && me.role === 'killer') {
    hx.fillStyle = me.senseCD > 0 ? '#8f8480' : '#ff9a9a';
    hx.fillText(me.senseCD > 0 ? `Sense recharging ${Math.ceil(me.senseCD)}s` : (renderer.xr.isPresenting ? 'Sense ready: press A' : TOUCH ? 'Sense ready' : 'Sense ready: press F'), 30, 145);
  } else if (!me.dead) {
    hx.fillStyle = '#bfb0aa'; hx.fillText('Stamina', 30, 145);
    hx.fillStyle = 'rgba(255,255,255,.12)'; hx.fillRect(190, 130, 500, 30);
    hx.fillStyle = me.exhausted ? '#a33' : '#e8dcb0'; hx.fillRect(190, 130, 500 * (me.stamina / 6), 30);
    hx.fillStyle = '#bfb0aa'; hx.textAlign = 'right'; hx.fillText(`Health ${Math.max(0, Math.round(me.hp))}`, 994, 145);
  }
  hudTex.needsUpdate = true;
}

// ---------- input ----------
const K = {};
const EQ = { attack: false, sense: false, pause: false, kick: false, item: false, throwW: false };
const E = { attack: false, sense: false, pause: false, flashToggle: false, kick: false, item: false, throwW: false };
const H = { attack: false, mouse: false, rmb: false };
const T = { active: false, mx: 0, mz: 0, sprint: false, attack: false, grab: false, lookId: null, lx: 0, ly: 0 };
const VR = { mx: 0, my: 0, turn: 0, sprint: false, trigger: false, a: false, ly: false, prev: {} };

addEventListener('keydown', e => {
  K[e.code] = true;
  if (e.code === 'KeyF') EQ.sense = true;
  if (!e.repeat) { if (e.code === 'KeyQ') EQ.kick = true; if (e.code === 'KeyG') EQ.item = true; if (e.code === 'KeyT') EQ.throwW = true; }
  if (e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); EQ.pause = true; }
  if (G.mode === 'menu' && G.tab === 'mp' && !G.net) {
    const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (m) keypad(m[2]);
    if (e.code === 'Backspace') keypad('del');
    if (e.code === 'Enter') keypad('join');
  }
});
addEventListener('keyup', e => { K[e.code] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; H.mouse = false; H.rmb = false; });

function setNdc(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
canvas.addEventListener('pointerdown', e => {
  audioInit();
  setNdc(e);
  if (panelShown()) { const b = panelHitFromCamera(); if (b) pressButton(b); return; }
  if (G.mode !== 'play') return;
  if (e.pointerType === 'touch') { if (T.lookId === null) { T.lookId = e.pointerId; T.lx = e.clientX; T.ly = e.clientY; } return; }
  if (document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {} return; }
  if (e.button === 0) { H.mouse = true; EQ.attack = true; }
  if (e.button === 2) H.rmb = true;
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') {
    if (e.pointerId === T.lookId) {
      G.yaw -= (e.clientX - T.lx) * 0.006; G.pitch = clamp(G.pitch - (e.clientY - T.ly) * 0.005, -1.3, 1.3);
      T.lx = e.clientX; T.ly = e.clientY;
    }
    return;
  }
  if (document.pointerLockElement === canvas) {
    if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return; // browsers sometimes report a jump right after locking
    G.yaw -= e.movementX * 0.0022; G.pitch = clamp(G.pitch - e.movementY * 0.0022, -1.35, 1.35);
  } else setNdc(e);
});
const endTouch = e => { if (e.pointerId === T.lookId) T.lookId = null; if (e.pointerType !== 'touch') { if (e.button === 2 || e.type === 'pointercancel') H.rmb = false; if (e.button === 0 || e.type === 'pointercancel') H.mouse = false; } };
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) G.wasLocked = true;
  else if (G.mode === 'play' && G.phase === 'playing' && !uiScreen && G.wasLocked && !renderer.xr.isPresenting) openPause();
  G.locked = locked;
  updateDom();
});

// Touch controls
const stick = $('stick'), knob = $('knob');
let stickId = null, stickC = { x: 0, y: 0 };
stick.addEventListener('pointerdown', e => {
  audioInit(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
  const r = stick.getBoundingClientRect(); stickC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; T.active = true; moveStick(e);
});
function moveStick(e) {
  if (e.pointerId !== stickId) return;
  let x = e.clientX - stickC.x, y = e.clientY - stickC.y; const l = Math.hypot(x, y), m = 46;
  if (l > m) { x *= m / l; y *= m / l; }
  knob.style.transform = `translate(${x}px,${y}px)`;
  T.mx = x / m; T.mz = -y / m;
}
stick.addEventListener('pointermove', moveStick);
const stickUp = e => { if (e.pointerId !== stickId) return; stickId = null; T.active = false; T.mx = T.mz = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', stickUp); stick.addEventListener('pointercancel', stickUp);
const hold = (id, on, off) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); on(); }); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); };
hold('tAtk', () => { T.attack = true; EQ.attack = true; }, () => { T.attack = false; });
hold('tRun', () => { T.sprint = true; }, () => { T.sprint = false; });
hold('tSense', () => { EQ.sense = true; }, () => {});
hold('tGrab', () => { T.grab = true; }, () => { T.grab = false; });
hold('tKick', () => { EQ.kick = true; }, () => {});
hold('tItem', () => { EQ.item = true; }, () => {});
hold('tMenu', () => { EQ.pause = true; }, () => {});

function pollXR() {
  const s = renderer.xr.getSession();
  VR.mx = VR.my = VR.turn = 0; VR.sprint = VR.trigger = VR.a = VR.ly = VR.lgrip = VR.rgrip = VR.ltrig = VR.x = false;
  if (!s) return;
  for (const src of s.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const ax = gp.axes, x = ax.length >= 4 ? ax[2] : ax[0] || 0, y = ax.length >= 4 ? ax[3] : ax[1] || 0;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (src.handedness === 'left') { VR.mx = x; VR.my = y; VR.lgrip = b(1); VR.sprint = b(3) || (G.me.role === 'camper' && b(1)); VR.ly = b(5); VR.ltrig = b(0); VR.x = b(4); }
    else { VR.turn = x; VR.trigger = b(0); VR.a = b(4); VR.rgrip = b(1); }
  }
}
function edge(name, v) { const was = VR.prev[name]; VR.prev[name] = v; return v && !was; }
function gatherInput() {
  const vr = renderer.xr.isPresenting;
  const trig = vr && edge('trig', VR.trigger);
  E.attack = EQ.attack || trig;
  E.sense = EQ.sense || (vr && edge('a', VR.a));
  E.pause = EQ.pause || (vr && edge('y', VR.ly));
  E.flashToggle = vr && G.me.role === 'camper' && trig;
  E.kick = EQ.kick; E.item = EQ.item; E.throwW = EQ.throwW;
  EQ.kick = EQ.item = EQ.throwW = false;
  H.attack = (H.mouse && document.pointerLockElement === canvas) || T.attack || (vr && VR.trigger);
  EQ.attack = EQ.sense = EQ.pause = false;
}

function openPause() { if (G.mode !== 'play' || G.phase !== 'playing') return; G.paused = G.role === 'solo'; showPanel('pause'); updateDom(); }
function resume() {
  G.paused = false; showPanel(null);
  if (!renderer.xr.isPresenting && !TOUCH) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  updateDom();
}

// ---------- DOM bits ----------
const gate = $('gate'), vrBtn = $('vr'), gateVr = $('gateVr'), lockHint = $('lockHint'), cross = $('cross'), tc = $('tc');
let xrOK = false;
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => { xrOK = ok; updateDom(); }).catch(() => {});
}
async function enterVR() {
  audioInit();
  if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
  try {
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(s);
  } catch (e) { G.err = 'Could not start VR: ' + (e.message || e); uiDirty = true; }
}
vrBtn.addEventListener('click', enterVR);
gateVr.addEventListener('click', () => { gate.hidden = true; enterVR(); });
$('gatePlay').addEventListener('click', () => { audioInit(); gate.hidden = true; updateDom(); });
renderer.xr.addEventListener('sessionstart', () => {
  camera.rotation.set(0, 0, 0); G.pitch = 0; vm.visible = false;
  splatMesh.scale.set(0.7, 0.7, 1);
  refreshHeld(); uiDirty = true; updateDom();
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 1.65, 0); camera.quaternion.identity(); vm.visible = true;
  resize(); refreshHeld(); uiDirty = true; updateDom();
});
function updateDom() {
  const vr = renderer.xr.isPresenting;
  vrBtn.hidden = !xrOK || !gate.hidden;
  vrBtn.textContent = vr ? 'Exit VR' : 'Enter VR';
  gateVr.hidden = !xrOK;
  const playing = G.mode === 'play' && G.phase === 'playing' && !uiScreen && !vr;
  const locked = document.pointerLockElement === canvas;
  lockHint.hidden = !(playing && !TOUCH && !locked && gate.hidden);
  cross.hidden = !(playing && (locked || TOUCH));
  tc.hidden = !(playing && TOUCH);
  $('tSense').textContent = G.me.role === 'camper' ? 'LIGHT' : 'SENSE';
  for (const id of ['tAtk', 'tGrab', 'tKick', 'tItem']) $(id).hidden = G.me.role === 'camper';
}
lockHint.addEventListener('click', () => { audioInit(); try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const visW = 2 * 0.8 * t * camera.aspect;
  hud.scale.setScalar(Math.min(1, (visW * 0.94) / 0.56));
  // On touch screens the controls fill the bottom, so the HUD goes to the top.
  hud.position.y = TOUCH && !renderer.xr.isPresenting ? 0.8 * t - 0.2 * hud.scale.x : -0.34;
  const sh = 2 * 0.22 * t;
  if (!renderer.xr.isPresenting) splatMesh.scale.set(sh * camera.aspect * 1.05, sh * 1.05, 1);
  // Frame the menu: the panel plus the character preview when the screen is wide enough.
  const wide = camera.aspect > 1.2;
  G.menuX = wide ? 0.45 : 0;
  G.menuDist = Math.max(1.25, (wide ? 3.4 : 2.3) / (2 * t * camera.aspect * 0.95), 1.45 / (2 * t * 0.9));
}
addEventListener('resize', resize);

// ---------- main loop ----------
let last = performance.now();
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  G.now += dt;
  pollXR();
  gatherInput();
  const vr = renderer.xr.isPresenting;
  vm.visible = !vr && G.mode === 'play' && !uiScreen && !G.me.dead;
  hud.visible = G.mode === 'play' && !uiScreen;
  if (G.mode === 'menu') {
    menu.update(G.now);
    if (!vr) {
      rig.position.set(G.menuX || 0, 0, G.menuDist - 2.2);
      rig.rotation.y = lerp(rig.rotation.y, -ndc.x * 0.05 * (Math.abs(ndc.x) < 2 ? 1 : 0), 0.05);
      camera.rotation.set(-0.06 + (Math.abs(ndc.y) < 2 ? ndc.y * 0.03 : 0), 0, 0);
    }
    rig.updateMatrixWorld(true);
    camera.getWorldPosition(G.head);
    if (previewChar) { previewChar.rotation.y = Math.sin(G.now * 0.5) * 0.5; animChar(previewChar, 0, dt, ''); }
  } else {
    if (E.pause) { if (uiScreen === 'pause') resume(); else if (!uiScreen) openPause(); }
    moveLocal(dt);
    if (!G.paused) {
      combatLocal(dt);
      if (G.role !== 'client' && G.phase === 'playing') hostSim(dt);
      else if (G.phase === 'playing') G.timeLeft = Math.max(0, G.timeLeft - dt);
    }
    if (world) world.update(G.now);
    if (!G.paused) updateEnts(dt);
    // heartbeat when a killer is near you as a camper
    if (G.me.role === 'camper' && !G.me.dead && G.phase === 'playing') {
      let kd = 1e9; for (const k of killerSpots()) kd = Math.min(kd, Math.hypot(k.x - G.head.x, k.z - G.head.z));
      if (kd < 20) { G.hbT -= dt; if (G.hbT <= 0) { G.hbT = 0.35 + (kd / 20) * 0.9; sfx('thump', 1 - kd / 22); buzz(handOf('left'), 0.3 * (1 - kd / 20), 40); } }
    }
    if (world && world.party && G.phase === 'playing') {
      G.partyT -= dt;
      if (G.partyT <= 0) { G.partyT = 0.48; sfxAt('party', world.party.x, world.party.z, 0.9); }
    }
    updatePickups(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.25; drawHud(); }
  }
  netTick(dt);
  if (G.splatA > 0) { G.splatA = Math.max(0, G.splatA - dt * 0.22); splatMesh.material.opacity = Math.min(1, G.splatA * 1.2); }
  splatMesh.visible = G.splatA > 0.01;
  if (!G.paused) updateGore(dt);
  updatePointer();
  if (uiDirty && panelShown()) drawUI();
  renderer.render(scene, camera);
}

// ---------- start ----------
resize();
backToMenu();
refreshPreview();
renderer.setAnimationLoop(frame);
updateDom();
window.__slasher = { G, look, startRound, hostGame, joinGame, keypad, backToMenu, setRole, scene, camera, rig, hostHit, placeRig, lookChanged };
