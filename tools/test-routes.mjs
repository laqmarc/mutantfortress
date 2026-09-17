// Comprova la invariant que el jugador dona per bona: tot enemic terrestre
// segueix una de les rutes que es dibuixen al tauler.
//   node tools/test-routes.mjs
import { ENEMIES } from '../src/config.js';
import { ROUTE_PREFS, tracePath, idx } from '../src/grid.js';
import { createGame, startPlanning, startInvasion, invasionTick } from '../src/game.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Tot enemic usa una ruta dibuixada ──');

const seen = new Set();
let checked = 0;
const cats = new Set();

for (let seed = 1; seed <= 6; seed++) {
  const g = createGame(seed * 997);
  startPlanning(g);
  // nucli indestructible: aquí no provem si es guanya, sinó per on camina la gent
  g.coreHp = 1e9; g.coreMax = 1e9;
  // totes les onades, per veure divisors, esquirles i els esbirros del Colòs
  while (g.wave < 10) {
    startInvasion(g);
    let t = 0;
    while (g.phase === 'invasion' && t++ < 500) {
      invasionTick(g);
      for (const e of g.enemies) {
        seen.add(e.pref);
        cats.add(ENEMIES[e.type].cat);
        checked++;
      }
    }
    if (g.phase !== 'planning' && g.phase !== 'victory') break;
    if (g.phase === 'victory') break;
  }
}

check(`cap enemic fora de les rutes dibuixades (${checked} comprovacions)`,
  [...seen].every((p) => ROUTE_PREFS.includes(p)),
  `preferències vistes: ${[...seen].sort().join(',')}`);

check('s\'han vist totes les rutes dibuixades',
  ROUTE_PREFS.every((p) => seen.has(p)),
  `vistes ${[...seen].sort().join(',')} de ${ROUTE_PREFS.join(',')}`);

check('la prova ha cobert totes les famílies d\'enemics',
  ['basic', 'fast', 'armor', 'air', 'split', 'shift'].every((c) => cats.has(c)),
  `categories vistes: ${[...cats].sort().join(',')}`);

console.log('\n── Cap enemic camina fora de les línies ──');

{
  // Onades 1-6: no hi ha Alteradors, o sigui que el terreny no canvia a mig vol
  // i tot enemic terrestre ha de ser sempre damunt d'una ruta dibuixada.
  let mostres = 0, fora = 0, exemple = '';
  for (let seed = 1; seed <= 4; seed++) {
    const g = createGame(seed * 331);
    startPlanning(g);
    g.coreHp = 1e9; g.coreMax = 1e9;
    while (g.wave < 6) {
      startInvasion(g);
      let t = 0;
      while (g.phase === 'invasion' && t++ < 500) {
        invasionTick(g);
        // es retracen les rutes cada tic, igual que fa el renderitzador
        const cel = new Set();
        for (const sp of g.spawns) {
          for (const p of ROUTE_PREFS) {
            for (const q of tracePath(g.field, sp, p)) cel.add(`${q.x},${q.y}`);
          }
        }
        for (const e of g.enemies) {
          if (ENEMIES[e.type].flying) continue;   // els Voladors hi passen per sobre: és el disseny
          mostres++;
          const k = `${Math.round(e.x)},${Math.round(e.y)}`;
          if (!cel.has(k)) { fora++; if (!exemple) exemple = `${e.type} a ${k}`; }
        }
      }
      if (g.phase !== 'planning') break;
    }
  }
  check(`cap terrestre fora de ruta (${mostres} posicions)`, fora === 0,
    `${fora} fora, p. ex. ${exemple}`);
}

console.log('\n── Les línies dibuixades porten al nucli ──');

{
  const g = createGame(4242);
  startPlanning(g);
  let ok = true, detail = '';
  for (const s of g.spawns) {
    for (const p of ROUTE_PREFS) {
      const pts = tracePath(g.field, s, p);
      const last = pts[pts.length - 1];
      if (g.field.dist[idx(last.x, last.y)] !== 0) {
        ok = false;
        detail = `ruta ${p} des de ${s.x},${s.y} acaba a ${last.x},${last.y}`;
      }
    }
  }
  check('cada ruta dibuixada acaba al nucli', ok, detail);
}

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);
