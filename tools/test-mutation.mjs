// Proves de la mecànica central: quines mutacions s'ofereixen i que triar-ne una
// funcioni de debò. El motor no depèn del DOM, així que això corre a Node.
//   node tools/test-mutation.mjs
import { MUTATE_KILLS, TOWERS } from '../src/config.js';
import { createGame, mutationOptions, mutateTower, canMutate, buildTower, startPlanning } from '../src/game.js';

let pass = 0, fail = 0;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** Torre de laboratori amb un perfil de baixes concret. */
function tower(kills) {
  const total = Object.values(kills).reduce((a, b) => a + b, 0);
  return { id: 1, key: 'pulsar', x: 5, y: 5, cd: 0, kills, totalKills: total, disabled: 0, angle: 0, flash: 0 };
}

console.log('\n── Opcions segons el perfil de baixes ──');

check('dieta variada dona dues opcions',
  mutationOptions(tower({ fast: 5, armor: 3, air: 1 })).join() === 'gel,perforador');

check('dieta pura dona una sola opcio garantida',
  mutationOptions(tower({ armor: 8 })).join() === 'perforador');

check('sense categoria dominant, el caos va primer',
  mutationOptions(tower({ fast: 3, armor: 3, air: 3 }))[0] === 'prisma');

check('sense baixes no hi ha cap opcio',
  mutationOptions(tower({})).length === 0);

check('els Rastrejadors compten com a dieta caotica',
  mutationOptions(tower({ basic: 9 })).join() === 'prisma');

check('mai mes de dues opcions',
  mutationOptions(tower({ fast: 4, armor: 3, air: 2, split: 2, shift: 1 })).length === 2);

check('mai dues opcions repetides',
  new Set(mutationOptions(tower({ basic: 5, split: 4 }))).size
    === mutationOptions(tower({ basic: 5, split: 4 })).length);

console.log('\n── Triar de debò canvia el resultat ──');

function freshTowerInGame(kills) {
  const g = createGame(12345);
  startPlanning(g);
  g.energy = 50; g.scrap = 500;
  const r = buildTower(g, 'pulsar', 3, 3);
  const t = r.tower;
  t.kills = kills;
  t.totalKills = Object.values(kills).reduce((a, b) => a + b, 0);
  return { g, t };
}

const mixed = { fast: 5, armor: 4 };
{
  const { g, t } = freshTowerInGame(mixed);
  const opts = mutationOptions(t);
  const r = mutateTower(g, t, opts[1]);
  check('triar la segona opcio dona la segona torre',
    r.ok && t.key === opts[1], `esperava ${opts[1]}, ha sortit ${t.key}`);
}
{
  const { g, t } = freshTowerInGame(mixed);
  const opts = mutationOptions(t);
  const r = mutateTower(g, t, opts[0]);
  check('triar la primera opcio dona la primera torre',
    r.ok && t.key === opts[0], `esperava ${opts[0]}, ha sortit ${t.key}`);
}
{
  const { g, t } = freshTowerInGame(mixed);
  mutateTower(g, t);
  check('sense triar, cau a la dominant', t.key === 'gel', `ha sortit ${t.key}`);
}
{
  const { g, t } = freshTowerInGame(mixed);
  // una clau que no s'ofereix no s'ha de poder colar
  mutateTower(g, t, 'supernova');
  check('una mutacio no oferta s\'ignora', t.key === 'gel', `ha sortit ${t.key}`);
}
{
  const { g, t } = freshTowerInGame({ fast: 2 });
  const r = mutateTower(g, t, 'gel');
  check('per sota del llindar no muta', !r.ok && t.key === 'pulsar');
}
{
  const { g, t } = freshTowerInGame(mixed);
  const before = g.energy;
  mutateTower(g, t, mutationOptions(t)[1]);
  check('mutar cobra energia', g.energy < before);
}
{
  const { g, t } = freshTowerInGame(mixed);
  const before = g.energy;
  mutateTower(g, t, null, true);
  check('la mutacio gratuita (event Mutagen) no cobra', g.energy === before && TOWERS[t.key].tier === 2);
}

console.log(`\nLlindar actual: ${MUTATE_KILLS} baixes`);
console.log(`${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);
