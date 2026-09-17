// So sintetitzat amb WebAudio: cap fitxer, zero bytes de bundle.
//
// Requisit d'integració 5 de Playables: quan YouTube està silenciat NO ha de sortir
// cap so i els controls del joc no hi poden fer res. Per això el guany mestre és
// sempre 0 si platform.audioEnabled() és fals, passi el que passi amb els toggles.
import { audioEnabled, onAudioChange, refreshAudioFlag } from './platform.js';

let ac = null;
let master, sfxBus, musicBus, musicFilter, padBus, percBus, clickBus, musicHP;
let noiseBuf = null;
let started = false;
let paused = false;
let voices = 0;               // pressupost de veus simultànies
const MAX_VOICES = 18;

export const settings = { music: true, sfx: true };

// ── Arrencada ──────────────────────────────────────────────
/** Crea el context. Cal cridar-ho des d'un gest de l'usuari (política d'autoplay). */
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();

    master = ac.createGain();
    master.gain.value = 0;                 // s'ajusta a applyGain()
    master.connect(ac.destination);

    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    musicBus = ac.createGain();
    musicBus.gain.value = 0.34;
    musicBus.connect(master);

    // Passaalt: per sota de 32 Hz no se sent res, només fa fang i menja marge.
    musicHP = ac.createBiquadFilter();
    musicHP.type = 'highpass';
    musicHP.frequency.value = 38;
    musicHP.connect(musicBus);

    // El pad passa pel passabaix; l'arpegi hi entra després, perquè ha de brillar.
    padBus = ac.createGain();
    padBus.gain.value = 1;
    padBus.connect(musicHP);

    musicFilter = ac.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 900;
    musicFilter.Q.value = 0.8;
    musicFilter.connect(padBus);

    // Percussió greu i drone, molt avall: abans es menjaven la música sencera.
    percBus = ac.createGain();
    percBus.gain.value = 0.3;
    percBus.connect(musicHP);

    // L'atac del bombo va a part i bastant amunt. És el que fa que es percebi
    // el pols en un altaveu que no baixa als 50 Hz, i ha de poder pujar sense
    // arrossegar amb ell el subgreu.
    clickBus = ac.createGain();
    clickBus.gain.value = 1.8;
    clickBus.connect(musicHP);

    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    onAudioChange(applyGain);
    applyGain();
  }
  if (ac.state === 'suspended') ac.resume();
  refreshAudioFlag();
  started = true;
  applyGain();
  // Si el joc ja havia demanat música abans del primer gest, arrenca-la ara:
  // altrament es quedaria muda fins al següent canvi de fase.
  if (pendingMode && settings.music) startMusic(pendingMode, pendingWave);
  return true;
}

/** El silenci de YouTube mana per sobre de qualsevol ajust del joc. */
function applyGain() {
  if (!ac) return;
  const on = audioEnabled() && !paused;
  master.gain.setTargetAtTime(on ? 0.55 : 0, ac.currentTime, 0.02);
}

export function setPaused(p) {
  paused = p;
  if (!ac) return;
  applyGain();
  if (p) { stopMusic(); ac.suspend?.(); }
  else ac.resume?.();
}

export function setMusicEnabled(on) {
  settings.music = on;
  if (!on) stopMusic();
  else if (started && pendingMode) startMusic(pendingMode);
}
export function setSfxEnabled(on) { settings.sfx = on; }

const live = () => started && ac && !paused && audioEnabled();

let analyser = null;

/** Diagnòstic: llegeix i ajusta el guany dels busos, per poder aïllar capes
 *  quan es mesura la mescla. El bus mestre no hi és: només el controla el
 *  silenci de YouTube. */
export function busGain(name, value) {
  const buses = { pad: padBus, perc: percBus, click: clickBus, music: musicBus, sfx: sfxBus };
  const b = buses[name];
  if (!b) return null;
  if (value !== undefined) b.gain.value = value;
  return b.gain.value;
}

/** Diagnòstic: nivell mitjà per bandes a la sortida, en dB. Serveix per comprovar
 *  que la música no queda tapada pels greus; no el fa servir el joc. */
export function spectrum() {
  if (!ac || !master) return null;
  if (!analyser) {
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;   // sense això els transitoris curts s'esborren
    master.connect(analyser);
  }
  const buf = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(buf);
  const binHz = ac.sampleRate / analyser.fftSize;
  const band = (lo, hi) => {
    let sum = 0, n = 0;
    for (let i = Math.floor(lo / binHz); i < Math.min(buf.length, hi / binHz); i++) {
      sum += Math.pow(10, buf[i] / 10); n++;
    }
    return n ? +(10 * Math.log10(sum / n)).toFixed(1) : null;
  };
  return { sub: band(20, 80), low: band(80, 250), mid: band(250, 2000), high: band(2000, 8000) };
}

/** Diagnòstic: estat intern del motor de so (l'usa la consola, no el joc). */
export const state = () => ({
  started, ctxState: ac ? ac.state : null, voices,
  music: !!pad, mode, theme: themeIdx, arp: !!arpTimer, drone: !!droneVoice,
  padHz: pad ? pad.map((v) => Math.round(v.o.frequency.value)) : null,
  muteByYouTube: !audioEnabled(),
});

// ── Primitives de síntesi ──────────────────────────────────
function env(gain, t0, attack, decay, peak) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function take() {
  if (voices >= MAX_VOICES) return false;
  voices++;
  return true;
}
function give(node, at) {
  node.onended = () => { voices = Math.max(0, voices - 1); };
  // xarxa de seguretat si onended no arriba
  setTimeout(() => { voices = Math.max(0, voices - 1); node.onended = null; }, (at + 1) * 1000);
}

function tone({ f0, f1, type = 'sine', dur = 0.16, gain = 0.3, attack = 0.005, at = 0, bus = null, detune = 0 }) {
  if (!live()) return;
  const target = bus || sfxBus;
  const counted = target === sfxBus;
  if (counted && !take()) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const gn = ac.createGain();
  env(gn, t, attack, dur, gain);
  o.connect(gn).connect(target);
  o.start(t);
  o.stop(t + dur + 0.05);
  if (counted) give(o, at + dur);
}

function noise({ dur = 0.15, gain = 0.25, f0 = 1200, f1 = null, q = 1, at = 0, type = 'bandpass', bus = null }) {
  if (!live()) return;
  const target = bus || sfxBus;
  const counted = target === sfxBus;
  if (counted && !take()) return;
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bq = ac.createBiquadFilter();
  bq.type = type;
  bq.frequency.setValueAtTime(f0, t);
  if (f1) bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  bq.Q.value = q;
  const gn = ac.createGain();
  env(gn, t, 0.004, dur, gain);
  src.connect(bq).connect(gn).connect(target);
  src.start(t);
  src.stop(t + dur + 0.05);
  if (counted) give(src, at + dur);
}

function chord(freqs, { dur = 0.5, gain = 0.16, type = 'triangle', spread = 0.05 } = {}) {
  freqs.forEach((f, i) => tone({ f0: f, type, dur, gain, attack: 0.02, at: i * spread }));
}

// ── Catàleg d'efectes ──────────────────────────────────────
const SHOTS = {
  pulsar: () => tone({ f0: 900, f1: 380, type: 'square', dur: 0.07, gain: 0.12 }),
  morter: () => { noise({ dur: 0.1, gain: 0.2, f0: 300, f1: 90, q: 2, type: 'lowpass' }); tone({ f0: 120, f1: 45, type: 'sine', dur: 0.22, gain: 0.22 }); },
  arc: () => noise({ dur: 0.12, gain: 0.16, f0: 2600, f1: 900, q: 6 }),
  bastio: () => tone({ f0: 320, f1: 180, type: 'square', dur: 0.05, gain: 0.1 }),
  gel: () => { tone({ f0: 1700, f1: 2600, type: 'sine', dur: 0.18, gain: 0.1 }); noise({ dur: 0.2, gain: 0.07, f0: 4200, q: 3 }); },
  perforador: () => { tone({ f0: 260, f1: 70, type: 'sawtooth', dur: 0.16, gain: 0.22 }); noise({ dur: 0.07, gain: 0.16, f0: 1800, f1: 400, q: 1 }); },
  xarxa: () => { tone({ f0: 520, f1: 760, type: 'square', dur: 0.14, gain: 0.1 }); noise({ dur: 0.14, gain: 0.08, f0: 3000, f1: 1200, q: 8 }); },
  incineradora: () => noise({ dur: 0.26, gain: 0.16, f0: 500, f1: 1800, q: 0.7 }),
  ancoratge: () => { tone({ f0: 180, f1: 90, type: 'sine', dur: 0.3, gain: 0.16 }); tone({ f0: 720, type: 'triangle', dur: 0.18, gain: 0.07 }); },
  prisma: () => tone({ f0: 300 + Math.random() * 1500, f1: 200 + Math.random() * 900, type: 'sawtooth', dur: 0.1, gain: 0.12 }),
  criogenica: () => { tone({ f0: 2200, f1: 300, type: 'sine', dur: 0.26, gain: 0.16 }); noise({ dur: 0.26, gain: 0.1, f0: 5000, f1: 900, q: 2 }); },
  contrast: () => { noise({ dur: 0.3, gain: 0.16, f0: 700, f1: 2400, q: 0.8 }); tone({ f0: 90, f1: 40, type: 'sine', dur: 0.3, gain: 0.18 }); },
  rail: () => { tone({ f0: 3000, f1: 200, type: 'sawtooth', dur: 0.3, gain: 0.18 }); noise({ dur: 0.3, gain: 0.12, f0: 6000, f1: 300, q: 1 }); },
  cupula: () => { tone({ f0: 140, f1: 70, type: 'sine', dur: 0.34, gain: 0.18 }); tone({ f0: 420, type: 'triangle', dur: 0.2, gain: 0.08, at: 0.03 }); },
  supernova: () => { noise({ dur: 0.55, gain: 0.3, f0: 1400, f1: 70, q: 0.6, type: 'lowpass' }); tone({ f0: 140, f1: 32, type: 'sine', dur: 0.6, gain: 0.32 }); },
  amalgama: () => { tone({ f0: 700, f1: 260, type: 'sawtooth', dur: 0.12, gain: 0.14 }); noise({ dur: 0.1, gain: 0.08, f0: 2000, q: 2 }); },
};

const FX = {
  click: () => tone({ f0: 660, f1: 880, type: 'triangle', dur: 0.05, gain: 0.12 }),
  build: () => { noise({ dur: 0.1, gain: 0.2, f0: 260, f1: 110, q: 1.5, type: 'lowpass' }); tone({ f0: 180, f1: 520, type: 'square', dur: 0.16, gain: 0.14, at: 0.03 }); },
  move: () => noise({ dur: 0.22, gain: 0.13, f0: 450, f1: 2000, q: 1.2 }),
  recycle: () => tone({ f0: 620, f1: 130, type: 'sawtooth', dur: 0.26, gain: 0.14 }),
  error: () => { tone({ f0: 150, type: 'square', dur: 0.1, gain: 0.14 }); tone({ f0: 112, type: 'square', dur: 0.14, gain: 0.12, at: 0.09 }); },
  overload: () => { tone({ f0: 70, f1: 220, type: 'sawtooth', dur: 0.4, gain: 0.2 }); noise({ dur: 0.35, gain: 0.1, f0: 900, f1: 3500, q: 1 }); },

  mutate: () => { chord([523.25, 659.25, 783.99, 1046.5], { dur: 0.55, gain: 0.13, spread: 0.07 }); noise({ dur: 0.5, gain: 0.07, f0: 1200, f1: 5200, q: 1.5 }); },
  fuse: () => { chord([392, 523.25, 659.25, 987.77, 1318.5], { dur: 0.8, gain: 0.14, type: 'sawtooth', spread: 0.06 }); tone({ f0: 98, f1: 196, type: 'sine', dur: 0.8, gain: 0.22 }); },

  kill: () => { noise({ dur: 0.08, gain: 0.1, f0: 1500 + Math.random() * 900, q: 2 }); tone({ f0: 420 + Math.random() * 220, f1: 120, type: 'triangle', dur: 0.09, gain: 0.07 }); },
  killBig: () => { noise({ dur: 0.35, gain: 0.26, f0: 900, f1: 80, q: 0.7, type: 'lowpass' }); tone({ f0: 110, f1: 30, type: 'sine', dur: 0.45, gain: 0.28 }); },
  leak: () => { tone({ f0: 180, f1: 60, type: 'sawtooth', dur: 0.45, gain: 0.3 }); noise({ dur: 0.3, gain: 0.18, f0: 400, f1: 80, q: 1, type: 'lowpass' }); tone({ f0: 1200, f1: 400, type: 'square', dur: 0.12, gain: 0.08 }); },
  hack: () => { tone({ f0: 1400, f1: 300, type: 'square', dur: 0.14, gain: 0.1 }); noise({ dur: 0.2, gain: 0.1, f0: 3200, f1: 700, q: 9 }); },
  spawnBoss: () => { tone({ f0: 58, f1: 44, type: 'sawtooth', dur: 1.6, gain: 0.34 }); tone({ f0: 87, type: 'triangle', dur: 1.4, gain: 0.16, at: 0.1 }); noise({ dur: 1.2, gain: 0.1, f0: 200, f1: 60, q: 1, type: 'lowpass' }); },

  waveStart: () => { tone({ f0: 300, f1: 620, type: 'sawtooth', dur: 0.5, gain: 0.16 }); tone({ f0: 150, f1: 310, type: 'square', dur: 0.5, gain: 0.1, at: 0.05 }); },
  waveClear: () => chord([523.25, 659.25, 783.99], { dur: 0.6, gain: 0.15, spread: 0.09 }),
  event: () => { tone({ f0: 880, type: 'triangle', dur: 0.1, gain: 0.1 }); tone({ f0: 1174, type: 'triangle', dur: 0.14, gain: 0.09, at: 0.1 }); },
  victory: () => chord([392, 523.25, 659.25, 783.99, 1046.5, 1318.5], { dur: 1.4, gain: 0.16, spread: 0.12 }),
  defeat: () => { tone({ f0: 220, f1: 55, type: 'sawtooth', dur: 1.8, gain: 0.26 }); tone({ f0: 164, f1: 41, type: 'sine', dur: 2.0, gain: 0.2, at: 0.15 }); },
};

/** Punt d'entrada únic per als efectes. Els trets accepten `shot:<clau de torre>`. */
export function sfx(id) {
  if (!live() || !settings.sfx) return;
  if (id.startsWith('shot:')) {
    const fn = SHOTS[id.slice(5)];
    if (fn) fn();
    return;
  }
  const fn = FX[id];
  if (fn) fn();
}

// ── Música ─────────────────────────────────────────────────
// Cada onada té el seu tema. Tot procedural: ni un sol fitxer d'àudio.
// El que varia és l'arrel, la progressió d'acords, el timbre del pad, el ritme
// del canvi d'acord, l'arpegi, l'oscil·lació del filtre i la percussió.
//
// Els acords són desplaçaments en semitons respecte de l'arrel del tema, i
// l'arrel és un desplaçament respecte de La1 (55 Hz).

const A1 = 55;
const semi = (n) => A1 * Math.pow(2, n / 12);

// Repartiment del trio del pad. Sense això les tres veus queden dins d'una
// octava de 55 Hz i l'acord es percep com un bordoneig, no com a música.
const PAD_OCT = [12, 24, 31];

const THEMES = [
  { // 1 · Sondeig — la calma abans de res
    root: 0, chordMs: 8000, types: ['sawtooth', 'sawtooth', 'triangle'], detune: 6,
    cut: { planning: 480, invasion: 1250 }, wobble: 0,
    chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    arp: null, kick: { f0: 68, f1: 34, gain: 0.22 }, hat: 1, drone: null,
  },
  { // 2 · Cursa — entra un arpegi curt i el compàs s'accelera
    root: 0, chordMs: 5500, types: ['sawtooth', 'sawtooth', 'triangle'], detune: 8,
    cut: { planning: 520, invasion: 1500 }, wobble: 0,
    chords: [[0, 3, 7], [5, 8, 12], [-2, 2, 5], [3, 7, 10]],
    arp: { notes: [0, 3, 7, 12, 7, 3], ms: 190, type: 'square', gain: 0.045, oct: 2 },
    kick: { f0: 70, f1: 35, gain: 0.24 }, hat: 2, drone: null,
  },
  { // 3 · Xapa — metàl·lic i més greu
    root: -2, chordMs: 6500, types: ['square', 'sawtooth', 'sawtooth'], detune: 11,
    cut: { planning: 440, invasion: 1200 }, wobble: 0.1,
    chords: [[0, 3, 7], [-3, 0, 5], [2, 5, 9], [0, 3, 7]],
    arp: { notes: [0, 7, 3, 10], ms: 260, type: 'square', gain: 0.05, oct: 1 },
    kick: { f0: 60, f1: 30, gain: 0.27 }, hat: 1, drone: null,
  },
  { // 4 · Formació — marxa regular
    root: -3, chordMs: 4000, types: ['sawtooth', 'square', 'triangle'], detune: 9,
    cut: { planning: 500, invasion: 1450 }, wobble: 0,
    chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]],
    arp: { notes: [0, 0, 7, 0, 3, 0], ms: 175, type: 'square', gain: 0.05, oct: 2 },
    kick: { f0: 64, f1: 32, gain: 0.29 }, hat: 2, drone: null,
  },
  { // 5 · Cel Obert — s'obre cap amunt, aire i brillantor
    root: 2, chordMs: 6000, types: ['triangle', 'sawtooth', 'triangle'], detune: 5,
    cut: { planning: 700, invasion: 2100 }, wobble: 0.08,
    chords: [[0, 4, 7], [-3, 2, 7], [5, 9, 12], [0, 4, 11]],
    arp: { notes: [0, 4, 7, 11, 12, 11, 7, 4], ms: 145, type: 'triangle', gain: 0.04, oct: 3 },
    kick: { f0: 72, f1: 36, gain: 0.22 }, hat: 1, drone: null,
  },
  { // 6 · Mitosi — disminuïts: res no acaba de resoldre
    root: -1, chordMs: 4500, types: ['sawtooth', 'square', 'sawtooth'], detune: 14,
    cut: { planning: 520, invasion: 1600 }, wobble: 0.3,
    chords: [[0, 3, 6], [2, 5, 8], [-1, 2, 5], [4, 7, 10]],
    arp: { notes: [0, 6, 3, 9, 6, 0], ms: 160, type: 'square', gain: 0.05, oct: 2 },
    kick: { f0: 62, f1: 31, gain: 0.28 }, hat: 2, drone: null,
  },
  { // 7 · Distorsió — frigi i molt desafinat; el filtre respira
    root: -5, chordMs: 5000, types: ['sawtooth', 'sawtooth', 'sawtooth'], detune: 24,
    cut: { planning: 460, invasion: 1350 }, wobble: 0.6,
    chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 6]],
    arp: { notes: [0, 1, 5, 8, 5, 1], ms: 170, type: 'sawtooth', gain: 0.045, oct: 2 },
    kick: { f0: 58, f1: 29, gain: 0.29 }, hat: 1, drone: -12,
  },
  { // 8 · Ariet — empenta constant, acords curts
    root: -7, chordMs: 3500, types: ['square', 'sawtooth', 'square'], detune: 12,
    cut: { planning: 480, invasion: 1550 }, wobble: 0.15,
    chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-5, 0, 3]],
    arp: { notes: [0, 0, 3, 0, 7, 0, 3, 0], ms: 150, type: 'square', gain: 0.055, oct: 1 },
    kick: { f0: 56, f1: 28, gain: 0.33 }, hat: 2, drone: -12,
  },
  { // 9 · Eixam — dens i nerviós
    root: -4, chordMs: 3000, types: ['sawtooth', 'square', 'sawtooth'], detune: 18,
    cut: { planning: 560, invasion: 1800 }, wobble: 0.35,
    chords: [[0, 3, 7], [1, 4, 8], [-1, 3, 6], [2, 5, 9]],
    arp: { notes: [0, 3, 7, 10, 12, 10, 7, 3], ms: 110, type: 'square', gain: 0.05, oct: 2 },
    kick: { f0: 60, f1: 30, gain: 0.3 }, hat: 2, drone: -12,
  },
  { // 10 · El Colòs — menor harmònica, drone subgreu, tot pesa
    root: -5, chordMs: 4500, types: ['sawtooth', 'sawtooth', 'square'], detune: 16,
    cut: { planning: 420, invasion: 1500 }, wobble: 0.25,
    chords: [[0, 3, 7], [0, 3, 8], [-1, 3, 7], [0, 4, 7]],
    arp: { notes: [0, 3, 7, 11, 12, 11, 7, 3], ms: 130, type: 'sawtooth', gain: 0.055, oct: 2 },
    kick: { f0: 50, f1: 25, gain: 0.36 }, hat: 2, drone: -24,
  },
];

export const themeCount = THEMES.length;

let pad = null;
let droneVoice = null;
let lfo = null, lfoGain = null;
let progStep = 0;
let progTimer = 0;
let arpTimer = 0;
let arpStep = 0;
let theme = THEMES[0];
let themeIdx = -1;
let pendingMode = null;
let pendingWave = 0;
let mode = null;

/**
 * @param next  'planning' o 'invasion'
 * @param wave  index d'onada (0-9): tria el tema.
 */
export function startMusic(next, wave = pendingWave) {
  pendingMode = next;
  pendingWave = wave;
  if (!live() || !settings.music) return;
  mode = next;

  const idx = Math.max(0, Math.min(THEMES.length - 1, wave));
  const changed = idx !== themeIdx;
  themeIdx = idx;
  theme = THEMES[idx];

  if (!pad) buildPad();
  if (changed) applyTheme();

  // l'arpegi es exclusiu de la invasio: la planificacio ha de deixar pensar
  if (next === 'invasion' && theme.arp) startArp();
  else stopArp();

  const cut = (theme.cut[next] || theme.cut.planning) * (next === 'invasion' ? 1.35 : 1.7);
  musicFilter.frequency.setTargetAtTime(cut, ac.currentTime, 1.2);
  if (lfoGain) lfoGain.gain.setTargetAtTime(theme.wobble * cut * 0.4, ac.currentTime, 1.0);
  musicBus.gain.setTargetAtTime(next === 'invasion' ? 0.5 : 0.42, ac.currentTime, 1.0);
}

function buildPad() {
  pad = [0, 1, 2].map((i) => {
    const o = ac.createOscillator();
    o.type = theme.types[i];
    o.frequency.value = semi(theme.root + theme.chords[0][i] + PAD_OCT[i]);
    o.detune.value = (i - 1) * theme.detune;
    const gn = ac.createGain();
    gn.gain.value = i === 0 ? 0.13 : i === 1 ? 0.11 : 0.075;
    o.connect(gn).connect(musicFilter);
    o.start();
    return { o, gn };
  });

  lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.22;
  lfoGain = ac.createGain();
  lfoGain.gain.value = 0;
  lfo.connect(lfoGain).connect(musicFilter.frequency);
  lfo.start();

  progStep = 0;
  progTimer = setInterval(advance, theme.chordMs);
}

/** Aplica timbre, arrel i cadencia del tema actual al pad que ja sona. */
function applyTheme() {
  const t = ac.currentTime;
  pad.forEach((v, i) => {
    v.o.type = theme.types[i];
    v.o.detune.setTargetAtTime((i - 1) * theme.detune, t, 0.5);
  });
  if (droneVoice) {
    droneVoice.gn.gain.setTargetAtTime(0.0001, t, 0.4);
    try { droneVoice.o.stop(t + 1.5); } catch { /* ja aturat */ }
    droneVoice = null;
  }
  if (theme.drone != null) {
    const o = ac.createOscillator();
    o.type = 'sine';
    // Just una octava sota el baix del pad. Amb els desplaçaments originals
    // tots els drones queien per sota de 20 Hz: allò no era una nota, era vibració
    // que es menjava la música sencera.
    o.frequency.value = Math.max(45, semi(theme.root + PAD_OCT[0] - 12));
    const gn = ac.createGain();
    gn.gain.value = 0.0001;
    o.connect(gn).connect(percBus);
    o.start();
    gn.gain.setTargetAtTime(0.03, t, 1.5);
    droneVoice = { o, gn };
  }
  if (progTimer) clearInterval(progTimer);
  progStep = 0;
  advance();
  progTimer = setInterval(advance, theme.chordMs);
}

function advance() {
  if (!pad || !live()) return;
  const chord = theme.chords[progStep % theme.chords.length];
  progStep++;
  pad.forEach((v, i) => {
    v.o.frequency.setTargetAtTime(semi(theme.root + chord[i] + PAD_OCT[i]), ac.currentTime, 1.4);
  });
}

function startArp() {
  stopArp();
  arpStep = 0;
  arpTimer = setInterval(() => {
    if (!live() || !settings.music || mode !== 'invasion' || !theme.arp) return;
    const a = theme.arp;
    const chord = theme.chords[(progStep - 1 + theme.chords.length) % theme.chords.length];
    const n = a.notes[arpStep % a.notes.length];
    arpStep++;
    tone({
      f0: semi(theme.root + chord[0] + n + a.oct * 12),
      type: a.type, dur: (a.ms / 1000) * 0.9, gain: a.gain * 1.6, attack: 0.004, bus: padBus,
    });
  }, theme.arp.ms);
}

function stopArp() {
  if (arpTimer) { clearInterval(arpTimer); arpTimer = 0; }
}

export function stopMusic() {
  mode = null;
  if (progTimer) { clearInterval(progTimer); progTimer = 0; }
  stopArp();
  const t = ac ? ac.currentTime : 0;
  if (droneVoice) {
    droneVoice.gn.gain.setTargetAtTime(0.0001, t, 0.3);
    try { droneVoice.o.stop(t + 1.2); } catch { /* ja aturat */ }
    droneVoice = null;
  }
  if (lfo) {
    try { lfo.stop(t + 1.2); } catch { /* ja aturat */ }
    lfo = null; lfoGain = null;
  }
  if (!pad) return;
  pad.forEach((v) => {
    v.gn.gain.setTargetAtTime(0.0001, t, 0.3);
    try { v.o.stop(t + 1.2); } catch { /* ja aturat */ }
  });
  pad = null;
  themeIdx = -1;
}

/** Pols ritmic lligat als tics de la invasio: lliga el so al ritme per torns. */
export function tickPulse(beat) {
  if (!live() || !settings.music || mode !== 'invasion') return;
  const k = theme.kick;

  // Cos: el subgreu, que es nota més que no pas se sent.
  tone({ f0: k.f0, f1: k.f1, type: 'sine', dur: 0.12, gain: k.gain, bus: percBus });

  // Atac: un clic a la zona mitjana. Sense això el pols es perd en qualsevol
  // altaveu que no baixi als 50 Hz — és a dir, en gairebé tots els portàtils
  // i mòbils. La freqüència surt del propi tema, així que el timbre del bombo
  // també canvia d'onada en onada.
  const click = k.gain * 0.8;
  tone({ f0: k.f0 * 6, f1: k.f0 * 1.8, type: 'triangle', dur: 0.05, gain: click, bus: clickBus });
  noise({ dur: 0.025, gain: click * 0.5, f0: 1700, q: 1.2, bus: clickBus });

  if (theme.hat === 2 || (theme.hat === 1 && beat % 2 === 1)) {
    noise({ dur: 0.045, gain: 0.06, f0: 7000, q: 1, bus: clickBus });
  }
}
