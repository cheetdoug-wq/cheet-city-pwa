// All sound is synthesised with Web Audio, so there are no audio files to download.
let ctx = null, master = null, noise = null, saw = null;

export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  ambience();
}

function out(vol) { const g = ctx.createGain(); g.gain.value = vol; g.connect(master); return g; }
function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; }
function env(dest, t, a, hold, rel, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  g.connect(dest);
  return g;
}
function osc(type, f, dest, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur); return o; }
function burst(dest, t, dur, filterType, freq, q = 1) {
  const n = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  n.connect(f); f.connect(dest); n.start(t, Math.random() * 1.5); n.stop(t + dur); return f;
}

export function sfx(kind, vol = 1, pitch = 1) {
  if (!ctx || vol <= 0.01) return;
  const t = ctx.currentTime, o = out(vol);
  switch (kind) {
    case 'swing': {
      const f = burst(env(o, t, 0.02, 0.05, 0.14, 0.35), t, 0.3, 'bandpass', 2400 * pitch, 1.2);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.2);
      break;
    }
    case 'hit': {
      burst(env(o, t, 0.003, 0.03, 0.18, 0.7), t, 0.3, 'lowpass', 1500 * pitch);
      const s = osc('sine', 170 * pitch, env(o, t, 0.005, 0.02, 0.22, 0.8), t, 0.3);
      s.frequency.exponentialRampToValueAtTime(45, t + 0.22);
      break;
    }
    case 'gore': {
      const f = burst(env(o, t, 0.005, 0.12, 0.45, 0.9), t, 0.7, 'lowpass', 1100 * pitch);
      f.frequency.exponentialRampToValueAtTime(220, t + 0.5);
      burst(env(o, t + 0.12, 0.01, 0.05, 0.3, 0.5), t + 0.12, 0.5, 'bandpass', 600, 2);
      const s = osc('sine', 110 * pitch, env(o, t, 0.005, 0.05, 0.4, 0.9), t, 0.6);
      s.frequency.exponentialRampToValueAtTime(30, t + 0.45);
      burst(env(o, t, 0.001, 0.005, 0.04, 0.6), t, 0.06, 'highpass', 3000);
      break;
    }
    case 'scream': voice(o, t, 1.1 + Math.random() * 0.8, 'scream', pitch); break;
    case 'pain': voice(o, t, 0.35 + Math.random() * 0.2, 'pain', pitch); break;
    case 'death': voice(o, t, 1.2, 'death', pitch); break;
    case 'gasp': voice(o, t, 0.5, 'gasp', pitch); break;
    case 'crunch': {
      for (let i = 0; i < 4; i++) burst(env(o, t + i * 0.03, 0.001, 0.01, 0.05, 0.7), t + i * 0.03, 0.08, 'bandpass', 1800 + Math.random() * 2000, 3);
      const s2 = osc('sine', 90, env(o, t, 0.003, 0.03, 0.2, 0.9), t, 0.3); s2.frequency.exponentialRampToValueAtTime(35, t + 0.2);
      break;
    }
    case 'squelch': {
      for (let i = 0; i < 3; i++) { const f = burst(env(o, t + i * 0.09, 0.01, 0.04, 0.16, 0.6), t + i * 0.09, 0.3, 'lowpass', 700); f.frequency.exponentialRampToValueAtTime(150, t + i * 0.09 + 0.2); }
      break;
    }
    case 'stomp': {
      const s2 = osc('sine', 75, env(o, t, 0.002, 0.04, 0.25, 1), t, 0.35); s2.frequency.exponentialRampToValueAtTime(30, t + 0.25);
      burst(env(o, t, 0.002, 0.02, 0.15, 0.7), t, 0.2, 'lowpass', 500);
      break;
    }
    case 'punch': {
      const s2 = osc('sine', 130, env(o, t, 0.002, 0.02, 0.1, 0.8), t, 0.15); s2.frequency.exponentialRampToValueAtTime(50, t + 0.1);
      burst(env(o, t, 0.001, 0.01, 0.06, 0.5), t, 0.08, 'bandpass', 900, 1);
      break;
    }
    case 'clink': osc('triangle', 1800 * pitch, env(o, t, 0.001, 0.02, 0.25, 0.25), t, 0.3); osc('triangle', 2650 * pitch, env(o, t, 0.001, 0.01, 0.18, 0.15), t, 0.25); break;
    case 'thud': burst(env(o, t, 0.002, 0.02, 0.12, 0.6), t, 0.15, 'lowpass', 350); break;
    case 'party': {
      const k = osc('sine', 58, env(o, t, 0.003, 0.05, 0.18, 0.9), t, 0.3); k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      burst(env(o, t + 0.25, 0.002, 0.01, 0.05, 0.25), t + 0.25, 0.06, 'highpass', 6000);
      break;
    }
    case 'sting': {
      const g = env(o, t, 0.02, 0.6, 2.2, 0.35);
      for (const f of [55, 58.3, 82.4, 116.5]) osc('sawtooth', f * pitch, g, t, 3);
      const hi = env(o, t, 0.01, 0.3, 1.8, 0.12);
      osc('sine', 1760, hi, t, 2.2); osc('sine', 1865, hi, t, 2.2);
      burst(env(o, t, 0.002, 0.04, 0.6, 0.5), t, 0.7, 'lowpass', 300);
      break;
    }
    case 'thump': {
      for (const dt of [0, 0.17]) {
        const s = osc('sine', 62, env(o, t + dt, 0.005, 0.03, 0.14, dt ? 0.6 : 0.9), t + dt, 0.25);
        s.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      }
      break;
    }
    case 'click': osc('sine', 880 * pitch, env(o, t, 0.002, 0.01, 0.06, 0.25), t, 0.1); break;
    case 'sense': {
      const g = env(o, t, 0.05, 0.3, 1.4, 0.3);
      const s = osc('sine', 220, g, t, 2); s.frequency.exponentialRampToValueAtTime(55, t + 1.6);
      osc('triangle', 233, g, t, 2);
      break;
    }
    case 'hurt': {
      burst(env(o, t, 0.002, 0.05, 0.25, 0.7), t, 0.4, 'lowpass', 900);
      const s = osc('square', 300, env(o, t, 0.01, 0.05, 0.25, 0.15), t, 0.35); s.frequency.exponentialRampToValueAtTime(140, t + 0.3);
      break;
    }
    case 'win': {
      const g = env(o, t, 0.05, 0.8, 1.5, 0.25);
      [196, 233, 294, 392].forEach((f, i) => osc('triangle', f, g, t + i * 0.12, 2.5));
      break;
    }
    case 'lose': {
      const g = env(o, t, 0.05, 0.8, 1.6, 0.3);
      [220, 207, 185, 147].forEach((f, i) => osc('sawtooth', f / 2, g, t + i * 0.25, 2.8));
      break;
    }
  }
}

// level: 0 off, 1 idling, 2 revving
export function setSaw(level) {
  if (!ctx) return;
  if (!saw) {
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 97;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = 9;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start(); lfo.start();
    saw = { g, o1, o2, level: 0 };
  }
  if (saw.level === level) return;
  saw.level = level;
  const t = ctx.currentTime;
  saw.g.gain.setTargetAtTime(level === 0 ? 0 : level === 1 ? 0.05 : 0.14, t, 0.05);
  saw.o1.frequency.setTargetAtTime(level === 2 ? 92 : 48, t, 0.08);
  saw.o2.frequency.setTargetAtTime(level === 2 ? 185 : 97, t, 0.08);
}

// A voice: a buzzy glottal source through three vowel formant filters, with vibrato and pitch wobble.
const VOWELS = { a: [850, 1220, 2810], e: [600, 1900, 2600], o: [500, 900, 2500], u: [350, 800, 2400] };
function voice(o, t, dur, kind, pitch = 1) {
  const female = pitch > 1.05;
  const base = (female ? 520 : 330) * pitch * (0.9 + Math.random() * 0.2);
  const vw = VOWELS[kind === 'death' ? 'o' : kind === 'gasp' ? 'u' : Math.random() < 0.7 ? 'a' : 'e'];
  const peak = kind === 'scream' ? 0.45 : kind === 'pain' ? 0.4 : kind === 'death' ? 0.32 : 0.22;
  const g = env(o, t, kind === 'pain' ? 0.015 : 0.05, dur * 0.55, dur * 0.45, peak);
  const fm = [];
  vw.forEach((f, i) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (female ? 1.15 : 1); bp.Q.value = 6 + i * 3;
    const gg = ctx.createGain(); gg.gain.value = [1, 0.6, 0.3][i] * 4; bp.connect(gg); gg.connect(g); fm.push(bp);
  });
  const src = ctx.createOscillator(); src.type = 'sawtooth';
  const f0 = src.frequency;
  if (kind === 'scream') { f0.setValueAtTime(base * 0.75, t); f0.exponentialRampToValueAtTime(base * 1.25, t + 0.18); f0.linearRampToValueAtTime(base * 1.1, t + dur * 0.7); f0.exponentialRampToValueAtTime(base * 0.7, t + dur); }
  else if (kind === 'pain') { f0.setValueAtTime(base * 1.2, t); f0.exponentialRampToValueAtTime(base * 0.8, t + dur); }
  else if (kind === 'death') { f0.setValueAtTime(base * 0.9, t); f0.exponentialRampToValueAtTime(base * 0.35, t + dur); }
  else { f0.setValueAtTime(base * 0.5, t); }
  const vib = ctx.createOscillator(); vib.frequency.value = kind === 'death' ? 14 : 5.5 + Math.random() * 3;
  const vg = ctx.createGain(); vg.gain.value = base * (kind === 'scream' ? 0.06 : kind === 'death' ? 0.12 : 0.03);
  vib.connect(vg); vg.connect(f0);
  for (const bp of fm) src.connect(bp);
  src.start(t); src.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
  // breath and rasp
  const n = noiseSrc(); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = vw[1]; nf.Q.value = 1.2;
  n.connect(nf); nf.connect(env(o, t, 0.03, dur * 0.5, dur * 0.4, kind === 'gasp' ? 0.4 : 0.07));
  n.start(t, Math.random() * 1.5); n.stop(t + dur);
  if (kind === 'death' || kind === 'gasp') { // gurgle
    const am = ctx.createOscillator(); am.frequency.value = 22; const ag = ctx.createGain(); ag.gain.value = 0.5;
    const out2 = ctx.createGain(); out2.gain.value = 0.5; am.connect(ag); ag.connect(out2.gain);
    const n2 = noiseSrc(); const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 400;
    n2.connect(lf); lf.connect(out2); out2.connect(env(o, t + dur * 0.3, 0.05, dur * 0.4, dur * 0.4, 0.5));
    n2.start(t); n2.stop(t + dur + 0.1); am.start(t); am.stop(t + dur + 0.1);
  }
}

// Spoken pleas through the browser's speech engine (quietly skipped where it is unavailable).
let lastSay = 0;
export function say(text, vol = 1, pitch = 1.5) {
  try {
    if (!window.speechSynthesis || vol < 0.08) return;
    const now = performance.now();
    if (speechSynthesis.speaking && now - lastSay < 1500) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    lastSay = now;
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.min(1, vol); u.pitch = Math.min(2, pitch); u.rate = 1.25 + Math.random() * 0.2;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// Crickets and the odd owl.
function nightLife() {
  const tick = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out(0.05 + Math.random() * 0.04);
    if (Math.random() < 0.08) {
      for (const [dt, f] of [[0, 410], [0.35, 390], [0.55, 380]]) { const s2 = osc('sine', f, env(o, t + dt, 0.04, 0.12, 0.2, 0.5), t + dt, 0.5); s2.frequency.linearRampToValueAtTime(f * 0.9, t + dt + 0.3); }
    } else {
      const f = 4200 + Math.random() * 900, n = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) osc('sine', f, env(o, t + i * 0.06, 0.005, 0.02, 0.02, 0.35), t + i * 0.06, 0.06);
    }
    setTimeout(tick, 250 + Math.random() * 900);
  };
  tick();
}

function ambience() {
  nightLife();
  const n = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 360;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(g.gain); n.connect(f); f.connect(g); g.connect(master); n.start(); lfo.start();
  const d = ctx.createOscillator(); d.type = 'sine'; d.frequency.value = 43;
  const dg = ctx.createGain(); dg.gain.value = 0.035; d.connect(dg); dg.connect(master); d.start();
}
