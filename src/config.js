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
/** Millores de nivell: el sumider on va la ferralla sobrant del final de partida. */
export const UPGRADE = {
  maxLevel: 3,
  energy: 2,
  dmgPerLevel: 0.30,        // +30% de dany acumulatiu per nivell
  rangePerLevel: 0.25,
  // puja amb el nivell i amb el tier: reforçar una fusió costa més que una base
  scrap: (tier, lvl) => Math.round(28 * lvl * (1 + (tier - 1) * 0.45)),
};

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
  // N'hi ha una per a cadascuna de les 21 parelles possibles de mutacions.
  // Les del mateix tipus amplifiquen la identitat; les mixtes la combinen.

  // Pures (mutació + la mateixa mutació)
  zeroabsolut: {
    tier: 3, dmg: 20, range: 4.0, cd: 1,
    splash: 2.0, slow: 0.25, slowTicks: 3, air: true,
    color: '#a8f4ff', accent: '#ffffff',
  },
  gauss: {
    tier: 3, dmg: 70, range: 5.2, cd: 3,
    pierce: true, air: true, color: '#ff4060', accent: '#ffd0d8',
  },
  malla: {
    tier: 3, dmg: 14, range: 4.2, cd: 1,
    allTargets: true, root: 2, airPriority: true, air: true,
    color: '#3fffc8', accent: '#d9fff4',
  },
  forn: {
    tier: 3, dmg: 20, range: 3.0, cd: 1,
    splash: 2.0, burn: 10, burnTicks: 4, noSplit: true, air: false,
    color: '#ff6a00', accent: '#ffd9a8',
  },
  pilar: {
    tier: 3, dmg: 18, range: 5.0, cd: 2,
    aura: 1.6, eventImmune: true, air: true,
    color: '#fff0a0', accent: '#ffffff',
  },
  caleidoscopi: {
    tier: 3, dmg: 28, dmgVar: 26, range: 3.4, cd: 1,
    stunChance: 0.35, chain: 3, chainRange: 2.2, air: true,
    color: '#ff8ae8', accent: '#ffe6fa',
  },

  // Mixtes
  criogenica: {
    tier: 3, dmg: 38, range: 4.0, cd: 1,
    slow: 0.35, slowTicks: 3, pierce: true, air: true,
    color: '#9ae9ff', accent: '#ffffff',
  },
  gebre: {
    tier: 3, dmg: 16, range: 3.8, cd: 1,
    splash: 1.6, slow: 0.4, slowTicks: 3, root: 1, air: true,
    color: '#7fd8ff', accent: '#eaf9ff',
  },
  contrast: {
    tier: 3, dmg: 24, range: 3.6, cd: 1,
    splash: 1.8, burn: 6, burnTicks: 3, slow: 0.6, slowTicks: 2,
    bonusVsSlowed: 2, air: true, color: '#ffb36e', accent: '#fff0d8',
  },
  glacera: {
    tier: 3, dmg: 22, range: 4.4, cd: 2,
    slow: 0.45, slowTicks: 3, aura: 0.8, eventImmune: true, air: true,
    color: '#cfe9ff', accent: '#ffffff',
  },
  fractal: {
    tier: 3, dmg: 22, dmgVar: 16, range: 3.4, cd: 1,
    chain: 3, chainRange: 2.0, slow: 0.5, slowTicks: 2, air: true,
    color: '#b9c8ff', accent: '#f0f4ff',
  },
  rail: {
    tier: 3, dmg: 34, range: 5.0, cd: 2,
    line: true, pierce: true, air: true, color: '#8ef0ff', accent: '#ffffff',
  },
  termolanca: {
    tier: 3, dmg: 40, range: 3.6, cd: 2,
    pierce: true, burn: 9, burnTicks: 3, noSplit: true, air: true,
    color: '#ff8340', accent: '#ffe0c0',
  },
  setge: {
    tier: 3, dmg: 46, range: 5.4, cd: 3, minRange: 1.6,
    pierce: true, aura: 0.6, eventImmune: true, air: false,
    color: '#ffc46b', accent: '#fff2d4',
  },
  quantic: {
    tier: 3, dmg: 34, dmgVar: 18, range: 3.8, cd: 2,
    pierce: true, stunChance: 0.3, air: true,
    color: '#ff7ab0', accent: '#ffe0ee',
  },
  xarxaigni: {
    tier: 3, dmg: 15, range: 3.6, cd: 1,
    root: 2, burn: 7, burnTicks: 3, splash: 1.3, airPriority: true, air: true,
    color: '#7cffa0', accent: '#e4ffe c'.replace(' ', ''),
  },
  cupula: {
    tier: 3, dmg: 16, range: 3.4, cd: 1,
    allTargets: true, root: 1, air: true, color: '#c9a7ff', accent: '#f0e6ff',
  },
  interferidor: {
    tier: 3, dmg: 18, range: 3.6, cd: 1,
    chain: 3, chainRange: 2.4, stunChance: 0.4, root: 1, air: true,
    color: '#9fffe0', accent: '#e6fff8',
  },
  pira: {
    tier: 3, dmg: 20, range: 4.0, cd: 1,
    splash: 1.8, burn: 8, burnTicks: 4, aura: 0.7, eventImmune: true, air: false,
    color: '#ffa63d', accent: '#ffe7c4',
  },
  supernova: {
    tier: 3, dmg: 62, range: 4.2, cd: 3,
    splash: 2.4, burn: 8, burnTicks: 3, air: true,
    color: '#ff7ad1', accent: '#fff0fb',
  },
  singularitat: {
    tier: 3, dmg: 22, range: 3.8, cd: 1,
    allTargets: true, root: 1, stunChance: 0.25, aura: 0.9, eventImmune: true, air: true,
    color: '#d8b4ff', accent: '#f6ecff',
  },

  // Xarxa de seguretat: cap parella hi hauria d'arribar, però si algun dia
  // s'afegeix una mutació sense omplir la taula, el joc no es trenca.
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

// Taula de fusions: les 21 parelles possibles de mutacions, cadascuna amb
// resultat propi. 6 pures (mutació amb ella mateixa) + 15 mixtes.
export const FUSIONS = [
  // pures
  { a: 'gel', b: 'gel', r: 'zeroabsolut' },
  { a: 'perforador', b: 'perforador', r: 'gauss' },
  { a: 'xarxa', b: 'xarxa', r: 'malla' },
  { a: 'incineradora', b: 'incineradora', r: 'forn' },
  { a: 'ancoratge', b: 'ancoratge', r: 'pilar' },
  { a: 'prisma', b: 'prisma', r: 'caleidoscopi' },
  // gel
  { a: 'gel', b: 'perforador', r: 'criogenica' },
  { a: 'gel', b: 'xarxa', r: 'gebre' },
  { a: 'gel', b: 'incineradora', r: 'contrast' },
  { a: 'gel', b: 'ancoratge', r: 'glacera' },
  { a: 'gel', b: 'prisma', r: 'fractal' },
  // perforador
  { a: 'perforador', b: 'xarxa', r: 'rail' },
  { a: 'perforador', b: 'incineradora', r: 'termolanca' },
  { a: 'perforador', b: 'ancoratge', r: 'setge' },
  { a: 'perforador', b: 'prisma', r: 'quantic' },
  // xarxa
  { a: 'xarxa', b: 'incineradora', r: 'xarxaigni' },
  { a: 'xarxa', b: 'ancoratge', r: 'cupula' },
  { a: 'xarxa', b: 'prisma', r: 'interferidor' },
  // incineradora
  { a: 'incineradora', b: 'ancoratge', r: 'pira' },
  { a: 'incineradora', b: 'prisma', r: 'supernova' },
  // ancoratge
  { a: 'ancoratge', b: 'prisma', r: 'singularitat' },
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
