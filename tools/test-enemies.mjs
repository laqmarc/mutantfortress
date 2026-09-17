// Comprova presència i comportaments bàsics dels nous enemics.
import { createGame, startPlanning, startInvasion, invasionTick } from '../src/game.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\n── Nous enemics ──');

function runWave(wave, archetype = 'open') {
  const g = createGame(6161, { archetype });
  g.wave = wave;
  g.coreHp = 1e9;
  g.coreMax = 1e9;
  startPlanning(g);
  startInvasion(g);
  const seen = new Set();
  let shieldInitial = false, shieldReset = false, healerEffect = false, healerDelta = '', excavated = false;
  for (let tick = 0; tick < 80 && g.phase === 'invasion'; tick++) {
    invasionTick(g);
    for (const enemy of g.enemies) {
      seen.add(enemy.type);
      if (enemy.type === 'escut' && !shieldInitial) {
        shieldInitial = enemy.shield === 10;
        enemy.shield = 0;
        invasionTick(g);
        shieldReset = enemy.alive && enemy.shield === 10;
      }
      if (enemy.type === 'sanador' && !healerEffect) {
        const other = g.enemies.find((candidate) => candidate.alive && candidate.id !== enemy.id)
          || { ...enemy, id: 999, type: 'rastrejador', hp: 1, maxHp: 30, alive: true };
        if (!g.enemies.includes(other)) g.enemies.push(other);
        if (other) {
          enemy.root = 1; other.root = 1;
          other.x = enemy.x; other.y = enemy.y;
          other.hp = Math.max(1, other.maxHp - 10);
          const before = other.hp;
          invasionTick(g);
          healerEffect = other.alive && other.hp > before;
          healerDelta = `${before}->${other.hp}, alive=${other.alive}`;
        }
      }
      if (enemy.type === 'excavador' && enemy.excavated) excavated = true;
    }
  }
  return { g, seen, shieldInitial, shieldReset, healerEffect, healerDelta, excavated };
}

const healerWave = runWave(5);
const shieldWave = runWave(6);
const excavatorWave = runWave(7, 'maze');

check('la onada 6 inclou Sanadors', healerWave.seen.has('sanador'));
check('la onada 7 inclou Escuts frontals', shieldWave.seen.has('escut'));
check('la onada 8 inclou Excavadores', excavatorWave.seen.has('excavador'));
check('els Escuts tenen protecció inicial', shieldWave.shieldInitial);
check('els Escuts recuperen la protecció cada tic', shieldWave.shieldReset);
check('els Sanadors recuperen vida als aliats', healerWave.healerEffect, healerWave.healerDelta);
check('un Excavador ha obert una roca', excavatorWave.excavated);

console.log(`\n${pass} correctes, ${fail} fallades\n`);
process.exit(fail ? 1 : 0);