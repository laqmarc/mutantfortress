// Mapa, generació procedural i camp de flux (pathfinding)
import { GRID_W, GRID_H } from './config.js';

/** PRNG determinista. Exposa `.state` per poder desar i restaurar la partida. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const rand = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(rand, 'state', {
    get: () => a,
    set: (v) => { a = v >>> 0; },
  });
  return rand;
}

export const idx = (x, y) => y * GRID_W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function createGrid() {
  const cells = new Array(GRID_W * GRID_H);
  for (let i = 0; i < cells.length; i++) cells[i] = { t: 'open', tower: null };
  return cells;
}

/** Nucli: bloc 2x2 a la dreta, centrat verticalment. */
export function coreRect() {
  return { x: GRID_W - 4, y: Math.floor(GRID_H / 2) - 1, w: 2, h: 2 };
}

export function isCoreCell(core, x, y) {
  return x >= core.x && x < core.x + core.w && y >= core.y && y < core.y + core.h;
}

export function coreCenter(core) {
  return { x: core.x + core.w / 2 - 0.5, y: core.y + core.h / 2 - 0.5 };
}

/**
 * Genera terreny: blocs de roca aleatoris que creen diversos corredors
 * possibles cap al nucli, garantint sempre connectivitat des de cada entrada.
 */
export function generateTerrain(rng, core, spawns) {
  const cells = createGrid();
  const protectedCell = (x, y) => {
    if (isCoreCell(core, x, y)) return true;
    // anell lliure al voltant del nucli
    if (x >= core.x - 1 && x <= core.x + core.w && y >= core.y - 1 && y <= core.y + core.h) return true;
    for (const s of spawns) if (Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1) return true;
    return false;
  };

  const blobs = 9 + Math.floor(rng() * 4);
  for (let b = 0; b < blobs; b++) {
    const bx = 2 + Math.floor(rng() * (GRID_W - 6));
    const by = Math.floor(rng() * GRID_H);
    const size = 2 + Math.floor(rng() * 4);
    let cx = bx, cy = by;
    for (let s = 0; s < size; s++) {
      if (inBounds(cx, cy) && !protectedCell(cx, cy)) cells[idx(cx, cy)].t = 'rock';
      const d = DIRS[Math.floor(rng() * 4)];
      cx += d[0]; cy += d[1];
    }
  }

  // Assegura que totes les entrades arriben al nucli; si no, obre roques.
  let guard = 0;
  while (guard++ < 300) {
    const field = flowField(cells, core, null);
    const blocked = spawns.filter((s) => field.dist[idx(s.x, s.y)] === Infinity);
    if (!blocked.length) break;
    const s = blocked[0];
    // obre una línia recta cap al nucli des de l'entrada bloquejada
    let x = s.x, y = s.y;
    while (x < core.x) {
      if (cells[idx(x, y)].t === 'rock') cells[idx(x, y)].t = 'open';
      if (y < core.y) y++; else if (y > core.y + core.h - 1) y--; else x++;
    }
  }
  return cells;
}

/** La ciutat comença amb dues entrades; el perímetre s'esquerda més endavant. */
export function defaultSpawns() {
  return [
    { x: 0, y: 2 },
    { x: 0, y: GRID_H - 3 },
  ];
}

/** Entrades que s'obren en onades concretes (bretxes del perímetre). */
export const SCHEDULED_BREACHES = {
  3: { x: 0, y: Math.floor(GRID_H / 2) },     // abans de l'onada 4
  6: { x: 0, y: Math.floor(GRID_H / 2) - 4 }, // abans de l'onada 7
};

/**
 * Camp de flux BFS des del nucli. `ghost` permet simular una torre
 * addicional en una casella (per previsualitzar l'efecte d'un moviment).
 */
export function flowField(cells, core, ghost, ignoreTowerId) {
  const dist = new Float64Array(GRID_W * GRID_H).fill(Infinity);
  const q = [];
  for (let y = core.y; y < core.y + core.h; y++) {
    for (let x = core.x; x < core.x + core.w; x++) {
      dist[idx(x, y)] = 0;
      q.push([x, y]);
    }
  }
  const passable = (x, y) => {
    const c = cells[idx(x, y)];
    if (c.t === 'rock') return false;
    if (ghost && ghost.x === x && ghost.y === y) return false;
    if (c.tower != null && c.tower !== ignoreTowerId) return false;
    return true;
  };

  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    const d = dist[idx(x, y)];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (dist[ni] !== Infinity) continue;
      if (!passable(nx, ny)) continue;
      dist[ni] = d + 1;
      q.push([nx, ny]);
    }
  }
  return { dist };
}

/** Ordre de direccions propi de cada enemic → camins paral·lels diferents. */
export function prefOrder(pref) {
  const base = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const rot = pref % 4;
  const out = base.slice(rot).concat(base.slice(0, rot));
  return pref >= 4 ? out.slice().reverse() : out;
}

/** Següent casella per a un enemic terrestre; null si està encallat. */
export function nextStep(field, x, y, pref) {
  const cur = field.dist[idx(x, y)];
  if (cur === Infinity || cur === 0) return null;
  for (const [dx, dy] of prefOrder(pref)) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    if (field.dist[idx(nx, ny)] === cur - 1) return { x: nx, y: ny };
  }
  return null;
}

/** Traça el recorregut complet d'una entrada fins al nucli (per previsualitzar). */
export function tracePath(field, start, pref, max = 200) {
  const pts = [{ x: start.x, y: start.y }];
  let cur = { x: start.x, y: start.y };
  for (let i = 0; i < max; i++) {
    const n = nextStep(field, cur.x, cur.y, pref);
    if (!n) break;
    pts.push(n);
    cur = n;
    if (field.dist[idx(cur.x, cur.y)] === 0) break;
  }
  return pts;
}

/** Comprova que totes les entrades segueixen tenint camí (regla anti-segellat). */
export function allSpawnsConnected(cells, core, spawns, ghost, ignoreTowerId) {
  const f = flowField(cells, core, ghost, ignoreTowerId);
  return spawns.every((s) => f.dist[idx(s.x, s.y)] !== Infinity);
}

/** Casella lliure més propera a (x,y) — per desplaçar torres amb un terratrèmol. */
export function nearestFree(cells, core, x, y) {
  for (let r = 1; r < Math.max(GRID_W, GRID_H); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const c = cells[idx(nx, ny)];
        if (c.t === 'open' && c.tower == null && !isCoreCell(core, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}
