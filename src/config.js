// Fortalesa Mutant — dades de joc (torres, enemics, onades, esdeveniments).
// Aquí NO hi ha cap text visible: els noms i descripcions viuen a i18n.js,
// indexats per aquestes mateixes claus.

export const GRID_W = 18;
export const GRID_H = 12;
export const CELL = 46;           // mida lògica de casella en px
export const TICK_MS = 430;       // durada d'un tic d'invasió a velocitat 1x

export const START = {
  scrap: 95,
  core: 20,
  energy: 8,
  maxEnergy: 8,
};

// Cost en energia de les accions de planificació
export const COST = {
  build: 1,
  move: 2,
  transform: 3,
  mutate: 4,
  fuse: 5,
  recycle: 0,
  overload: 0,          // costa 1 de nucli, no energia
};
export const TRANSFORM_SCRAP = 12;
export const FUSE_SCRAP = 45;
export const EMERGENCY_MULT = 2;  // accions durant la invasió costen el doble
export const MUTATE_KILLS = 7;    // baixes necessàries per poder mutar
                                  // (pujat de 6 en afegir l'elecció: triar és poder)

// ─────────────────────────────────────────────────────────────
// TORRES
// tier 1 = base · tier 2 = mutació · tier 3 = fusió
// range en caselles (euclidià) · cd = tics entre trets
// ─────────────────────────────────────────────────────────────
export const TOWERS = {
  pulsar: {
    tier: 1, cost: 22, dmg: 8, range: 2.6, cd: 1,
    air: true, color: '#3ad6ff', accent: '#bff4ff',
  },
  morter: {
    tier: 1, cost: 38, dmg: 15, range: 3.6, minRange: 1.4, cd: 2,
    splash: 1.25, air: false, color: '#ff9f2e', accent: '#ffe0a8',
  },
  arc: {
    tier: 1, cost: 32, dmg: 6, range: 2.6, cd: 1,
    chain: 3, chainRange: 2.2, air: true, color: '#b48bff', accent: '#e6d8ff',
  },
  bastio: {
    tier: 1, cost: 14, dmg: 5, range: 1.45, cd: 1,
    air: false, allTargets: true, color: '#f0c247', accent: '#fff1c2',
  },

  // ── Mutacions (tier 2) ──
  gel: {
    tier: 2, cost: 0, dmg: 7, range: 3.2, cd: 1,
    splash: 1.2, slow: 0.5, slowTicks: 2, air: true,
    color: '#7fe3ff', accent: '#e8fbff', from: 'fast',
  },
  perforador: {
    tier: 2, cost: 0, dmg: 28, range: 3.2, cd: 2,
    pierce: true, air: true,
    color: '#ff5b6e', accent: '#ffd3d8', from: 'armor',
  },
  xarxa: {
    tier: 2, cost: 0, dmg: 11, range: 3.6, cd: 1,
    root: 2, airPriority: true, air: true, groundMult: 0.5,
    color: '#4ff0b6', accent: '#d6fff1', from: 'air',
  },
  incineradora: {
    tier: 2, cost: 0, dmg: 11, range: 2.8, cd: 1,
    splash: 1.2, burn: 4, burnTicks: 3, noSplit: true, air: false,
    color: '#ff7a1f', accent: '#ffd9b0', from: 'split',
  },
  ancoratge: {
    tier: 2, cost: 0, dmg: 13, range: 4.2, cd: 2,
    aura: 0.8, eventImmune: true, air: true,
    color: '#ffe98a', accent: '#fffbe6', from: 'shift',
  },
  prisma: {
    tier: 2, cost: 0, dmg: 16, dmgVar: 14, range: 3.0, cd: 1,
    stunChance: 0.2, air: true,
    color: '#ff6ee7', accent: '#ffd9f8', from: 'mixed',
  },

  // ── Fusions (tier 3) ──
  criogenica: {
    tier: 3, dmg: 38, range: 4.0, cd: 1,
    slow: 0.35, slowTicks: 3, pierce: true, air: true,
    color: '#9ae9ff', accent: '#ffffff',
  },
  contrast: {
    tier: 3, dmg: 24, range: 3.6, cd: 1,
    splash: 1.8, burn: 6, burnTicks: 3, slow: 0.6, slowTicks: 2,
    bonusVsSlowed: 2, air: true, color: '#ffb36e', accent: '#fff0d8',
  },
  rail: {
    tier: 3, dmg: 34, range: 5.0, cd: 2,
    line: true, pierce: true, air: true, color: '#8ef0ff', accent: '#ffffff',
  },
  cupula: {
    tier: 3, dmg: 16, range: 3.4, cd: 1,
    allTargets: true, root: 1, air: true, color: '#c9a7ff', accent: '#f0e6ff',
  },
  supernova: {
    tier: 3, dmg: 62, range: 4.2, cd: 3,
    splash: 2.4, burn: 8, burnTicks: 3, air: true,
    color: '#ff7ad1', accent: '#fff0fb',
  },
  amalgama: {
    tier: 3, dmg: 30, range: 3.8, cd: 1,
    splash: 1.3, pierce: true, air: true, color: '#9dffb0', accent: '#e8ffee',
  },
};

// Quina mutació ofereix cada perfil de baixes
export const MUTATION_BY_PROFILE = {
  fast: 'gel',
  armor: 'perforador',
  air: 'xarxa',
  split: 'incineradora',
  shift: 'ancoratge',
  mixed: 'prisma',
  basic: 'prisma',
};

// Taula de fusions (parella no ordenada de tier 2 → tier 3)
export const FUSIONS = [
  { a: 'gel', b: 'perforador', r: 'criogenica' },
  { a: 'gel', b: 'incineradora', r: 'contrast' },
  { a: 'perforador', b: 'xarxa', r: 'rail' },
  { a: 'xarxa', b: 'ancoratge', r: 'cupula' },
  { a: 'incineradora', b: 'prisma', r: 'supernova' },
  { a: 'gel', b: 'xarxa', r: 'cupula' },
  { a: 'perforador', b: 'prisma', r: 'rail' },
  { a: 'ancoratge', b: 'prisma', r: 'supernova' },
  { a: 'incineradora', b: 'perforador', r: 'criogenica' },
  { a: 'gel', b: 'ancoratge', r: 'contrast' },
];

export const BASE_TOWERS = ['pulsar', 'morter', 'arc', 'bastio'];

// ─────────────────────────────────────────────────────────────
// ENEMICS
// speed = caselles per tic · armor = reducció plana de dany
// ─────────────────────────────────────────────────────────────
export const ENEMIES = {
  rastrejador: {
    cat: 'basic', hp: 30, speed: 1, armor: 0, leak: 1, scrap: 5, color: '#5ad0c0',
  },
  corredor: {
    cat: 'fast', hp: 22, speed: 2, armor: 0, leak: 1, scrap: 6, color: '#ffe14d',
  },
  blindat: {
    cat: 'armor', hp: 70, speed: 0.5, armor: 6, leak: 2, scrap: 11, color: '#a8b4c6',
  },
  volador: {
    cat: 'air', hp: 34, speed: 1, armor: 0, leak: 1, scrap: 9,
    flying: true, color: '#ff63c4',
  },
  divisor: {
    cat: 'split', hp: 46, speed: 1, armor: 1, leak: 1, scrap: 8,
    split: { type: 'esquirla', n: 2 }, color: '#7dff5a',
  },
  esquirla: {
    cat: 'split', hp: 16, speed: 1.5, armor: 0, leak: 1, scrap: 3,
    color: '#b6ff8f', small: true,
  },
  alterador: {
    cat: 'shift', hp: 58, speed: 1, armor: 2, leak: 2, scrap: 13,
    shifter: true, color: '#a06bff',
  },
  colos: {
    cat: 'armor', hp: 900, speed: 0.5, armor: 10, leak: 5, scrap: 90,
    boss: true, spawns: { type: 'rastrejador', every: 4, n: 2 }, color: '#ff4444',
  },
};

// ─────────────────────────────────────────────────────────────
// ONADES — 10 onades amb dificultat progressiva
// { t: tic d'entrada, e: tipus, n: quantitat, gap: tics entre unitats }
// Els noms són a i18n.js sota 'wave.1' … 'wave.10'.
// ─────────────────────────────────────────────────────────────
export const WAVES = [
  { hpMul: 1.00, groups: [{ t: 0, e: 'rastrejador', n: 6, gap: 2 }] },
  { hpMul: 1.15, groups: [
    { t: 0, e: 'rastrejador', n: 5, gap: 2 }, { t: 8, e: 'corredor', n: 4, gap: 2 }] },
  { hpMul: 1.35, groups: [
    { t: 0, e: 'corredor', n: 5, gap: 2 }, { t: 5, e: 'blindat', n: 3, gap: 3 }] },
  { hpMul: 1.60, groups: [
    { t: 0, e: 'rastrejador', n: 9, gap: 1 }, { t: 6, e: 'blindat', n: 4, gap: 2 },
    { t: 12, e: 'corredor', n: 6, gap: 1 }] },
  { hpMul: 1.90, groups: [
    { t: 0, e: 'volador', n: 6, gap: 2 }, { t: 5, e: 'rastrejador', n: 10, gap: 1 },
    { t: 12, e: 'volador', n: 5, gap: 2 }] },
  { hpMul: 2.20, groups: [
    { t: 0, e: 'divisor', n: 8, gap: 2 }, { t: 8, e: 'blindat', n: 5, gap: 2 },
    { t: 14, e: 'corredor', n: 8, gap: 1 }] },
  { hpMul: 2.60, groups: [
    { t: 0, e: 'alterador', n: 4, gap: 4 }, { t: 4, e: 'volador', n: 7, gap: 2 },
    { t: 10, e: 'divisor', n: 7, gap: 2 }] },
  { hpMul: 3.10, groups: [
    { t: 0, e: 'blindat', n: 8, gap: 2 }, { t: 6, e: 'corredor', n: 10, gap: 1 },
    { t: 14, e: 'alterador', n: 4, gap: 3 }] },
  { hpMul: 3.70, groups: [
    { t: 0, e: 'volador', n: 10, gap: 1 }, { t: 5, e: 'divisor', n: 9, gap: 2 },
    { t: 12, e: 'blindat', n: 7, gap: 2 }, { t: 18, e: 'alterador', n: 4, gap: 2 }] },
  { hpMul: 4.30, groups: [
    { t: 0, e: 'corredor', n: 10, gap: 1 }, { t: 4, e: 'colos', n: 1, gap: 1 },
    { t: 8, e: 'volador', n: 10, gap: 1 }, { t: 14, e: 'blindat', n: 8, gap: 2 },
    { t: 20, e: 'divisor', n: 8, gap: 1 }] },
];

// ─────────────────────────────────────────────────────────────
// ESDEVENIMENTS entre rondes (textos a i18n.js sota 'event.<id>.*')
// ─────────────────────────────────────────────────────────────
export const EVENTS = [
  { id: 'terratremol', icon: '⛰', bad: true },
  { id: 'boira', icon: '🌫', bad: true },
  { id: 'virus', icon: '☣', bad: true },
  { id: 'bretxa', icon: '🌀', bad: true },
  { id: 'ferralla', icon: '✦', bad: false },
  { id: 'reactor', icon: '⚡', bad: false },
  { id: 'mutagen', icon: '🧬', bad: false },
  { id: 'magnetic', icon: '🧲', bad: false },
  { id: 'reconfig', icon: '🏗', bad: false },
  { id: 'reparacio', icon: '🛡', bad: false },
];
