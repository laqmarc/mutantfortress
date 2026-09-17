// Comprova que el resum final exposa la configuració real de la partida.
import { createGame, startPlanning, buildTower } from '../src/game.js';
import { finalSummary } from '../src/ui.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
};

console.log('\n── Resum final ──');

const g = createGame(7070, { difficulty: 'hard', archetype: 'canyon', endless: true });
startPlanning(g);
g.energy = 50;
g.scrap = 500;
for (let x = 2; x < 14 && g.towers.size < 2; x++) {
  for (let y = 1; y < 11 && g.towers.size < 2; y++) buildTower(g, 'pulsar', x, y);
}
const [first] = g.towers.values();
first.key = 'gel';
const summary = finalSummary(g);

check('inclou dificultat i arquetip', summary.difficulty === 'hard' && summary.archetype === 'canyon');
check('inclou defenses finals', summary.towers.length === 2);
check('inclou mutacions descobertes', summary.mutations.includes('gel'));

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);