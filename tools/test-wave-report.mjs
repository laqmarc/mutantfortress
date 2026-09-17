// Comprova que cada onada produeix un informe útil per al jugador.
import { createGame, startPlanning, startInvasion, invasionTick, buildTower } from '../src/game.js';
import { serialize, restore } from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Informe d onada ──');

const g = createGame(7733);
g.coreHp = 1e9;
g.coreMax = 1e9;
startPlanning(g);
g.energy = 100;
g.scrap = 10000;
let built = 0;
for (let x = 2; x < 14 && built < 6; x++) {
  for (let y = 1; y < 11 && built < 6; y++) {
    if (buildTower(g, 'pulsar', x, y).ok) built++;
  }
}
startInvasion(g);
let ticks = 0;
while (g.phase === 'invasion' && ticks++ < 1000) invasionTick(g);

const report = g.lastWaveReport;
check('la onada acaba amb un informe', !!report);
check('l informe conserva la durada', report?.duration > 0);
check('l informe registra fuites', Object.keys(report?.leakedByType || {}).length > 0);
check('l informe registra categories', Object.keys(report?.killsByCategory || {}).length > 0);

const restored = restore(serialize(g));
check('el desat conserva l informe', restored?.game.lastWaveReport?.wave === 1);

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);