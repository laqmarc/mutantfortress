// Comprova que el mode infinit genera i resol onades posteriors a la campanya.
import { WAVE_COUNT, waveAt } from '../src/config.js';
import { createGame, startPlanning, startInvasion, invasionTick, waveInfo } from '../src/game.js';
import { serialize, restore } from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Mode infinit ──');

check('la campanya conserva les 10 onades', WAVE_COUNT === 10);
check('la onada 11 té composició', waveAt(WAVE_COUNT).groups.length > 0);
check('la dificultat de la onada 11 supera la 6', waveAt(WAVE_COUNT).hpMul > waveAt(5).hpMul);

const g = createGame(424242, { endless: true });
g.wave = WAVE_COUNT;
g.coreHp = 1e9;
g.coreMax = 1e9;
startPlanning(g);
startInvasion(g);
check('el motor inicia la primera onada infinita', g.phase === 'invasion' && g.queue.length > 0);
check('la previsualització usa la onada infinita', waveInfo(g).hpMul === waveAt(WAVE_COUNT).hpMul);

let ticks = 0;
while (g.phase === 'invasion' && ticks++ < 1500) invasionTick(g);
check('la primera onada infinita acaba', g.phase === 'planning', `fase ${g.phase}, tics ${ticks}`);
check('el mode infinit no declara victòria', g.wave === WAVE_COUNT + 1);

const restored = restore(serialize(g));
check('el desat conserva el mode infinit', restored?.game.endless === true);

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);