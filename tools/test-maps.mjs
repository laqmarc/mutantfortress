// Comprova la varietat i la connectivitat dels arquetips de mapa.
import { MAP_ARCHETYPES } from '../src/grid.js';
import { createGame } from '../src/game.js';
import { serialize, restore } from '../src/save.js';
import { allSpawnsConnected } from '../src/grid.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Arquetips de mapa ──');

const games = MAP_ARCHETYPES.map((archetype) => createGame(8080, { archetype }));
const terrain = games.map((g) => g.cells.map((cell) => cell.t).join(''));

check('hi ha quatre arquetips', MAP_ARCHETYPES.length === 4);
check('cada arquetip respecta la seva selecció', games.every((g, i) => g.archetype === MAP_ARCHETYPES[i]));
check('els quatre mapes no són idèntics', new Set(terrain).size === MAP_ARCHETYPES.length);
check('cada entrada continua connectada', games.every((g) => allSpawnsConnected(g.cells, g.core, g.spawns)));
check('cada mapa té espai de roca', games.every((g) => g.cells.some((cell) => cell.t === 'rock')));

const restored = restore(serialize(games[3]));
check('el desat conserva l arquetip', restored?.game.archetype === 'spiral');

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);