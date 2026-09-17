// Serialització de la partida per al desat al núvol de Playables.
// Es desa només als límits de fase (començament de cada planificació i final de
// partida): és un punt de represa honest i evita haver de congelar enemics a mig vol.
import { GRID_W, GRID_H, EVENTS, TOWERS } from './config.js';
import { mulberry32, coreRect, idx } from './grid.js';
import { recomputeField, setNextId } from './game.js';

export const SAVE_VERSION = 1;

export function serialize(g, extra = {}) {
  const towers = [...g.towers.values()];
  const index = new Map(towers.map((t, i) => [t.id, i]));
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: g.seed,
    rng: g.rng.state,
    terrain: g.cells.map((c) => (c.t === 'rock' ? 1 : 0)).join(''),
    spawns: g.spawns.map((s) => [s.x, s.y]),
    core: g.coreHp,
    coreMax: g.coreMax,
    energy: g.energy,
    maxEnergy: g.maxEnergy,
    scrap: g.scrap,
    wave: g.wave,
    endless: g.endless,
    overloadUsed: g.overloadUsed,
    fog: g.modifiers.fog,
    grounded: g.modifiers.grounded,
    disabled: [...g.modifiers.disabled].map((id) => index.get(id)).filter((i) => i != null),
    eventId: g.pendingEvent ? g.pendingEvent.id : null,
    towers: towers.map((t) => [t.key, t.x, t.y, t.totalKills, t.kills, t.lvl || 1]),
    stats: g.stats,
    ...extra,
  });
}

/**
 * Reconstrueix una partida a partir d'un desat. Torna null si el contingut no és
 * utilitzable: mai no ha de petar amb desats de versions anteriors del joc.
 */
export function restore(raw) {
  let d;
  try {
    d = JSON.parse(raw);
  } catch { return null; }
  if (!d || typeof d !== 'object') return null;

  try {
    if (!Number.isFinite(d.seed) || !Number.isFinite(d.wave)) return null;
    if (d.wave < 0) return null;
    if (typeof d.terrain !== 'string' || d.terrain.length !== GRID_W * GRID_H) return null;

    const rng = mulberry32(d.seed);
    if (Number.isFinite(d.rng)) rng.state = d.rng;

    const cells = new Array(GRID_W * GRID_H);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = { t: d.terrain[i] === '1' ? 'rock' : 'open', tower: null };
    }

    const spawns = Array.isArray(d.spawns) && d.spawns.length
      ? d.spawns.map(([x, y]) => ({ x, y }))
      : [{ x: 0, y: 2 }, { x: 0, y: GRID_H - 3 }];

    const g = {
      seed: d.seed >>> 0,
      rng,
      cells,
      core: coreRect(),
      spawns,
      coreHp: num(d.core, 20),
      coreMax: num(d.coreMax, 20),
      energy: num(d.energy, 8),
      maxEnergy: num(d.maxEnergy, 8),
      scrap: num(d.scrap, 0),
      towers: new Map(),
      enemies: [],
      wave: d.wave,
      endless: !!d.endless,
      phase: 'planning',
      tick: 0,
      queue: [],
      field: null,
      modifiers: {
        fog: num(d.fog, 0),
        grounded: !!d.grounded,
        disabled: new Set(),
      },
      pendingEvent: EVENTS.find((e) => e.id === d.eventId) || null,
      overloadUsed: !!d.overloadUsed,
      log: [],
      fx: { shots: [], hits: [], floats: [], shakes: 0, sounds: [] },
      stats: {
        kills: num(d.stats?.kills, 0),
        leaked: num(d.stats?.leaked, 0),
        mutations: num(d.stats?.mutations, 0),
        fusions: num(d.stats?.fusions, 0),
        built: num(d.stats?.built, 0),
        upgrades: num(d.stats?.upgrades, 0),
      },
    };

    let id = 1;
    const byIndex = [];
    for (const row of Array.isArray(d.towers) ? d.towers : []) {
      const [key, x, y, totalKills, kills, lvl] = row;
      if (!TOWERS[key]) continue;                       // torre d'una versió futura: s'ignora
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
      if (cells[idx(x, y)].tower != null) continue;
      const t = {
        id: id++, key, x, y, cd: 0,
        kills: sanitizeKills(kills),
        totalKills: num(totalKills, 0),
        lvl: Math.min(3, Math.max(1, Number.isFinite(lvl) ? lvl : 1)),
        disabled: 0, angle: 0, flash: 0, recoil: 0, spawnAnim: 0, born: d.wave,
      };
      g.towers.set(t.id, t);
      cells[idx(x, y)].tower = t.id;
      byIndex.push(t);
    }
    setNextId(id);

    for (const i of Array.isArray(d.disabled) ? d.disabled : []) {
      if (byIndex[i]) g.modifiers.disabled.add(byIndex[i].id);
    }

    g.field = recomputeField(g);
    return { game: g, best: num(d.best, 0), done: !!d.done };
  } catch {
    return null;
  }
}

/** Llegeix només les metadades del desat, per decidir si oferim continuar. */
export function peek(raw) {
  try {
    const d = JSON.parse(raw);
    if (!d || !Number.isFinite(d.wave)) return null;
    return { wave: d.wave, best: num(d.best, 0), done: !!d.done, v: d.v };
  } catch { return null; }
}

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function sanitizeKills(k) {
  const out = {};
  if (k && typeof k === 'object') {
    for (const [cat, n] of Object.entries(k)) if (Number.isFinite(n) && n > 0) out[cat] = n;
  }
  return out;
}
