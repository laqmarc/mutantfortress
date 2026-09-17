// Comprova els avisos de cobertura contra famílies d enemics concretes.
import { coverageWarnings, createGame, startPlanning } from '../src/game.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Avisos de cobertura ──');

function emptyAt(wave) {
  const g = createGame(5150, { archetype: 'open' });
  g.wave = wave;
  startPlanning(g);
  g.towers.clear();
  return g;
}

check('avisa dels Voladors', coverageWarnings(emptyAt(4)).includes('air'));
check('avisa dels Blindats', coverageWarnings(emptyAt(2)).includes('armor'));
check('avisa dels Divisors', coverageWarnings(emptyAt(5)).includes('split'));
check('avisa dels Alteradors', coverageWarnings(emptyAt(6)).includes('shift'));

const air = emptyAt(4);
air.towers.set(1, { key: 'pulsar' });
check('una defensa antiaèria elimina l avís', !coverageWarnings(air).includes('air'));

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);