// Comprova els tres perfils de dificultat i que es conserven al desat.
import { START } from '../src/config.js';
import { createGame, startPlanning, startInvasion } from '../src/game.js';
import { serialize, restore } from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Dificultats ──');

const game = (difficulty) => {
  const g = createGame(1234, { difficulty });
  startPlanning(g);
  startInvasion(g);
  return g;
};

const easy = game('easy');
const normal = game('normal');
const hard = game('hard');

check('normal conserva els recursos actuals',
  normal.coreMax === START.core && normal.scrap === START.scrap);
check('fàcil dona més nucli', easy.coreMax > normal.coreMax);
check('difícil dona menys nucli', hard.coreMax < normal.coreMax);
check('fàcil redueix la quantitat d enemics', easy.queue.length < normal.queue.length);
check('difícil augmenta la quantitat d enemics', hard.queue.length > normal.queue.length);
check('fàcil redueix la vida', easy.queue[0].hpMul < normal.queue[0].hpMul);
check('difícil augmenta la vida', hard.queue[0].hpMul > normal.queue[0].hpMul);

const restored = restore(serialize(createGame(99, { difficulty: 'hard', endless: true })));
check('el desat conserva dificultat i mode infinit',
  restored?.game.difficulty === 'hard' && restored.game.endless === true);

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);