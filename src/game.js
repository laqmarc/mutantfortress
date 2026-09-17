// Motor de joc: estat, accions de planificació i resolució de la invasió
import {
  GRID_W, GRID_H, START, COST, TRANSFORM_SCRAP, FUSE_SCRAP, EMERGENCY_MULT,
  MUTATE_KILLS, TOWERS, ENEMIES, WAVES, EVENTS, MUTATION_BY_PROFILE, FUSIONS, UPGRADE,
} from './config.js';
import {
  mulberry32, idx, inBounds, coreRect, coreCenter, isCoreCell, generateTerrain,
  defaultSpawns, SCHEDULED_BREACHES, flowField, nextStep, allSpawnsConnected, nearestFree,
  ROUTE_PREFS, randomRoutePref,
} from './grid.js';

let nextId = 1;
const uid = () => nextId++;

export function createGame(seed) {
  nextId = 1;
  const s = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const rng = mulberry32(s);
  const core = coreRect();
  const spawns = defaultSpawns();
  const cells = generateTerrain(rng, core, spawns);

  const g = {
    seed: s,
    rng,
    cells,
    core,
    spawns,
    coreHp: START.core,
    coreMax: START.core,
    energy: START.energy,
    maxEnergy: START.maxEnergy,
    scrap: START.scrap,
    towers: new Map(),
    enemies: [],
    wave: 0,                 // onada completada; la següent és wave+1
    phase: 'intro',          // intro | planning | invasion | victory | defeat
    tick: 0,
    queue: [],
    field: null,
    modifiers: { fog: 0, grounded: false, disabled: new Set() },
    pendingEvent: null,
    overloadUsed: false,
    log: [],
    fx: { shots: [], hits: [], floats: [], shakes: 0, sounds: [] },
    stats: { kills: 0, leaked: 0, mutations: 0, fusions: 0, built: 0, upgrades: 0 },
  };
  g.field = recomputeField(g);
  logMsg(g, 'log.boot', null, 'good');
  return g;
}

/** El registre guarda claus i paràmetres, no text: així canviar d'idioma el retradueix. */
export function logMsg(g, key, params = null, kind = 'info') {
  g.log.unshift({ key, params, kind, wave: g.wave });
  if (g.log.length > 60) g.log.pop();
}

/** Continuïtat d'identificadors en restaurar una partida desada. */
export function setNextId(n) { nextId = n; }

export function recomputeField(g, ghost, ignoreTowerId) {
  return flowField(g.cells, g.core, ghost, ignoreTowerId);
}

export const cellAt = (g, x, y) => g.cells[idx(x, y)];
export const towerAt = (g, x, y) => {
  if (!inBounds(x, y)) return null;
  const id = g.cells[idx(x, y)].tower;
  return id == null ? null : g.towers.get(id);
};

/** Stats efectius d'una torre (base + aura d'Ancoratge − boira). */
export function towerStats(g, t) {
  const def = TOWERS[t.key];
  const st = { ...def };
  let bonus = 0;
  for (const o of g.towers.values()) {
    if (o.id === t.id) continue;
    const od = TOWERS[o.key];
    if (!od.aura) continue;
    if (Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) <= 1) bonus += od.aura;
  }
  // nivell de millora: escala dany i abast
  const lvl = t.lvl || 1;
  const mul = 1 + UPGRADE.dmgPerLevel * (lvl - 1);
  st.lvl = lvl;
  st.dmg = Math.round(def.dmg * mul);
  if (def.dmgVar) st.dmgVar = Math.round(def.dmgVar * mul);
  if (def.burn) st.burn = Math.round(def.burn * mul);

  const fogHit = def.eventImmune ? 0 : g.modifiers.fog;
  st.range = Math.max(1.1, def.range + UPGRADE.rangePerLevel * (lvl - 1) + bonus - fogHit);
  st.rangeBonus = bonus;
  st.fog = fogHit;
  return st;
}

// ─────────────────────────────────────────────────────────────
// ACCIONS DE PLANIFICACIÓ
// ─────────────────────────────────────────────────────────────
const mult = (g) => (g.phase === 'invasion' ? EMERGENCY_MULT : 1);

function fail(msg, params) { return { ok: false, msg, params }; }
function done(msg) { return { ok: true, msg }; }

export function canAfford(g, energy, scrap = 0) {
  return g.energy >= energy * mult(g) && g.scrap >= scrap;
}
function pay(g, energy, scrap = 0) {
  g.energy -= energy * mult(g);
  g.scrap -= scrap;
}

export function buildTower(g, key, x, y) {
  const def = TOWERS[key];
  if (!def || def.tier !== 1) return fail('err.notBuildable');
  if (!inBounds(x, y)) return fail('err.outOfMap');
  const c = cellAt(g, x, y);
  if (c.t === 'rock') return fail('err.rubble');
  if (isCoreCell(g.core, x, y)) return fail('err.onCore');
  if (c.tower != null) return fail('err.hasTower');
  if (g.spawns.some((s) => s.x === x && s.y === y)) return fail('err.isSpawn');
  if (!canAfford(g, COST.build, def.cost)) return fail('err.noResources');
  if (!allSpawnsConnected(g.cells, g.core, g.spawns, { x, y })) return fail('err.wouldSeal');

  pay(g, COST.build, def.cost);
  const t = {
    id: uid(), key, x, y, cd: 0, kills: {}, totalKills: 0,
    lvl: 1, disabled: 0, angle: 0, flash: 0, recoil: 0, spawnAnim: 1, born: g.wave,
  };
  g.towers.set(t.id, t);
  c.tower = t.id;
  g.field = recomputeField(g);
  g.stats.built++;
  logMsg(g, 'log.built', { tower: key, x: x + 1, y: y + 1 }, 'good');
  return { ...done(), tower: t };
}

export function moveTower(g, t, x, y) {
  if (!inBounds(x, y)) return fail('err.outOfMap');
  const dist = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
  if (dist === 0) return fail('err.alreadyThere');
  if (dist > 3) return fail('err.tooFar');
  const c = cellAt(g, x, y);
  if (c.t === 'rock') return fail('err.rubbleTarget');
  if (isCoreCell(g.core, x, y)) return fail('err.onCore');
  if (c.tower != null) return fail('err.occupied');
  if (g.spawns.some((s) => s.x === x && s.y === y)) return fail('err.isSpawn');
  if (!canAfford(g, COST.move)) return fail('err.noEnergy');
  if (!allSpawnsConnected(g.cells, g.core, g.spawns, { x, y }, t.id)) return fail('err.wouldSeal');

  pay(g, COST.move);
  cellAt(g, t.x, t.y).tower = null;
  t.x = x; t.y = y;
  c.tower = t.id;
  g.field = recomputeField(g);
  logMsg(g, 'log.moved', { tower: t.key, x: x + 1, y: y + 1 });
  return done();
}

export function transformTower(g, t, key) {
  if (TOWERS[t.key].tier !== 1) return fail('err.onlyBase');
  if (TOWERS[key].tier !== 1) return fail('err.badTarget');
  if (key === t.key) return fail('err.sameType');
  if (!canAfford(g, COST.transform, TRANSFORM_SCRAP)) return fail('err.noResources');
  pay(g, COST.transform, TRANSFORM_SCRAP);
  const old = t.key;
  t.key = key;
  t.cd = 0;
  logMsg(g, 'log.transformed', { old, new: key });
  return done();
}

/** Categories de víctimes ordenades de més a menys. */
export function killRanking(t) {
  return Object.entries(t.kills)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Perfil de baixes → categoria dominant (≥40% de les víctimes). */
export function killProfile(t) {
  const rank = killRanking(t);
  if (!rank.length) return null;
  const [cat, n] = rank[0];
  if (n / t.totalKills < 0.4) return 'mixed';
  return cat === 'basic' ? 'mixed' : cat;
}

const mutationOf = (cat) => MUTATION_BY_PROFILE[cat === 'basic' ? 'mixed' : cat] || 'prisma';

/**
 * Mutacions entre les quals pot triar la torre: la del perfil dominant i la del
 * segon perfil. Una torre que s'ha alimentat de dues coses dona dues opcions;
 * una d'especialitzada en dona una de sola i garantida. Aquesta és la tensió:
 * col·locar-la on ho mata tot dona flexibilitat, on mata un sol tipus dona certesa.
 */
export function mutationOptions(t) {
  const rank = killRanking(t);
  if (!rank.length) return [];
  const out = [];
  const add = (key) => { if (key && !out.includes(key)) out.push(key); };

  const [topCat, topN] = rank[0];
  if (topN / t.totalKills < 0.4) {
    // dieta massa variada: el caos primer, i la categoria més menjada com a alternativa
    add('prisma');
    add(mutationOf(topCat));
  } else {
    add(mutationOf(topCat));
    if (rank[1]) add(mutationOf(rank[1][0]));
  }
  return out.slice(0, 2);
}

/** Opció per defecte (la dominant), per a quan no hi ha ningú que triï. */
export function mutationFor(t) {
  return mutationOptions(t)[0] || null;
}

export function canMutate(g, t) {
  return TOWERS[t.key].tier === 1 && t.totalKills >= MUTATE_KILLS;
}

/**
 * @param choice  clau de mutació triada pel jugador. Ha de ser una de les que
 *                ofereix mutationOptions(); si s'omet, s'agafa la dominant.
 */
export function mutateTower(g, t, choice = null, free = false) {
  if (!canMutate(g, t)) return fail('err.needKills', { n: MUTATE_KILLS, have: t.totalKills });
  const options = mutationOptions(t);
  if (!options.length) return fail('err.needKills', { n: MUTATE_KILLS, have: t.totalKills });
  const key = choice && options.includes(choice) ? choice : options[0];
  if (!free && !canAfford(g, COST.mutate)) return fail('err.noEnergy');
  if (!free) pay(g, COST.mutate);
  const old = t.key;
  t.key = key;
  t.cd = 0;
  t.flash = 1;
  g.stats.mutations++;
  logMsg(g, 'log.mutated', { old, new: key }, 'mutate');
  return { ...done(), key };
}

export function fusionResult(a, b) {
  const hit = FUSIONS.find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
  return hit ? hit.r : 'amalgama';
}

export function canFusePair(g, a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (TOWERS[a.key].tier !== 2 || TOWERS[b.key].tier !== 2) return false;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
}

export function fuseTowers(g, a, b) {
  if (!canFusePair(g, a, b)) return fail('err.needPair');
  if (!canAfford(g, COST.fuse, FUSE_SCRAP)) return fail('err.noResources');
  pay(g, COST.fuse, FUSE_SCRAP);
  const key = fusionResult(a.key, b.key);
  const from = [a.key, b.key];
  // b desapareix; a es converteix en la fusió i hereta les baixes de tots dos
  cellAt(g, b.x, b.y).tower = null;
  g.towers.delete(b.id);
  for (const [k, v] of Object.entries(b.kills)) a.kills[k] = (a.kills[k] || 0) + v;
  a.totalKills += b.totalKills;
  a.key = key;
  a.lvl = Math.max(a.lvl || 1, b.lvl || 1);   // la fusió conserva el millor reforç
  a.cd = 0;
  a.flash = 1;
  g.field = recomputeField(g);
  g.stats.fusions++;
  logMsg(g, 'log.fused', { a: from[0], b: from[1], new: key }, 'mutate');
  return { ...done(), key };
}

/** Cost en ferralla de pujar del nivell actual al següent. */
export function upgradeCost(t) {
  return UPGRADE.scrap(TOWERS[t.key].tier, t.lvl || 1);
}

export function canUpgrade(g, t) {
  return (t.lvl || 1) < UPGRADE.maxLevel;
}

/**
 * Reforça una torre: +30% de dany i +0,25 d'abast per nivell, fins a 3.
 * És el sumider natural de la ferralla quan ja no queda lloc on construir.
 */
export function upgradeTower(g, t) {
  if (!canUpgrade(g, t)) return fail('err.maxLevel');
  const scrap = upgradeCost(t);
  if (!canAfford(g, UPGRADE.energy, scrap)) return fail('err.noResources');
  pay(g, UPGRADE.energy, scrap);
  t.lvl = (t.lvl || 1) + 1;
  t.flash = 1;
  g.stats.upgrades++;
  logMsg(g, 'log.upgraded', { tower: t.key, n: t.lvl }, 'good');
  return { ...done(), lvl: t.lvl };
}

export function recycleTower(g, t) {
  const def = TOWERS[t.key];
  let invertit = 0;
  for (let l = 1; l < (t.lvl || 1); l++) invertit += UPGRADE.scrap(def.tier, l);
  const refund = Math.round((def.cost || 40) * 0.5) + def.tier * 10 + Math.round(invertit * 0.5);
  cellAt(g, t.x, t.y).tower = null;
  g.towers.delete(t.id);
  g.scrap += refund;
  g.field = recomputeField(g);
  logMsg(g, 'log.recycled', { tower: t.key, n: refund });
  return done();
}

export function overload(g) {
  if (g.overloadUsed) return fail('err.overloadUsed');
  if (g.coreHp <= 1) return fail('err.coreTooWeak');
  g.overloadUsed = true;
  g.coreHp -= 1;
  g.energy += 4;
  logMsg(g, 'log.overload', null, 'warn');
  return done();
}

// ─────────────────────────────────────────────────────────────
// ONADES I ESDEVENIMENTS
// ─────────────────────────────────────────────────────────────
export function rollEvent(g) {
  if (g.wave === 0) return null; // la primera planificació és neta
  const pool = EVENTS.filter((e) => {
    if (e.id === 'mutagen') return [...g.towers.values()].some((t) => canMutate(g, t));
    if (e.id === 'virus' || e.id === 'terratremol') return g.towers.size > 0;
    if (e.id === 'reconfig') return g.cells.some((c) => c.t === 'rock');
    if (e.id === 'reparacio') return g.coreHp < g.coreMax;
    if (e.id === 'bretxa') return g.spawns.length < 5;
    return true;
  });
  return pool[Math.floor(g.rng() * pool.length)] || null;
}

export function applyEvent(g, ev) {
  if (!ev) return;
  switch (ev.id) {
    case 'terratremol': {
      let n = 0;
      for (let tries = 0; tries < 200 && n < 3; tries++) {
        const x = Math.floor(g.rng() * GRID_W), y = Math.floor(g.rng() * GRID_H);
        const c = cellAt(g, x, y);
        if (c.t === 'rock' || isCoreCell(g.core, x, y)) continue;
        if (g.spawns.some((s) => s.x === x && s.y === y)) continue;
        const t = towerAt(g, x, y);
        if (t && TOWERS[t.key].eventImmune) continue;
        if (t) {
          const free = nearestFree(g.cells, g.core, x, y);
          if (!free) continue;
          c.tower = null;
          t.x = free.x; t.y = free.y;
          cellAt(g, free.x, free.y).tower = t.id;
        }
        c.t = 'rock';
        n++;
      }
      // mai no ha de segellar el mapa
      if (!allSpawnsConnected(g.cells, g.core, g.spawns)) {
        for (const c of g.cells) if (c.t === 'rock' && g.rng() < 0.3) c.t = 'open';
      }
      break;
    }
    case 'boira': g.modifiers.fog = 1; break;
    case 'virus': {
      const list = [...g.towers.values()].filter((t) => !TOWERS[t.key].eventImmune);
      if (list.length) {
        const t = list[Math.floor(g.rng() * list.length)];
        g.modifiers.disabled.add(t.id);
        logMsg(g, 'log.virus', { tower: t.key }, 'bad');
      }
      break;
    }
    case 'bretxa': {
      const used = new Set(g.spawns.map((s) => s.y));
      let y = Math.floor(g.rng() * GRID_H);
      for (let i = 0; i < GRID_H && used.has(y); i++) y = (y + 1) % GRID_H;
      const c = cellAt(g, 0, y);
      c.t = 'open';
      if (c.tower != null) { g.towers.delete(c.tower); c.tower = null; }
      g.spawns.push({ x: 0, y });
      break;
    }
    case 'ferralla': g.scrap += 35; break;
    case 'reactor': g.energy += 5; break;
    case 'mutagen': {
      const list = [...g.towers.values()].filter((t) => canMutate(g, t));
      if (list.length) mutateTower(g, list[Math.floor(g.rng() * list.length)], null, true);
      break;
    }
    case 'magnetic': g.modifiers.grounded = true; break;
    case 'reconfig': {
      let n = 0;
      const order = [...g.cells.keys()].sort(() => g.rng() - 0.5);
      for (const i of order) { if (n >= 4) break; if (g.cells[i].t === 'rock') { g.cells[i].t = 'open'; n++; } }
      break;
    }
    case 'reparacio': g.coreHp = Math.min(g.coreMax, g.coreHp + 3); break;
  }
  g.field = recomputeField(g);
  logMsg(g, 'log.event', { event: ev.id }, ev.bad ? 'bad' : 'good');
}

export function startPlanning(g) {
  g.phase = 'planning';
  g.modifiers.fog = 0;
  g.modifiers.grounded = false;
  g.modifiers.disabled.clear();
  g.overloadUsed = false;
  g.maxEnergy = START.maxEnergy + Math.floor(g.wave / 2);
  g.energy = g.maxEnergy;
  for (const t of g.towers.values()) { t.disabled = 0; t.cd = 0; }
  openScheduledBreach(g);
  g.pendingEvent = rollEvent(g);
  if (g.pendingEvent) applyEvent(g, g.pendingEvent);
  logMsg(g, 'log.phasePlanning', { n: g.wave + 1, total: WAVES.length }, 'phase');
}

/** Bretxes programades: el perímetre cedeix a les onades 4 i 7. */
function openScheduledBreach(g) {
  const b = SCHEDULED_BREACHES[g.wave];
  if (!b) return;
  if (g.spawns.some((s) => s.x === b.x && s.y === b.y)) return;
  const c = cellAt(g, b.x, b.y);
  c.t = 'open';
  if (c.tower != null) { g.towers.delete(c.tower); c.tower = null; }
  g.spawns.push({ x: b.x, y: b.y });
  g.field = recomputeField(g);
  logMsg(g, 'log.breach', { n: b.y + 1 }, 'bad');
}

export function startInvasion(g) {
  const w = WAVES[g.wave];
  if (!w) return;
  g.phase = 'invasion';
  g.tick = 0;
  g.queue = [];
  let spawnRot = 0;
  for (const grp of w.groups) {
    for (let i = 0; i < grp.n; i++) {
      g.queue.push({
        t: grp.t + i * grp.gap,
        e: grp.e,
        spawn: g.spawns[spawnRot++ % g.spawns.length],
      });
    }
  }
  g.queue.sort((a, b) => a.t - b.t);
  for (const t of g.towers.values()) if (g.modifiers.disabled.has(t.id)) t.disabled = 999;
  logMsg(g, 'log.phaseInvasion', { n: g.wave + 1, waveIdx: g.wave }, 'phase');
}

// ─────────────────────────────────────────────────────────────
// ENEMICS
// ─────────────────────────────────────────────────────────────
function spawnEnemy(g, type, at, hpMul) {
  const def = ENEMIES[type];
  if (def.boss) g.fx.sounds.push('spawnBoss');
  const hp = Math.round(def.hp * hpMul);
  const e = {
    id: uid(), type, cat: def.cat,
    hp, maxHp: hp,
    x: at.x, y: at.y, px: at.x, py: at.y,
    acc: 0, pref: randomRoutePref(g.rng),
    slow: 0, slowAmt: 1, root: 0, stun: 0, burn: 0, burnDmg: 0,
    shiftCd: 3, spawnCd: def.spawns ? def.spawns.every : 0,
    flash: 0, alive: true,
  };
  g.enemies.push(e);
  return e;
}

function enemyDef(e) { return ENEMIES[e.type]; }
export function isFlying(g, e) { return !!enemyDef(e).flying && !g.modifiers.grounded; }

function damageEnemy(g, e, amount, opts = {}) {
  const def = enemyDef(e);
  let dmg = amount;
  if (!opts.pierce) dmg = Math.max(1, dmg - def.armor);
  if (opts.bonusVsSlowed && e.slow > 0) dmg *= opts.bonusVsSlowed;
  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 1;
  g.fx.floats.push({ x: e.x, y: e.y, text: `${dmg}`, kind: opts.pierce ? 'pierce' : 'dmg', life: 1 });
  if (e.hp <= 0) killEnemy(g, e, opts);
  return dmg;
}

function killEnemy(g, e, opts = {}) {
  if (!e.alive) return;
  e.alive = false;
  const def = enemyDef(e);
  g.scrap += def.scrap;
  g.stats.kills++;
  g.fx.hits.push({ x: e.x, y: e.y, r: def.boss ? 3 : 1, color: def.color, life: 1 });
  g.fx.sounds.push(def.boss || def.armor >= 6 ? 'killBig' : 'kill');

  if (opts.tower) {
    const t = opts.tower;
    t.kills[def.cat] = (t.kills[def.cat] || 0) + 1;
    t.totalKills++;
    if (TOWERS[t.key].tier === 1 && t.totalKills === MUTATE_KILLS) {
      logMsg(g, 'log.mutationReady', { tower: t.key }, 'mutate');
    }
  }
  if (def.split && !opts.noSplit) {
    for (let i = 0; i < def.split.n; i++) {
      const c = spawnEnemy(g, def.split.type, { x: e.x, y: e.y }, 1);
      c.pref = ROUTE_PREFS[(ROUTE_PREFS.indexOf(e.pref) + i + 1) % ROUTE_PREFS.length];
    }
  }
}

function leakEnemy(g, e) {
  const def = enemyDef(e);
  e.alive = false;
  g.coreHp -= def.leak;
  g.stats.leaked++;
  g.fx.shakes = Math.max(g.fx.shakes, def.boss ? 1 : 0.6);
  g.fx.sounds.push('leak');
  g.fx.floats.push({ x: e.x, y: e.y, text: `−${def.leak}`, kind: 'leak', life: 1.4 });
  logMsg(g, 'log.leak', { enemy: e.type, n: def.leak }, 'bad');
}

function moveEnemies(g) {
  const cc = coreCenter(g.core);
  for (const e of g.enemies) {
    if (!e.alive) continue;
    e.px = e.x; e.py = e.y;
    e.path = null;                 // caselles realment trepitjades aquest tic
    if (e.stun > 0 || e.root > 0) continue;

    const def = enemyDef(e);
    const speed = def.speed * (e.slow > 0 ? e.slowAmt : 1);
    e.acc += speed;

    if (isFlying(g, e)) {
      while (e.acc >= 1) {
        e.acc -= 1;
        const dx = cc.x - e.x, dy = cc.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= 0.9) { leakEnemy(g, e); break; }
        e.x += dx / d; e.y += dy / d;
      }
      continue;
    }

    while (e.acc >= 1) {
      e.acc -= 1;
      if (isCoreCell(g.core, Math.round(e.x), Math.round(e.y))) { leakEnemy(g, e); break; }
      const n = nextStep(g.field, Math.round(e.x), Math.round(e.y), e.pref);
      if (!n) break;
      e.x = n.x; e.y = n.y;
      (e.path || (e.path = [])).push({ x: n.x, y: n.y });
      if (isCoreCell(g.core, e.x, e.y)) { leakEnemy(g, e); break; }
    }
  }
}

/** Habilitats especials dels enemics (Alterador, Colòs). */
function enemyAbilities(g) {
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const def = enemyDef(e);

    if (def.shifter) {
      if (--e.shiftCd <= 0) {
        e.shiftCd = 3;
        // obre una bretxa al terreny
        const cands = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = Math.round(e.x) + dx, ny = Math.round(e.y) + dy;
          if (inBounds(nx, ny) && cellAt(g, nx, ny).t === 'rock') cands.push({ x: nx, y: ny });
        }
        if (cands.length) {
          const c = cands[Math.floor(g.rng() * cands.length)];
          cellAt(g, c.x, c.y).t = 'open';
          g.field = recomputeField(g);
          g.fx.hits.push({ x: c.x, y: c.y, r: 1.2, color: def.color, life: 1 });
        }
        // desactiva la torre més propera
        let best = null, bd = 99;
        for (const t of g.towers.values()) {
          if (TOWERS[t.key].eventImmune) continue;
          const d = Math.hypot(t.x - e.x, t.y - e.y);
          if (d < bd && d <= 3.5) { bd = d; best = t; }
        }
        if (best) {
          best.disabled = Math.max(best.disabled, 2);
          g.fx.shots.push({ x1: e.x, y1: e.y, x2: best.x, y2: best.y, color: def.color, life: 1, kind: 'hack' });
          g.fx.sounds.push('hack');
        }
      }
    }

    if (def.spawns && --e.spawnCd <= 0) {
      e.spawnCd = def.spawns.every;
      for (let i = 0; i < def.spawns.n; i++) {
        const c = spawnEnemy(g, def.spawns.type, { x: Math.round(e.x), y: Math.round(e.y) }, 1);
        c.pref = randomRoutePref(g.rng);
      }
      g.fx.hits.push({ x: e.x, y: e.y, r: 1.5, color: '#ff8888', life: 1 });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// TORRES: selecció d'objectius i dany
// ─────────────────────────────────────────────────────────────
function targetsInRange(g, t, st) {
  const out = [];
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const flying = isFlying(g, e);
    if (flying && !st.air) continue;
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if (d > st.range) continue;
    if (st.minRange && d < st.minRange) continue;
    out.push({ e, d, flying });
  }
  if (st.airPriority) out.sort((a, b) => (b.flying - a.flying) || (a.d - b.d));
  else out.sort((a, b) => a.d - b.d);
  return out;
}

function applyStatus(g, e, st) {
  if (st.slow) { e.slow = Math.max(e.slow, st.slowTicks || 2); e.slowAmt = Math.min(e.slowAmt, st.slow); }
  if (st.root && isFlying(g, e)) e.root = Math.max(e.root, st.root);
  else if (st.root && st.allTargets) e.root = Math.max(e.root, st.root);
  if (st.burn) { e.burn = Math.max(e.burn, st.burnTicks || 3); e.burnDmg = Math.max(e.burnDmg, st.burn); }
  if (st.stunChance && g.rng() < st.stunChance) e.stun = Math.max(e.stun, 1);
}

function splashAt(g, t, st, cx, cy, radius, dmg, primary) {
  for (const o of g.enemies) {
    if (!o.alive) continue;
    if (primary && o.id === primary.id) continue;
    if (isFlying(g, o) && !st.air) continue;
    if (Math.hypot(o.x - cx, o.y - cy) > radius) continue;
    damageEnemy(g, o, dmg, { pierce: st.pierce, noSplit: st.noSplit, tower: t, bonusVsSlowed: st.bonusVsSlowed });
    applyStatus(g, o, st);
  }
}

function fireTowers(g) {
  for (const t of g.towers.values()) {
    if (t.disabled > 0) { t.disabled--; continue; }
    if (t.cd > 0) { t.cd--; continue; }
    const st = towerStats(g, t);
    const targets = targetsInRange(g, t, st);
    if (!targets.length) continue;

    t.cd = (st.cd || 1) - 1;
    t.flash = 1;
    t.recoil = 1;
    g.fx.sounds.push(`shot:${t.key}`);
    const prim = targets[0];
    t.angle = Math.atan2(prim.e.y - t.y, prim.e.x - t.x);

    // Bastió / Cúpula: colpegen tot el que hi ha al radi
    if (st.allTargets) {
      for (const { e } of targets) {
        g.fx.shots.push({ x1: t.x, y1: t.y, x2: e.x, y2: e.y, color: st.color, life: 1, kind: 'zap' });
        damageEnemy(g, e, st.dmg, { pierce: st.pierce, noSplit: st.noSplit, tower: t, bonusVsSlowed: st.bonusVsSlowed });
        applyStatus(g, e, st);
      }
      continue;
    }

    // Rail Orbital: línia perforant
    if (st.line) {
      const dx = Math.cos(t.angle), dy = Math.sin(t.angle);
      g.fx.shots.push({ x1: t.x, y1: t.y, x2: t.x + dx * st.range, y2: t.y + dy * st.range, color: st.color, life: 1, kind: 'rail' });
      for (const o of g.enemies) {
        if (!o.alive) continue;
        if (isFlying(g, o) && !st.air) continue;
        const ox = o.x - t.x, oy = o.y - t.y;
        const proj = ox * dx + oy * dy;
        if (proj < 0 || proj > st.range) continue;
        if (Math.abs(ox * dy - oy * dx) > 0.75) continue;
        damageEnemy(g, o, st.dmg, { pierce: st.pierce, tower: t, bonusVsSlowed: st.bonusVsSlowed });
        applyStatus(g, o, st);
      }
      continue;
    }

    // Arc: cadena entre objectius propers
    if (st.chain) {
      let cur = prim.e, hit = new Set([cur.id]), from = { x: t.x, y: t.y };
      for (let i = 0; i < st.chain; i++) {
        g.fx.shots.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, color: st.color, life: 1, kind: 'zap' });
        damageEnemy(g, cur, st.dmg, { pierce: st.pierce, tower: t });
        applyStatus(g, cur, st);
        from = { x: cur.x, y: cur.y };
        let nxt = null, nd = st.chainRange;
        for (const o of g.enemies) {
          if (!o.alive || hit.has(o.id)) continue;
          if (isFlying(g, o) && !st.air) continue;
          const d = Math.hypot(o.x - from.x, o.y - from.y);
          if (d < nd) { nd = d; nxt = o; }
        }
        if (!nxt) break;
        cur = nxt; hit.add(cur.id);
      }
      continue;
    }

    // Tret estàndard (amb àrea opcional)
    const e = prim.e;
    const dmg = st.dmgVar ? st.dmg + Math.round((g.rng() * 2 - 1) * st.dmgVar) : st.dmg;
    const groundMult = st.groundMult && !prim.flying ? st.groundMult : 1;
    g.fx.shots.push({
      x1: t.x, y1: t.y, x2: e.x, y2: e.y, color: st.color, life: 1,
      kind: st.splash ? 'shell' : 'bolt',
    });
    const tx = e.x, ty = e.y;
    damageEnemy(g, e, Math.max(1, Math.round(dmg * groundMult)),
      { pierce: st.pierce, noSplit: st.noSplit, tower: t, bonusVsSlowed: st.bonusVsSlowed });
    applyStatus(g, e, st);
    if (st.splash) {
      g.fx.hits.push({ x: tx, y: ty, r: st.splash, color: st.color, life: 1 });
      splashAt(g, t, st, tx, ty, st.splash, Math.max(1, Math.round(dmg * 0.7)), e);
    }
  }
}

function tickStatuses(g) {
  for (const e of g.enemies) {
    if (!e.alive) continue;
    if (e.burn > 0) {
      e.burn--;
      damageEnemy(g, e, e.burnDmg, { pierce: true });
    }
    if (e.slow > 0 && --e.slow === 0) e.slowAmt = 1;
    if (e.root > 0) e.root--;
    if (e.stun > 0) e.stun--;
  }
}

// ─────────────────────────────────────────────────────────────
// TIC D'INVASIÓ
// ─────────────────────────────────────────────────────────────
export function invasionTick(g) {
  if (g.phase !== 'invasion') return;
  g.fx.shots.length = 0;
  g.fx.hits.length = 0;
  g.fx.sounds.length = 0;

  const w = WAVES[g.wave];
  // 1 · entren els enemics programats
  while (g.queue.length && g.queue[0].t <= g.tick) {
    const s = g.queue.shift();
    spawnEnemy(g, s.e, s.spawn, w.hpMul);
  }
  // 2 · avancen
  moveEnemies(g);
  // 3 · habilitats enemigues
  enemyAbilities(g);
  // 4 · disparen les defenses
  fireTowers(g);
  // 5 · estats (cremades, alentiments…)
  tickStatuses(g);

  g.enemies = g.enemies.filter((e) => e.alive);
  g.tick++;

  if (g.coreHp <= 0) {
    g.coreHp = 0;
    g.phase = 'defeat';
    logMsg(g, 'log.defeat', null, 'bad');
    return;
  }
  if (!g.queue.length && !g.enemies.length) endWave(g);
}

function endWave(g) {
  g.wave++;
  const bonus = 20 + g.wave * 8;
  g.scrap += bonus;
  logMsg(g, 'log.waveCleared', { n: g.wave, bonus }, 'good');
  if (g.wave >= WAVES.length) {
    g.phase = 'victory';
    logMsg(g, 'log.victory', null, 'good');
  } else {
    startPlanning(g);
  }
}

export function waveInfo(g) {
  return WAVES[Math.min(g.wave, WAVES.length - 1)];
}

/** Composició de la propera onada, per mostrar-la a la planificació. */
export function upcomingComposition(g) {
  const w = WAVES[g.wave];
  if (!w) return [];
  const map = new Map();
  for (const grp of w.groups) map.set(grp.e, (map.get(grp.e) || 0) + grp.n);
  return [...map.entries()].map(([type, n]) => ({ type, n, def: ENEMIES[type] }));
}
