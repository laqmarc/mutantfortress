// Simulador sense navegador: juga partides amb una IA senzilla per validar
// que les 10 onades es resolen i que el balanç és raonable.
//   node tools/balance.mjs [nPartides]
import { WAVES, TOWERS, BASE_TOWERS, COST, GRID_W, GRID_H } from '../src/config.js';
import { waveName } from '../src/i18n.js';
import { idx, isCoreCell, allSpawnsConnected, flowField } from '../src/grid.js';
import {
  createGame, startPlanning, startInvasion, invasionTick, buildTower, mutateTower,
  fuseTowers, canMutate, canFusePair, towerAt, mutationOptions,
} from '../src/game.js';

/** Puntua una casella: com més camí enemic li passi a tir, millor. */
function scoreCell(g, x, y, range) {
  const f = g.field;
  let s = 0;
  for (let yy = 0; yy < GRID_H; yy++) {
    for (let xx = 0; xx < GRID_W; xx++) {
      const d = f.dist[idx(xx, yy)];
      if (d === Infinity) continue;
      if (Math.hypot(xx - x, yy - y) > range) continue;
      s += 1 + (40 - Math.min(40, d)) * 0.35;   // prioritza a prop del nucli
    }
  }
  return s;
}

function bestSpot(g, key) {
  const def = TOWERS[key];
  let best = null, bs = -1;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = g.cells[idx(x, y)];
      if (c.t !== 'open' || c.tower != null || isCoreCell(g.core, x, y)) continue;
      if (g.spawns.some((s) => s.x === x && s.y === y)) continue;
      if (!allSpawnsConnected(g.cells, g.core, g.spawns, { x, y })) continue;
      const s = scoreCell(g, x, y, def.range) + (g.rng() * 6);
      if (s > bs) { bs = s; best = { x, y }; }
    }
  }
  return best;
}

/** IA de planificació: fusiona > muta > construeix el que pot pagar. */
function planTurn(g) {
  for (const a of [...g.towers.values()]) {
    if (g.energy < COST.fuse) break;
    const partner = [...g.towers.values()].find((b) => canFusePair(g, a, b));
    if (partner && g.scrap >= 45) fuseTowers(g, a, partner);
  }
  for (const t of [...g.towers.values()]) {
    if (g.energy >= COST.mutate && canMutate(g, t)) {
      // la IA tria a l'atzar entre les opcions, per veure tot l'arbre
      const opts = mutationOptions(t);
      mutateTower(g, t, opts[Math.floor(g.rng() * opts.length)]);
    }
  }
  let guard = 0;
  while (guard++ < 12 && g.energy >= COST.build) {
    const affordable = BASE_TOWERS.filter((k) => TOWERS[k].cost <= g.scrap);
    if (!affordable.length) break;
    // prefereix la més cara que es pugui pagar (millor relació valor/casella)
    const key = affordable.sort((a, b) => TOWERS[b].cost - TOWERS[a].cost)[0];
    const spot = bestSpot(g, key);
    if (!spot) break;
    const r = buildTower(g, key, spot.x, spot.y);
    if (!r.ok) break;
  }
}

function playOne(seed) {
  const g = createGame(seed);
  const perWave = [];
  startPlanning(g);
  let guard = 0;
  while (g.phase !== 'victory' && g.phase !== 'defeat' && guard++ < 200) {
    const before = g.coreHp;
    planTurn(g);
    startInvasion(g);
    let ticks = 0;
    while (g.phase === 'invasion' && ticks++ < 500) invasionTick(g);
    perWave.push({
      wave: g.wave, ticks, lost: before - g.coreHp,
      core: g.coreHp, towers: g.towers.size, scrap: g.scrap,
      t2: [...g.towers.values()].filter((t) => TOWERS[t.key].tier === 2).length,
      t3: [...g.towers.values()].filter((t) => TOWERS[t.key].tier === 3).length,
    });
    if (ticks >= 500) throw new Error(`Onada ${g.wave + 1} no s'ha resolt en 500 tics (bucle infinit?)`);
  }
  return { g, perWave, won: g.phase === 'victory' };
}

const N = Number(process.argv[2] || 12);
let wins = 0;
const coreEnd = [];
const detail = [];

for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919;
  let r;
  try {
    r = playOne(seed);
  } catch (e) {
    console.error(`✗ llavor ${seed}: ${e.message}`);
    continue;
  }
  if (r.won) wins++;
  coreEnd.push(r.g.coreHp);
  detail.push({ seed, won: r.won, core: r.g.coreHp, waves: r.g.wave, ...r.g.stats, perWave: r.perWave });
}

const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length);

console.log(`\n═══ FORTALESA MUTANT · ${N} partides (IA bàsica) ═══`);
console.log(`Victòries:        ${wins}/${N}  (${Math.round((wins / N) * 100)}%)`);
console.log(`Nucli restant:    mitjana ${avg(coreEnd).toFixed(1)} / 20  (mín ${Math.min(...coreEnd)}, màx ${Math.max(...coreEnd)})`);
console.log(`Baixes:           ${avg(detail.map((d) => d.kills)).toFixed(0)}`);
console.log(`Mutacions:        ${avg(detail.map((d) => d.mutations)).toFixed(1)}`);
console.log(`Fusions:          ${avg(detail.map((d) => d.fusions)).toFixed(1)}`);
console.log(`Onades superades: ${avg(detail.map((d) => d.waves)).toFixed(1)} / 10`);

console.log(`\nDany al nucli per onada (mitjana de les ${N} partides):`);
for (let w = 0; w < WAVES.length; w++) {
  const rows = detail.map((d) => d.perWave[w]).filter(Boolean);
  if (!rows.length) { console.log(`  ${String(w + 1).padStart(2)}. ${waveName(w).padEnd(12)} —`); continue; }
  const lost = avg(rows.map((r) => r.lost));
  const ticks = avg(rows.map((r) => r.ticks));
  const bar = '█'.repeat(Math.round(lost * 2)) || '·';
  console.log(`  ${String(w + 1).padStart(2)}. ${waveName(w).padEnd(12)} −${lost.toFixed(1)} nucli  ${String(Math.round(ticks)).padStart(3)} tics  ${bar}`);
}

const totalTicks = avg(detail.map((d) => d.perWave.reduce((a, r) => a + r.ticks, 0)));
console.log(`\nDurada: ~${Math.round(totalTicks)} tics d'invasió ≈ ${(totalTicks * 0.43 / 60).toFixed(1)} min d'animació`);
console.log(`(+ el temps de planificació del jugador: objectiu 15–25 min per partida)\n`);
