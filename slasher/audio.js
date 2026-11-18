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
    case 'scream': {
      const dur = 1.0 + Math.random() * 0.7, base = (560 + Math.random() * 380) * pitch;
      const g = env(o, t, 0.05, dur * 0.6, dur * 0.4, 0.3);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 1.7; bp.Q.value = 1.4; bp.connect(g);
      for (const k of [1, 1.007]) {
        const s = osc('sawtooth', base * 0.8 * k, bp, t, dur + 0.05);
        s.frequency.linearRampToValueAtTime(base * 1.18 * k, t + 0.15);
        s.frequency.linearRampToValueAtTime(base * 0.72 * k, t + dur);
        const lfo = osc('sine', 6 + Math.random() * 3, ctx.createGain(), t, dur + 0.05);
        const lg = ctx.createGain(); lg.gain.value = base * 0.045; lfo.disconnect(); lfo.connect(lg); lg.connect(s.frequency);
      }
      burst(env(o, t, 0.05, dur * 0.5, dur * 0.4, 0.06), t, dur, 'bandpass', base * 2.2, 1);
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

function ambience() {
  const n = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 360;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(g.gain); n.connect(f); f.connect(g); g.connect(master); n.start(); lfo.start();
  const d = ctx.createOscillator(); d.type = 'sine'; d.frequency.value = 43;
  const dg = ctx.createGain(); dg.gain.value = 0.035; d.connect(dg); dg.connect(master); d.start();
}
