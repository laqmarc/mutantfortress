// Comprova el contracte de l instantània que usa el desfer de planificació.
import { createGame, startPlanning, buildTower } from '../src/game.js';
import { serialize, restore } from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Desfer planificació ──');

const g = createGame(9191, { endless: true, difficulty: 'hard', archetype: 'spiral' });
startPlanning(g);
const before = serialize(g);
let built = null;
for (let x = 2; x < 14 && !built; x++) {
  for (let y = 1; y < 11 && !built; y++) {
    const result = buildTower(g, 'pulsar', x, y);
    if (result.ok) built = result.tower;
  }
}

const restored = restore(before)?.game;
check('una acció de planificació modifica l estat', built && g.towers.size === 1);
check('la instantània elimina la torre', restored?.towers.size === 0);
check('la instantània recupera recursos', restored?.energy === 8 && restored.scrap === 85);
check('la instantània conserva opcions de partida',
  restored?.endless === true && restored.difficulty === 'hard' && restored.archetype === 'spiral');

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);