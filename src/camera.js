// Càmera del tauler: enquadrament, zoom i desplaçament.
// Les coordenades «pantalla» són px lògics del canvas (0..viewW, 0..viewH).
import { GRID_W, GRID_H, CELL } from './config.js';

export const BOARD_W = GRID_W * CELL;
export const BOARD_H = GRID_H * CELL;

export const cam = {
  x: 0, y: 0,           // cantonada superior esquerra visible, en px de pantalla
  scale: 1,
  minScale: 1,          // escala que encabeix tot el tauler
  maxScale: 4,
  viewW: BOARD_W,
  viewH: BOARD_H,
  ready: false,
};

const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Reajusta la càmera quan canvia la mida del canvas, conservant el zoom relatiu. */
export function resize(w, h) {
  const rel = cam.ready ? cam.scale / cam.minScale : 1;
  cam.viewW = Math.max(1, w);
  cam.viewH = Math.max(1, h);
  cam.minScale = Math.min(cam.viewW / BOARD_W, cam.viewH / BOARD_H);
  cam.maxScale = cam.minScale * 4;
  cam.scale = clampNum(cam.minScale * rel, cam.minScale, cam.maxScale);
  cam.ready = true;
  clamp();
}

export function clamp() {
  const bw = BOARD_W * cam.scale, bh = BOARD_H * cam.scale;
  cam.x = bw <= cam.viewW ? (bw - cam.viewW) / 2 : clampNum(cam.x, 0, bw - cam.viewW);
  cam.y = bh <= cam.viewH ? (bh - cam.viewH) / 2 : clampNum(cam.y, 0, bh - cam.viewH);
}

/** Torna a veure tot el tauler. */
export function fit() {
  cam.scale = cam.minScale;
  clamp();
}

export const isFitted = () => cam.scale <= cam.minScale * 1.02;

/** Fa zoom mantenint fix el punt de pantalla indicat (centre del pinç o del cursor). */
export function zoomAt(factor, sx, sy) {
  const ns = clampNum(cam.scale * factor, cam.minScale, cam.maxScale);
  const k = ns / cam.scale;
  cam.x = (cam.x + sx) * k - sx;
  cam.y = (cam.y + sy) * k - sy;
  cam.scale = ns;
  clamp();
}

export function zoomStep(factor) {
  zoomAt(factor, cam.viewW / 2, cam.viewH / 2);
}

export function panBy(dx, dy) {
  cam.x -= dx;
  cam.y -= dy;
  clamp();
}

export function screenToWorld(sx, sy) {
  return { x: (sx + cam.x) / cam.scale, y: (sy + cam.y) / cam.scale };
}

export function worldToScreen(wx, wy) {
  return { x: wx * cam.scale - cam.x, y: wy * cam.scale - cam.y };
}

/** Casella de la graella sota un punt de pantalla, o null si és fora del tauler. */
export function cellFromScreen(sx, sy) {
  const w = screenToWorld(sx, sy);
  const x = Math.floor(w.x / CELL), y = Math.floor(w.y / CELL);
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H ? { x, y } : null;
}

/** Centra la vista en una casella (per al cursor de teclat i el saltar entre torres). */
export function centerOnCell(x, y) {
  cam.x = (x + 0.5) * CELL * cam.scale - cam.viewW / 2;
  cam.y = (y + 0.5) * CELL * cam.scale - cam.viewH / 2;
  clamp();
}

/** Desplaça el mínim imprescindible perquè una casella quedi visible amb marge. */
export function ensureCellVisible(x, y, margin = CELL) {
  const s = cam.scale;
  const left = x * CELL * s - cam.x, right = (x + 1) * CELL * s - cam.x;
  const top = y * CELL * s - cam.y, bottom = (y + 1) * CELL * s - cam.y;
  const m = margin * s;
  if (left < m) cam.x -= m - left;
  else if (right > cam.viewW - m) cam.x += right - (cam.viewW - m);
  if (top < m) cam.y -= m - top;
  else if (bottom > cam.viewH - m) cam.y += bottom - (cam.viewH - m);
  clamp();
}
