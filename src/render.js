// Renderat en canvas 2D.
//
// Passades: fons (espai de pantalla) → món emissiu → bloom → text nítid → vinyeta.
// El bloom es fa reduint el fotograma a la meitat i tornant-lo a compondre desenfocat
// en mode «lighter»: com que el fons és molt fosc, només hi guanyen els neons.
import { GRID_W, GRID_H, CELL, TOWERS, ENEMIES } from './config.js';
import { idx, tracePath, flowField, ROUTE_PREFS } from './grid.js';
import { towerStats, isFlying } from './game.js';
import { cam, BOARD_W, BOARD_H, resize as camResize } from './camera.js';
import * as fx from './fx.js';

export const W = BOARD_W;
export const H = BOARD_H;

let dpr = 1;
// Factor perquè text i barres conservin mida constant a pantalla encara que
// la càmera estigui allunyada (imprescindible al mòbil).
let K = 1;
let lastTime = 0;
let flash = 0;              // fogonada vermella quan el nucli rep un impacte

// ── Bloom ──────────────────────────────────────────────────
let bloomCanvas = null, bctx = null;
let bloomOn = true, blurOk = true;
let frameAcc = 0, frameCount = 0;

function ensureBloom(w, h) {
  const bw = Math.max(1, Math.round(w * 0.5));
  const bh = Math.max(1, Math.round(h * 0.5));
  if (!bloomCanvas) {
    bloomCanvas = document.createElement('canvas');
    bctx = bloomCanvas.getContext('2d');
    bctx.filter = 'blur(2px)';
    blurOk = bctx.filter !== 'none';     // Safari antic no en té
    bctx.filter = 'none';
  }
  if (bloomCanvas.width !== bw || bloomCanvas.height !== bh) {
    bloomCanvas.width = bw;
    bloomCanvas.height = bh;
  }
  return { bw, bh };
}

export const setBloom = (on) => { bloomOn = on; };
export const bloomEnabled = () => bloomOn;

// ── Estrelles de fons (paral·laxi en desplaçar la càmera) ──
const STARS = [];
for (let i = 0; i < 110; i++) {
  STARS.push({
    x: Math.random(), y: Math.random(),
    r: 0.4 + Math.random() * 1.5,
    d: 0.12 + Math.random() * 0.5,          // profunditat
    tw: Math.random() * 6.28,
  });
}

/** Ajusta el canvas a la mida real del seu contenidor. Torna true si ha canviat. */
export function resizeCanvas(canvas) {
  const box = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width === bw && canvas.height === bh) return false;
  canvas.width = bw;
  canvas.height = bh;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camResize(w, h);
  return true;
}

export function getContext(canvas) {
  return canvas.getContext('2d');
}

const cx = (x) => x * CELL + CELL / 2;
const cy = (y) => y * CELL + CELL / 2;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Posició interpolada d'un enemic dins del tic. Els que es mouen més d'una
 * casella per tic (Corredors, Esquirles) han de recórrer la polilínia de
 * caselles que han trepitjat de debò; si s'interpolés en recta, retallarien
 * les cantonades i semblaria que travessen la runa.
 */
function enemyPos(e, a) {
  const pts = e.path;
  if (!pts || pts.length < 2) return { x: lerp(e.px, e.x, a), y: lerp(e.py, e.y, a) };
  const segs = pts.length;
  const t = Math.min(segs, a * segs);
  const i = Math.min(segs - 1, Math.floor(t));
  const f = t - i;
  const from = i === 0 ? { x: e.px, y: e.py } : pts[i - 1];
  const to = pts[i];
  return { x: lerp(from.x, to.x, f), y: lerp(from.y, to.y, f) };
}
const font = (size, weight = 'bold') =>
  `${weight} ${(size * K).toFixed(1)}px Rajdhani, system-ui, sans-serif`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, x, y, r, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// ── Partícules i sacseig derivats d'un tic del motor ───────
/** Converteix els efectes que ha registrat el motor aquest tic en partícules. */
export function fxFromTick(g) {
  for (const s of g.fx.shots) {
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const power = s.kind === 'rail' ? 1.6 : s.kind === 'shell' ? 1.2 : 0.8;
    fx.muzzle(cx(s.x1) + Math.cos(ang) * CELL * 0.3, cy(s.y1) + Math.sin(ang) * CELL * 0.3,
      ang, s.color, power);
    if (s.kind !== 'shell') fx.impact(cx(s.x2), cy(s.y2), s.color);
  }
  for (const h of g.fx.hits) {
    fx.burst(cx(h.x), cy(h.y), h.color, Math.min(2.2, 0.7 + h.r * 0.55));
  }
  for (const f of g.fx.floats) {
    if (f.kind === 'leak') flash = 1;
  }
}

/** Anell + guspires per a una acció del jugador sobre una casella. */
export function fxAt(x, y, color, kind = 'build') {
  const px = cx(x), py = cy(y);
  if (kind === 'build') {
    fx.ring(px, py, color, CELL * 0.2, 150, 2.4);
    fx.impact(px, py, color);
  } else if (kind === 'mutate') {
    fx.ring(px, py, color, CELL * 0.25, 190, 1.5);
    fx.ascend(px, py, color, 16);
  } else if (kind === 'fuse') {
    fx.ring(px, py, color, CELL * 0.3, 240, 1.1);
    fx.ring(px, py, '#ffffff', CELL * 0.15, 150, 1.6);
    fx.ascend(px, py, color, 26);
  } else if (kind === 'move') {
    fx.ring(px, py, color, CELL * 0.15, 120, 3);
  }
}

// ─────────────────────────────────────────────────────────────
export function draw(ctx, g, view, time) {
  const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
  lastTime = time;
  K = Math.max(1, 1 / cam.scale);

  const canvas = ctx.canvas;
  const vw = cam.viewW, vh = cam.viewH;

  // vigilància de rendiment: si va carregat, el bloom és el primer que cau
  frameAcc += dt * 1000; frameCount++;
  if (frameCount >= 90) {
    if (bloomOn && frameAcc / frameCount > 27) bloomOn = false;
    frameAcc = 0; frameCount = 0;
  }

  fx.update(dt);
  enemyTrails(g, view, dt);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);

  // ── 1 · fons, en espai de pantalla ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSpace(ctx, vw, vh, time);

  // ── 2 · món ──
  ctx.save();
  const shake = g.fx.shakes > 0 ? g.fx.shakes : 0;
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * 11 * shake, (Math.random() - 0.5) * 11 * shake);
  }
  ctx.translate(-cam.x, -cam.y);
  ctx.scale(cam.scale, cam.scale);

  drawBoard(ctx, time);
  drawCells(ctx, g, time);
  if (view.showPaths) drawPaths(ctx, g, time);
  drawGhost(ctx, g, view);
  drawPortals(ctx, g, time);
  drawCore(ctx, g, time);
  drawRanges(ctx, g, view);
  for (const t of g.towers.values()) drawTower(ctx, g, t, time, view, dt);
  drawEnemies(ctx, g, view, time);
  drawShots(ctx, g, view);
  drawHits(ctx, g, view);
  fx.draw(ctx, Math.max(1, K * 0.8));
  ctx.restore();

  // ── 3 · bloom ──
  if (bloomOn) applyBloom(ctx, canvas, vw, vh);

  // ── 4 · text i cursors, nítids per damunt del bloom ──
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * 11 * shake, (Math.random() - 0.5) * 11 * shake);
  }
  ctx.translate(-cam.x, -cam.y);
  ctx.scale(cam.scale, cam.scale);
  drawEnemyBars(ctx, g, view);
  drawCoreLabel(ctx, g);
  drawFloats(ctx, g);
  drawHover(ctx, g, view);
  drawPending(ctx, view, time);
  drawCursor(ctx, view, time);
  ctx.restore();

  // ── 5 · vinyeta i fogonada de dany ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVignette(ctx, vw, vh);
  if (g.fx.shakes > 0) g.fx.shakes = Math.max(0, g.fx.shakes - dt * 1.7);
}

function applyBloom(ctx, canvas, vw, vh) {
  const { bw, bh } = ensureBloom(vw, vh);
  bctx.clearRect(0, 0, bw, bh);
  bctx.drawImage(canvas, 0, 0, bw, bh);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.30;
  if (blurOk) ctx.filter = 'blur(6px)';
  ctx.drawImage(bloomCanvas, 0, 0, vw, vh);
  ctx.filter = 'none';
  ctx.restore();
}

// ── Fons ───────────────────────────────────────────────────
function drawSpace(ctx, vw, vh, time) {
  const grd = ctx.createLinearGradient(0, 0, vw, vh);
  grd.addColorStop(0, '#04060f');
  grd.addColorStop(0.55, '#070c1c');
  grd.addColorStop(1, '#050811');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, vw, vh);

  // nebuloses suaus
  for (const [nx, ny, c, r] of [[0.2, 0.1, 'rgba(58,214,255,0.055)', 0.8],
    [0.85, 0.9, 'rgba(255,110,231,0.05)', 0.9]]) {
    const g2 = ctx.createRadialGradient(vw * nx, vh * ny, 0, vw * nx, vh * ny, Math.max(vw, vh) * r);
    g2.addColorStop(0, c);
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, vw, vh);
  }

  // estrelles amb paral·laxi lligada al desplaçament de la càmera
  ctx.save();
  for (const s of STARS) {
    const px = ((s.x * vw - cam.x * s.d) % vw + vw) % vw;
    const py = ((s.y * vh - cam.y * s.d) % vh + vh) % vh;
    const tw = 0.55 + 0.45 * Math.sin(time * 0.0016 + s.tw);
    ctx.globalAlpha = tw * (0.25 + s.d * 0.7);
    ctx.fillStyle = s.d > 0.4 ? '#cfe6ff' : '#7fa4d8';
    ctx.beginPath();
    ctx.arc(px, py, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette(ctx, vw, vh) {
  const g2 = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
  g2.addColorStop(0, 'transparent');
  g2.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, vw, vh);

  if (flash > 0) {
    const f = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.2,
      vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    f.addColorStop(0, 'transparent');
    f.addColorStop(1, `rgba(255,40,70,${0.5 * flash})`);
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, vw, vh);
  }
}

/** Plataforma del tauler: dona un límit físic al camp de joc. */
function drawBoard(ctx, time) {
  ctx.save();
  const g2 = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  g2.addColorStop(0, '#060b1b');
  g2.addColorStop(0.5, '#081024');
  g2.addColorStop(1, '#050a18');
  ctx.fillStyle = g2;
  roundRect(ctx, 0, 0, BOARD_W, BOARD_H, 10);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(90,150,255,0.07)';
  ctx.lineWidth = 1 * K;
  ctx.beginPath();
  for (let x = 1; x < GRID_W; x++) { ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, BOARD_H); }
  for (let y = 1; y < GRID_H; y++) { ctx.moveTo(0, y * CELL); ctx.lineTo(BOARD_W, y * CELL); }
  ctx.stroke();

  // marques de cantonada a cada intersecció: textura de graella tècnica
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = 'rgba(120,180,255,0.16)';
  ctx.lineWidth = 1 * K;
  ctx.beginPath();
  for (let x = 1; x < GRID_W; x++) {
    for (let y = 1; y < GRID_H; y++) {
      const px = x * CELL, py = y * CELL;
      ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py);
      ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // vora lluminosa
  ctx.strokeStyle = 'rgba(80,170,255,0.5)';
  ctx.lineWidth = 2 * K;
  roundRect(ctx, 1, 1, BOARD_W - 2, BOARD_H - 2, 10);
  ctx.stroke();

  // línia d'escaneig ambiental
  const sy = ((time * 0.045) % (BOARD_H + 240)) - 120;
  const sg = ctx.createLinearGradient(0, sy - 70, 0, sy + 70);
  sg.addColorStop(0, 'rgba(90,200,255,0)');
  sg.addColorStop(0.5, 'rgba(90,200,255,0.055)');
  sg.addColorStop(1, 'rgba(90,200,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, sy - 70, BOARD_W, 140);
  ctx.restore();
}

function drawCells(ctx, g, time) {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = g.cells[idx(x, y)];
      if (c.t !== 'rock') continue;
      const px = x * CELL, py = y * CELL;
      const seed = (x * 31 + y * 17) % 7;

      ctx.save();
      ctx.fillStyle = '#0e1630';
      roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, 5);
      ctx.fill();
      // bisell: llum a dalt, ombra a baix
      ctx.strokeStyle = 'rgba(150,185,255,0.24)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + CELL - 5);
      ctx.lineTo(px + 4, py + 5);
      ctx.lineTo(px + CELL - 5, py + 5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(px + CELL - 4, py + 5);
      ctx.lineTo(px + CELL - 4, py + CELL - 4);
      ctx.lineTo(px + 5, py + CELL - 4);
      ctx.stroke();
      // esquerdes
      ctx.strokeStyle = 'rgba(180,205,255,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 8 + seed, py + 10);
      ctx.lineTo(px + CELL * 0.55, py + CELL * 0.5 + seed);
      ctx.lineTo(px + CELL - 9, py + CELL - 12 + (seed % 3));
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,180,240,0.13)';
      poly(ctx, cx(x), cy(y), CELL * 0.19, 5, (x + y) * 0.7);
      ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Dibuixa TOTES les rutes que pot agafar un enemic terrestre, no una mostra.
 * Les vuit preferències de desempat solen col·lapsar en 2 o 3 recorreguts
 * diferents, així que deduplicant-les el tauler queda net i, sobretot, honest:
 * no hi ha cap enemic que camini per on no hi ha línia.
 */
function drawPaths(ctx, g, time) {
  const colors = ['rgba(255,110,190,0.5)', 'rgba(120,220,255,0.45)', 'rgba(255,215,110,0.4)'];
  ctx.save();
  ctx.lineWidth = 3 * Math.max(1, K * 0.7);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = -(time * 0.035) % 20;
  for (const s of g.spawns) {
    const vistes = new Set();
    let i = 0;
    for (const p of ROUTE_PREFS) {
      const pts = tracePath(g.field, s, p);
      if (pts.length < 2) continue;
      const clau = pts.map((q) => `${q.x},${q.y}`).join(';');
      if (vistes.has(clau)) continue;          // aquesta ruta ja està pintada
      vistes.add(clau);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.globalAlpha = Math.max(0.35, 0.9 - i * 0.16);
      i++;
      ctx.beginPath();
      pts.forEach((pt, j) => (j ? ctx.lineTo(cx(pt.x), cy(pt.y)) : ctx.moveTo(cx(pt.x), cy(pt.y))));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Previsualització: com quedarien els camins si hi posessis una torre a la casella. */
function drawGhost(ctx, g, view) {
  const target = view.pending || view.ghost;
  if (!target || target.valid === false) return;
  const f = flowField(g.cells, g.core, { x: target.x, y: target.y }, view.ghostIgnore);
  ctx.save();
  ctx.strokeStyle = 'rgba(120,255,190,0.9)';
  ctx.lineWidth = 3.5 * Math.max(1, K * 0.7);
  ctx.setLineDash([5, 6]);
  ctx.lineJoin = 'round';
  for (const s of g.spawns) {
    const pts = tracePath(f, s, 0);
    if (pts.length < 2) continue;
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(cx(pt.x), cy(pt.y)) : ctx.moveTo(cx(pt.x), cy(pt.y))));
    ctx.stroke();
  }
  ctx.restore();
}

/** Entrades: vòrtexs girant, no pas triangles. */
function drawPortals(ctx, g, time) {
  for (const s of g.spawns) {
    const px = cx(s.x), py = cy(s.y);
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.0035 + s.y);
    ctx.save();
    ctx.translate(px, py);

    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, CELL * 0.62);
    gr.addColorStop(0, `rgba(255,120,170,${0.5 + pulse * 0.3})`);
    gr.addColorStop(0.5, 'rgba(255,60,120,0.16)');
    gr.addColorStop(1, 'transparent');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, CELL * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,110,150,0.85)';
    ctx.lineWidth = 2 * Math.max(1, K * 0.7);
    for (let i = 0; i < 3; i++) {
      const rot = time * 0.0022 * (i % 2 ? -1 : 1) + i * 2.1;
      ctx.beginPath();
      ctx.arc(0, 0, CELL * (0.22 + i * 0.12) + pulse * 2, rot, rot + 2.3);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,220,230,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(0, 0, CELL * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCore(ctx, g, time) {
  const { x, y, w, h } = g.core;
  const px = x * CELL, py = y * CELL, pw = w * CELL, ph = h * CELL;
  const mx = px + pw / 2, my = py + ph / 2;
  const frac = Math.max(0, g.coreHp / g.coreMax);
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.003);
  const hue = frac > 0.5 ? 185 : frac > 0.25 ? 40 : 0;

  ctx.save();
  // halo exterior
  const halo = ctx.createRadialGradient(mx, my, pw * 0.3, mx, my, pw * (1.3 + pulse * 0.2));
  halo.addColorStop(0, `hsla(${hue},100%,60%,0.32)`);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, pw * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // cos
  ctx.shadowColor = `hsla(${hue},100%,60%,${0.6 + pulse * 0.4})`;
  ctx.shadowBlur = 26 + pulse * 16;
  const grd = ctx.createRadialGradient(mx - pw * 0.1, my - ph * 0.1, 3, mx, my, pw * 0.8);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.3, `hsla(${hue},100%,74%,1)`);
  grd.addColorStop(0.7, `hsla(${hue},90%,45%,0.92)`);
  grd.addColorStop(1, `hsla(${hue},80%,22%,0.3)`);
  ctx.fillStyle = grd;
  poly(ctx, mx, my, pw * 0.44, 6, Math.PI / 6);
  ctx.fill();
  ctx.shadowBlur = 0;

  // esquerdes que creixen amb el dany
  const cracks = Math.round((1 - frac) * 6);
  if (cracks > 0) {
    ctx.strokeStyle = `rgba(0,0,0,${0.35 + (1 - frac) * 0.4})`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < cracks; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(a) * pw * 0.2, my + Math.sin(a) * pw * 0.2);
      ctx.lineTo(mx + Math.cos(a + 0.35) * pw * 0.42, my + Math.sin(a + 0.35) * pw * 0.42);
      ctx.stroke();
    }
  }

  // anells orbitals
  ctx.translate(mx, my);
  ctx.rotate(time * 0.0006);
  ctx.strokeStyle = `hsla(${hue},100%,82%,0.8)`;
  ctx.lineWidth = 2 * Math.max(1, K * 0.7);
  poly(ctx, 0, 0, pw * 0.56, 6, 0);
  ctx.stroke();
  ctx.rotate(-time * 0.0016);
  ctx.strokeStyle = `hsla(${hue},100%,90%,0.45)`;
  poly(ctx, 0, 0, pw * 0.68, 3, 0);
  ctx.stroke();
  // fragments en òrbita
  ctx.fillStyle = `hsla(${hue},100%,85%,0.9)`;
  for (let i = 0; i < 4; i++) {
    const a = time * 0.0012 + (i / 4) * Math.PI * 2;
    const rr = pw * 0.78;
    poly(ctx, Math.cos(a) * rr, Math.sin(a) * rr, 3.2, 3, a * 2);
    ctx.fill();
  }
  ctx.restore();

  // ona d'escut quan el nucli acaba de rebre
  if (g.fx.shakes > 0) {
    ctx.save();
    ctx.globalAlpha = g.fx.shakes * 0.7;
    ctx.strokeStyle = '#ff5b6e';
    ctx.lineWidth = 3 * Math.max(1, K * 0.7);
    ctx.beginPath();
    ctx.arc(mx, my, pw * (0.8 + (1 - g.fx.shakes) * 1.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCoreLabel(ctx, g) {
  const { x, y, w, h } = g.core;
  const mx = x * CELL + (w * CELL) / 2, my = y * CELL + (h * CELL) / 2;
  ctx.save();
  ctx.font = font(16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * K;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(`${g.coreHp}`, mx, my + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${g.coreHp}`, mx, my + 1);
  ctx.restore();
}

function drawRanges(ctx, g, view) {
  const show = [];
  if (view.selected && g.towers.has(view.selected)) show.push(g.towers.get(view.selected));
  if (view.hoverTower && view.hoverTower !== view.selected && g.towers.has(view.hoverTower))
    show.push(g.towers.get(view.hoverTower));
  for (const t of show) {
    const st = towerStats(g, t);
    ctx.save();
    const r = st.range * CELL;
    const gr = ctx.createRadialGradient(cx(t.x), cy(t.y), r * 0.55, cx(t.x), cy(t.y), r);
    gr.addColorStop(0, 'transparent');
    gr.addColorStop(1, st.color + '22');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx(t.x), cy(t.y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = st.color + 'cc';
    ctx.lineWidth = 2 * Math.max(1, K * 0.8);
    ctx.stroke();
    if (st.minRange) {
      ctx.beginPath();
      ctx.arc(cx(t.x), cy(t.y), st.minRange * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,90,90,0.8)';
      ctx.stroke();
    }
    ctx.restore();
  }
  const spot = view.pending || view.hover;
  if (view.buildKey && spot) {
    const def = TOWERS[view.buildKey];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx(spot.x), cy(spot.y), def.range * CELL, 0, Math.PI * 2);
    ctx.fillStyle = def.color + '14';
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = def.color + 'aa';
    ctx.lineWidth = 2 * Math.max(1, K * 0.8);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Torres ─────────────────────────────────────────────────
function drawTower(ctx, g, t, time, view, dt) {
  const def = TOWERS[t.key];
  const px = cx(t.x), py = cy(t.y);
  const sel = view.selected === t.id;
  const off = t.disabled > 0;

  if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
  if (t.spawnAnim > 0) t.spawnAnim = Math.max(0, t.spawnAnim - dt * 3);
  const grow = t.spawnAnim > 0 ? 1 + t.spawnAnim * 0.55 : 1;
  const r = CELL * 0.38;

  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = off ? 0.42 : (t.spawnAnim > 0 ? 1 - t.spawnAnim * 0.5 : 1);
  ctx.scale(grow, grow);

  // ombra projectada
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, -CELL * 0.42, -CELL * 0.38, CELL * 0.88, CELL * 0.9, 9);
  ctx.fill();

  // plataforma amb degradat
  const plat = ctx.createLinearGradient(0, -CELL * 0.45, 0, CELL * 0.45);
  plat.addColorStop(0, 'rgba(26,40,80,0.96)');
  plat.addColorStop(1, 'rgba(9,15,35,0.96)');
  ctx.fillStyle = plat;
  roundRect(ctx, -CELL * 0.45, -CELL * 0.45, CELL * 0.9, CELL * 0.9, 8);
  ctx.fill();
  ctx.strokeStyle = sel ? '#ffffff' : def.color + '88';
  ctx.lineWidth = (sel ? 2.6 : 1.4) * Math.max(1, K * 0.9);
  ctx.stroke();

  // punts de fixació als cantons
  ctx.fillStyle = 'rgba(140,180,255,0.35)';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(sx * CELL * 0.35, sy * CELL * 0.35, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // retrocés en la direcció oposada al tret
  const rec = t.recoil * 4;
  ctx.translate(-Math.cos(t.angle) * rec, -Math.sin(t.angle) * rec);

  ctx.shadowColor = def.color;
  ctx.shadowBlur = 10 + t.flash * 26;
  drawTowerBody(ctx, t, def, r, time);

  // anell de nivell (tier 2 i 3)
  if (def.tier >= 2) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = def.tier === 3 ? '#fff' : def.accent;
    ctx.lineWidth = (def.tier === 3 ? 2.4 : 1.6) * Math.max(1, K * 0.8);
    poly(ctx, 0, 0, CELL * 0.46, def.tier === 3 ? 6 : 8, time * (def.tier === 3 ? 0.0018 : -0.001));
    ctx.stroke();
    if (def.tier === 3) {
      ctx.strokeStyle = def.color + '99';
      poly(ctx, 0, 0, CELL * 0.53, 6, -time * 0.0011);
      ctx.stroke();
    }
  }
  ctx.restore();

  // barra de progrés cap a la mutació
  if (def.tier === 1 && t.totalKills > 0) {
    const p = Math.min(1, t.totalKills / 6);
    const bh = 4 * Math.max(1, K * 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, px - CELL * 0.36, py + CELL * 0.36, CELL * 0.72, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = p >= 1 ? '#7dffaf' : '#ffd24d';
    roundRect(ctx, px - CELL * 0.36, py + CELL * 0.36, CELL * 0.72 * p, bh, bh / 2);
    ctx.fill();
    if (p >= 1) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 0.006);
      ctx.strokeStyle = '#7dffaf';
      ctx.lineWidth = 1.6 * Math.max(1, K * 0.8);
      poly(ctx, px, py, CELL * 0.5, 4, time * 0.002);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (off) {
    ctx.save();
    ctx.fillStyle = '#ff5b6e';
    ctx.font = font(18);
    ctx.textAlign = 'center';
    ctx.fillText('✕', px, py - CELL * 0.42);
    ctx.restore();
  }
  if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 4);
}

function drawTowerBody(ctx, t, def, r, time) {
  const k = t.key;
  if (k === 'pulsar' || k === 'gel' || k === 'prisma') {
    const rot = time * (k === 'prisma' ? 0.006 : 0.003);
    ctx.strokeStyle = k === 'prisma' ? `hsl(${(time * 0.12) % 360},100%,70%)` : def.color;
    ctx.lineWidth = 3;
    poly(ctx, 0, 0, r, 3, rot);
    ctx.stroke();
    poly(ctx, 0, 0, r * 0.62, 3, -rot + Math.PI);
    ctx.stroke();
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
    core.addColorStop(0, '#fff');
    core.addColorStop(1, def.accent);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'morter' || k === 'incineradora' || k === 'supernova') {
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, def.accent);
    body.addColorStop(0.5, def.color);
    body.addColorStop(1, '#00000055');
    ctx.fillStyle = body;
    poly(ctx, 0, 0, r, 6, Math.PI / 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,12,28,0.82)';
    poly(ctx, 0, 0, r * 0.55, 6, Math.PI / 6);
    ctx.fill();
    ctx.save();
    ctx.rotate(t.angle);
    ctx.fillStyle = def.accent;
    roundRect(ctx, 0, -3.5, r * 1.15, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#00000066';
    roundRect(ctx, r * 0.95, -2.5, 5, 5, 2);
    ctx.fill();
    ctx.restore();
  } else if (k === 'arc' || k === 'cupula') {
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = time * 0.002 + (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
      ctx.fillStyle = def.accent;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3.4, 0, Math.PI * 2); ctx.fill();
      // arc elèctric entre puntes
      const b = a + (Math.PI * 2) / 3;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 0.01 + i);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.quadraticCurveTo(0, 0, Math.cos(b) * r, Math.sin(b) * r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = def.color + '88';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.stroke();
  } else if (k === 'bastio') {
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, def.accent);
    body.addColorStop(1, def.color);
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.8, -r * 0.8, r * 1.6, r * 1.6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,30,0.8)';
    roundRect(ctx, -r * 0.42, -r * 0.42, r * 0.84, r * 0.84, 3);
    ctx.fill();
    ctx.fillStyle = def.accent;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.lineTo(Math.cos(a + 0.35) * r * 1.2, Math.sin(a + 0.35) * r * 1.2);
      ctx.lineTo(Math.cos(a - 0.35) * r * 1.2, Math.sin(a - 0.35) * r * 1.2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (k === 'perforador' || k === 'criogenica' || k === 'rail') {
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, def.accent);
    body.addColorStop(1, def.color);
    ctx.fillStyle = body;
    poly(ctx, 0, 0, r * 0.85, 4, Math.PI / 4);
    ctx.fill();
    ctx.save();
    ctx.rotate(t.angle);
    ctx.fillStyle = def.accent;
    roundRect(ctx, -r * 0.2, -3, r * 1.5, 6, 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    roundRect(ctx, r * 0.9, -5, 8, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffffaa';
    roundRect(ctx, r * 1.25, -1.5, 3, 3, 1);
    ctx.fill();
    ctx.restore();
  } else if (k === 'xarxa' || k === 'ancoratge' || k === 'contrast' || k === 'amalgama') {
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = def.accent;
    for (let i = 0; i < 4; i++) {
      const a = time * 0.0025 + (i / 4) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = def.color;
    poly(ctx, 0, 0, r * 0.4, 4, time * 0.002);
    ctx.fill();
  } else {
    ctx.fillStyle = def.color;
    poly(ctx, 0, 0, r * 0.8, 5, time * 0.001);
    ctx.fill();
  }
}

// ── Enemics ────────────────────────────────────────────────
function enemyTrails(g, view, dt) {
  if (g.phase !== 'invasion') return;
  const a = view.tickAlpha;
  for (const e of g.enemies) {
    const def = ENEMIES[e.type];
    if (def.speed < 1.5 && !def.flying && !def.boss) continue;
    if (Math.random() > dt * 22) continue;
    const p = enemyPos(e, a); const ex = p.x, ey = p.y;
    fx.trail(cx(ex), cy(ey), def.color, def.boss ? 7 : 3);
  }
}

function drawEnemies(ctx, g, view, time) {
  const a = view.tickAlpha;
  for (const e of g.enemies) {
    const def = ENEMIES[e.type];
    const p = enemyPos(e, a); const ex = p.x, ey = p.y;
    const px = cx(ex), py = cy(ey);
    const flying = isFlying(g, e);
    const r = CELL * (def.boss ? 0.55 : def.small ? 0.2 : 0.28);

    ctx.save();
    // ombra a terra
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px + (flying ? 8 : 2), py + (flying ? 12 : r * 0.75),
      r * (flying ? 0.8 : 0.85), r * (flying ? 0.35 : 0.3), 0, 0, Math.PI * 2);
    ctx.fill();

    if (flying) ctx.translate(0, -6 + Math.sin(time * 0.006 + e.id) * 3);
    ctx.translate(px, py);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 12 + e.flash * 24;
    ctx.fillStyle = e.flash > 0.4 ? '#ffffff' : def.color;

    switch (def.cat) {
      case 'fast':
        ctx.rotate(Math.atan2(e.y - e.py, e.x - e.px) || 0);
        ctx.beginPath();
        ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.7, -r * 0.85);
        ctx.lineTo(-r * 0.25, 0); ctx.lineTo(-r * 0.7, r * 0.85);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath(); ctx.arc(r * 0.4, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
        break;
      case 'armor': {
        const grd = ctx.createLinearGradient(-r, -r, r, r);
        grd.addColorStop(0, e.flash > 0.4 ? '#fff' : '#d8e2f2');
        grd.addColorStop(1, def.color);
        ctx.fillStyle = grd;
        poly(ctx, 0, 0, r, 6, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        poly(ctx, 0, 0, r * 0.6, 6, 0); ctx.stroke();
        // reblons
        ctx.fillStyle = 'rgba(30,40,60,0.8)';
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.78, Math.sin(ang) * r * 0.78, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        if (def.boss) {
          ctx.strokeStyle = '#ffb3b3'; ctx.lineWidth = 2.5;
          poly(ctx, 0, 0, r * 1.25, 6, time * 0.001); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,80,80,0.5)';
          poly(ctx, 0, 0, r * 1.5, 3, -time * 0.0015); ctx.stroke();
        }
        break;
      }
      case 'air':
        ctx.rotate(Math.sin(time * 0.004 + e.id) * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r * 1.4, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 1.4, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(r * 1.4, 0); ctx.stroke();
        break;
      case 'split':
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.18, 0, Math.PI * 2); ctx.fill();
        break;
      case 'shift': {
        const rot = time * 0.003;
        poly(ctx, 0, 0, r, 5, rot); ctx.fill();
        ctx.strokeStyle = def.color + 'aa'; ctx.lineWidth = 1.6;
        poly(ctx, 0, 0, r * 1.5, 5, -rot); ctx.stroke();
        ctx.strokeStyle = def.color + '55';
        poly(ctx, 0, 0, r * 2, 5, rot * 0.5); ctx.stroke();
        break;
      }
      default: {
        const grd = ctx.createLinearGradient(-r, -r, r, r);
        grd.addColorStop(0, e.flash > 0.4 ? '#fff' : def.color);
        grd.addColorStop(1, '#00000066');
        ctx.fillStyle = grd;
        roundRect(ctx, -r, -r, r * 2, r * 2, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // efectes d'estat
    if (e.slow > 0 || e.root > 0 || e.stun > 0 || e.burn > 0) {
      ctx.save();
      ctx.translate(px, py);
      if (e.slow > 0) { ctx.strokeStyle = 'rgba(140,230,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      if (e.root > 0 || e.stun > 0) { ctx.strokeStyle = 'rgba(120,255,190,0.95)'; ctx.lineWidth = 2; poly(ctx, 0, 0, r * 1.7, 4, time * 0.004); ctx.stroke(); }
      if (e.burn > 0) {
        ctx.fillStyle = `rgba(255,140,40,${0.35 + Math.random() * 0.3})`;
        ctx.beginPath(); ctx.arc(0, -r * 1.3, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (e.flash > 0) e.flash = Math.max(0, e.flash - 0.07);
  }
}

/** Barres de vida i marques de blindatge: van a la passada nítida, fora del bloom. */
function drawEnemyBars(ctx, g, view) {
  const a = view.tickAlpha;
  for (const e of g.enemies) {
    const def = ENEMIES[e.type];
    const p = enemyPos(e, a); const ex = p.x, ey = p.y;
    const px = cx(ex), py = cy(ey);
    const r = CELL * (def.boss ? 0.55 : def.small ? 0.2 : 0.28);
    const flying = isFlying(g, e);
    const oy = flying ? -6 : 0;

    if (e.hp < e.maxHp) {
      const bw = CELL * (def.boss ? 1.4 : 0.6);
      const bh = 4.5 * Math.max(1, K * 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      roundRect(ctx, px - bw / 2, py + oy - r - 11, bw, bh, bh / 2);
      ctx.fill();
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = def.boss ? '#ff6060' : frac > 0.4 ? '#6bff9d' : '#ffd24d';
      roundRect(ctx, px - bw / 2, py + oy - r - 11, bw * frac, bh, bh / 2);
      ctx.fill();
    }
    if (def.armor > 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.8)';
      ctx.font = font(9, '600');
      ctx.textAlign = 'center';
      ctx.fillText(`🛡${def.armor}`, px, py + oy + r + 12);
    }
  }
}

function drawShots(ctx, g, view) {
  const a = Math.min(1, view.tickAlpha * 2.2);
  if (a >= 1) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const s of g.fx.shots) {
    const x1 = cx(s.x1), y1 = cy(s.y1), x2 = cx(s.x2), y2 = cy(s.y2);
    ctx.globalAlpha = 1 - a;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = s.color;
    if (s.kind === 'zap' || s.kind === 'hack') {
      ctx.lineWidth = (s.kind === 'hack' ? 2 : 3) * Math.max(1, K * 0.8);
      ctx.setLineDash(s.kind === 'hack' ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const seg = 5;
      for (let i = 1; i < seg; i++) {
        const t = i / seg;
        ctx.lineTo(lerp(x1, x2, t) + (Math.random() - 0.5) * 16, lerp(y1, y2, t) + (Math.random() - 0.5) * 16);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (s.kind === 'rail') {
      ctx.lineWidth = 11 * (1 - a);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * (1 - a) + 0.8;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (s.kind === 'shell') {
      const t = a;
      const bx = lerp(x1, x2, t), by = lerp(y1, y2, t) - Math.sin(t * Math.PI) * 34;
      const gr = ctx.createRadialGradient(bx, by, 0, bx, by, 8 * Math.max(1, K * 0.8));
      gr.addColorStop(0, '#fff');
      gr.addColorStop(1, s.color);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(bx, by, 5 * Math.max(1, K * 0.8), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.lineWidth = 3.5 * Math.max(1, K * 0.8);
      const t0 = Math.max(0, a - 0.35);
      ctx.beginPath();
      ctx.moveTo(lerp(x1, x2, t0), lerp(y1, y2, t0));
      ctx.lineTo(lerp(x1, x2, a), lerp(y1, y2, a));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHits(ctx, g, view) {
  const a = view.tickAlpha;
  ctx.save();
  for (const h of g.fx.hits) {
    const p = Math.min(1, a * 1.6);
    ctx.globalAlpha = (1 - p) * 0.85;
    ctx.strokeStyle = h.color;
    ctx.lineWidth = (4 * (1 - p) + 1) * Math.max(1, K * 0.7);
    ctx.beginPath();
    ctx.arc(cx(h.x), cy(h.y), h.r * CELL * (0.35 + p * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = h.color + '2b';
    ctx.fill();
  }
  ctx.restore();
}

function drawFloats(ctx, g) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  for (let i = g.fx.floats.length - 1; i >= 0; i--) {
    const f = g.fx.floats[i];
    f.life -= 0.022;
    if (f.life <= 0) { g.fx.floats.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.font = font(f.kind === 'leak' ? 21 : 14);
    const x = cx(f.x), y = cy(f.y) - (1.4 - f.life) * 36;
    ctx.lineWidth = 3 * K;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.kind === 'leak' ? '#ff5b6e' : f.kind === 'pierce' ? '#ffd24d' : '#ffffff';
    ctx.fillText(f.text, x, y);
  }
  ctx.restore();
}

function drawHover(ctx, g, view) {
  if (!view.hover || view.pending) return;
  markCell(ctx, view.hover.x, view.hover.y,
    view.hoverValid === false ? 'rgba(255,90,110,0.95)' : 'rgba(255,255,255,0.8)',
    view.hoverValid === false);
}

/** Objectiu pendent de confirmació (col·locació en dos temps, tàctil). */
function drawPending(ctx, view, time) {
  if (!view.pending) return;
  const { x, y, valid } = view.pending;
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.006);
  markCell(ctx, x, y, valid ? `rgba(125,255,175,${0.7 + pulse * 0.3})` : 'rgba(255,90,110,0.95)', !valid);
  ctx.save();
  ctx.strokeStyle = valid ? 'rgba(125,255,175,0.5)' : 'rgba(255,90,110,0.5)';
  ctx.lineWidth = 2 * Math.max(1, K * 0.8);
  ctx.beginPath();
  ctx.arc(cx(x), cy(y), CELL * (0.55 + pulse * 0.16), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Cursor de graella per jugar amb teclat. */
function drawCursor(ctx, view, time) {
  if (!view.kb || !view.cursor) return;
  const { x, y } = view.cursor;
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.005);
  ctx.save();
  ctx.strokeStyle = `rgba(255,214,77,${0.75 + pulse * 0.25})`;
  ctx.lineWidth = 2.5 * Math.max(1, K * 0.8);
  const p = x * CELL, q = y * CELL, L = CELL * 0.34, m = 3;
  const corners = [
    [p + m, q + m, 1, 1], [p + CELL - m, q + m, -1, 1],
    [p + m, q + CELL - m, 1, -1], [p + CELL - m, q + CELL - m, -1, -1],
  ];
  for (const [ax, ay, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(ax + sx * L, ay);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax, ay + sy * L);
    ctx.stroke();
  }
  ctx.restore();
}

function markCell(ctx, x, y, color, cross) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * Math.max(1, K * 0.8);
  roundRect(ctx, x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 6);
  ctx.stroke();
  if (cross) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 8, y * CELL + 8);
    ctx.lineTo((x + 1) * CELL - 8, (y + 1) * CELL - 8);
    ctx.moveTo((x + 1) * CELL - 8, y * CELL + 8);
    ctx.lineTo(x * CELL + 8, (y + 1) * CELL - 8);
    ctx.stroke();
  }
  ctx.restore();
}
