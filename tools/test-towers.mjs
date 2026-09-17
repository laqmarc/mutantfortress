// Proves de l'arbre de fusions i del sistema de millores.
//   node tools/test-towers.mjs
import { TOWERS, FUSIONS, UPGRADE } from '../src/config.js';
import {
  createGame, startPlanning, buildTower, towerStats, fusionResult,
  upgradeTower, upgradeCost, canUpgrade, mutateTower, recycleTower,
} from '../src/game.js';
import { serialize, restore } from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const muts = Object.keys(TOWERS).filter((k) => TOWERS[k].tier === 2);

console.log('\n── Arbre de fusions ──');

{
  const parelles = [];
  for (let i = 0; i < muts.length; i++) {
    for (let j = i; j < muts.length; j++) parelles.push([muts[i], muts[j]]);
  }
  const resultats = parelles.map(([a, b]) => fusionResult(a, b));

  check(`hi ha resultat per a les ${parelles.length} parelles possibles`,
    resultats.every((r) => !!TOWERS[r]));

  check('cap parella cau a l\'Amalgama genèrica',
    !resultats.includes('amalgama'),
    `${resultats.filter((r) => r === 'amalgama').length} hi cauen`);

  check('cada parella dona una fusió diferent',
    new Set(resultats).size === parelles.length,
    `${new Set(resultats).size} resultats per a ${parelles.length} parelles`);

  check('totes les fusions són de tier 3',
    resultats.every((r) => TOWERS[r].tier === 3));

  check('la taula no té entrades duplicades',
    new Set(FUSIONS.map((f) => [f.a, f.b].sort().join('+'))).size === FUSIONS.length);

  check('fusionar és commutatiu',
    parelles.every(([a, b]) => fusionResult(a, b) === fusionResult(b, a)));
}

console.log('\n── Millores de nivell ──');

function taulell() {
  const g = createGame(9001);
  startPlanning(g);
  g.energy = 200; g.scrap = 5000;
  return g;
}

/** Col·loca on es pugui: el mapa és procedural i la casella triada pot ser runa. */
function planta(g, key) {
  for (let x = 3; x < 14; x++) {
    for (let y = 1; y < 11; y++) {
      const r = buildTower(g, key, x, y);
      if (r.ok) return r.tower;
    }
  }
  throw new Error(`no s'ha pogut col·locar cap ${key}`);
}

{
  const g = taulell();
  const t = planta(g, 'pulsar');
  const base = towerStats(g, t);
  upgradeTower(g, t);
  const nv2 = towerStats(g, t);
  check('millorar puja el dany', nv2.dmg > base.dmg, `${base.dmg} → ${nv2.dmg}`);
  check('millorar puja l\'abast', nv2.range > base.range, `${base.range} → ${nv2.range}`);
  check('el nivell queda a 2', t.lvl === 2);
}
{
  const g = taulell();
  const t = planta(g, 'pulsar');
  while (canUpgrade(g, t)) upgradeTower(g, t);
  check(`el sostre és el nivell ${UPGRADE.maxLevel}`, t.lvl === UPGRADE.maxLevel);
  const r = upgradeTower(g, t);
  check('al màxim ja no es pot millorar', !r.ok && r.msg === 'err.maxLevel');
}
{
  const g = taulell();
  const t = planta(g, 'pulsar');
  upgradeTower(g, t);
  const abans = g.scrap;
  g.scrap = upgradeCost(t) - 1;
  const r = upgradeTower(g, t);
  check('sense ferralla no es pot millorar', !r.ok && t.lvl === 2, `msg ${r.msg}`);
  g.scrap = abans;
}
{
  const g = taulell();
  const t = planta(g, 'pulsar');
  upgradeTower(g, t);
  t.kills = { fast: 9 }; t.totalKills = 9;
  mutateTower(g, t);
  check('el nivell sobreviu a la mutació', t.lvl === 2 && TOWERS[t.key].tier === 2);
}
{
  const g = taulell();
  const a = planta(g, 'pulsar');
  const b = planta(g, 'pulsar');
  a.kills = { fast: 9 }; a.totalKills = 9;
  b.kills = { armor: 9 }; b.totalKills = 9;
  mutateTower(g, a); mutateTower(g, b);
  upgradeTower(g, b); upgradeTower(g, b);      // b arriba a nivell 3
  const { fuseTowers } = await import('../src/game.js');
  fuseTowers(g, a, b);
  check('la fusió es queda el millor nivell dels dos', a.lvl === 3, `ha quedat a ${a.lvl}`);
}
{
  const g = taulell();
  const t = planta(g, 'pulsar');
  upgradeTower(g, t);
  const abans = g.scrap;
  recycleTower(g, t);
  const senseMillora = (() => {
    const g2 = taulell();
    const t2 = planta(g2, 'pulsar');
    const s2 = g2.scrap;
    recycleTower(g2, t2);
    return g2.scrap - s2;
  })();
  check('reciclar retorna part del que s\'hi ha invertit',
    g.scrap - abans > senseMillora, `${g.scrap - abans} vs ${senseMillora}`);
}
{
  const g = taulell();
  const t = planta(g, 'morter');
  upgradeTower(g, t); upgradeTower(g, t);
  const r = restore(serialize(g, {}));
  const revingut = [...r.game.towers.values()][0];
  check('el nivell sobreviu al desat i la càrrega', revingut.lvl === 3, `ha quedat a ${revingut.lvl}`);
}
{
  const g = taulell();
  const t = planta(g, 'pulsar');
  const c1 = upgradeCost(t);
  upgradeTower(g, t);
  const c2 = upgradeCost(t);
  check('el segon nivell costa més que el primer', c2 > c1, `${c1} → ${c2}`);
}

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);
