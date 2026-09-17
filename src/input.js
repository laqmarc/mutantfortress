// Entrada unificada: ratolí, tàctil (pinç, arrossegar, pulsació llarga)
// i joc complet amb teclat mitjançant un cursor de graella.
import { GRID_W, GRID_H, BASE_TOWERS } from './config.js';
import * as cameraMod from './camera.js';
import { cellFromScreen, zoomAt, zoomStep, panBy, fit, ensureCellVisible } from './camera.js';

const TAP_SLOP = 12;        // px de moviment per sota dels quals encara és un toc
const TAP_MS = 500;
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 320;

export const isCoarse = () =>
  window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export function initInput(api) {
  const { canvas, view } = api;
  const pointers = new Map();
  let gesture = null;            // null | 'pan' | 'pinch'
  let pinchDist = 0, pinchMid = { x: 0, y: 0 };
  let longTimer = null;
  let lastTap = { t: 0, x: -1, y: -1 };

  const localPos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const cancelLong = () => { clearTimeout(longTimer); longTimer = null; };

  // ── PUNTER ────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (ev) => {
    if (api.paused()) return;
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* punter ja alliberat */ }
    const p = localPos(ev);
    pointers.set(ev.pointerId, { ...p, sx: p.x, sy: p.y, t: performance.now(), type: ev.pointerType });

    if (pointers.size === 2) {
      cancelLong();
      gesture = 'pinch';
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.size === 1) {
      gesture = null;
      if (ev.pointerType !== 'mouse') {
        cancelLong();
        longTimer = setTimeout(() => {
          longTimer = null;
          gesture = 'long';
          const cell = cellFromScreen(p.x, p.y);
          if (cell) api.inspectCell(cell, p.x, p.y);
        }, LONG_PRESS_MS);
      }
    }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (api.paused()) return;
    const rec = pointers.get(ev.pointerId);
    const p = localPos(ev);

    if (!rec) {
      if (ev.pointerType === 'mouse') api.hoverAt(p.x, p.y);
      return;
    }
    rec.x = p.x; rec.y = p.y;

    if (gesture === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(d / pinchDist, mid.x, mid.y);
      panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
      pinchDist = d; pinchMid = mid;
      return;
    }
    if (gesture === 'long') return;

    const moved = Math.hypot(p.x - rec.sx, p.y - rec.sy);
    if (gesture === null && moved > TAP_SLOP) { gesture = 'pan'; cancelLong(); }
    if (gesture === 'pan') {
      panBy(p.x - (rec.px ?? rec.sx), p.y - (rec.py ?? rec.sy));
      api.clearHover();
    } else if (ev.pointerType === 'mouse') {
      api.hoverAt(p.x, p.y);
    }
    rec.px = p.x; rec.py = p.y;
  });

  const endPointer = (ev) => {
    const rec = pointers.get(ev.pointerId);
    pointers.delete(ev.pointerId);
    cancelLong();
    if (!rec) return;
    if (pointers.size === 0 && gesture === 'pinch') { gesture = null; return; }
    if (pointers.size > 0) return;

    const p = localPos(ev);
    const moved = Math.hypot(p.x - rec.sx, p.y - rec.sy);
    const quick = performance.now() - rec.t < TAP_MS;
    const wasTap = gesture === null && moved <= TAP_SLOP && quick;
    gesture = null;
    if (!wasTap) return;

    const cell = cellFromScreen(p.x, p.y);
    if (!cell) return;
    handleTap(cell, rec.type, p);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (ev) => {
    pointers.delete(ev.pointerId);
    cancelLong();
    gesture = null;
  });
  canvas.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse') api.clearHover();
  });

  function handleTap(cell, type, p) {
    view.kb = false;
    api.hideTooltip();

    if (type === 'mouse') { api.commitCell(cell); return; }

    const positional = view.mode === 'build' || view.mode === 'move';

    // doble toc per apropar, només quan no hi ha cap col·locació en marxa
    const now = performance.now();
    if (!positional && now - lastTap.t < DOUBLE_TAP_MS && lastTap.x === cell.x && lastTap.y === cell.y) {
      lastTap = { t: 0, x: -1, y: -1 };
      zoomAt(cameraMod.isFitted() ? 2.2 : 1 / 2.2, p.x, p.y);
      return;
    }
    lastTap = { t: now, x: cell.x, y: cell.y };

    if (!positional) { api.commitCell(cell); return; }

    // construint i toques una torre existent → la selecciona, com al ratolí
    if (view.mode === 'build' && api.towerAtCell(cell)) { api.commitCell(cell); return; }

    // tàctil + acció posicional → dos temps: primer apuntar, després confirmar
    if (view.pending && view.pending.x === cell.x && view.pending.y === cell.y) {
      api.commitCell(cell);
      api.setPending(null);
    } else {
      api.setPending(cell);
    }
  }

  // ── RODETA ────────────────────────────────────────────────
  canvas.addEventListener('wheel', (ev) => {
    if (api.paused()) return;
    ev.preventDefault();
    const p = localPos(ev);
    zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }, { passive: false });

  // ── TECLAT ────────────────────────────────────────────────
  function moveCursor(dx, dy, big) {
    view.kb = true;
    api.hideTooltip();
    const step = big ? 3 : 1;
    const c = view.cursor || { x: 0, y: 0 };
    view.cursor = {
      x: Math.min(GRID_W - 1, Math.max(0, c.x + dx * step)),
      y: Math.min(GRID_H - 1, Math.max(0, c.y + dy * step)),
    };
    ensureCellVisible(view.cursor.x, view.cursor.y);
    api.cursorMoved();
  }

  function cycleTowers(back) {
    const g = api.getGame();
    const list = [...g.towers.values()].sort((a, b) => a.id - b.id);
    if (!list.length) return;
    const cur = list.findIndex((t) => t.id === view.selected);
    const next = list[((cur === -1 ? (back ? -1 : 0) : cur + (back ? -1 : 1)) + list.length) % list.length];
    view.kb = true;
    view.cursor = { x: next.x, y: next.y };
    ensureCellVisible(next.x, next.y);
    api.selectTower(next.id);
  }

  window.addEventListener('keydown', (ev) => {
    if (api.paused()) return;
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    const k = ev.key;
    const low = typeof k === 'string' ? k.toLowerCase() : '';

    // Esc no ha de portar mai preventDefault (requisit de disseny 2 de Playables):
    // YouTube el necessita per als seus propis controls.
    if (k === 'Escape') { api.cancel(); return; }
    if (api.modalOpen()) {
      if (k === 'Enter' || k === ' ') { ev.preventDefault(); api.confirmModal(); }
      return;
    }

    switch (k) {
      case 'ArrowUp': case 'w': case 'W': ev.preventDefault(); return moveCursor(0, -1, ev.shiftKey);
      case 'ArrowDown': case 's': case 'S': ev.preventDefault(); return moveCursor(0, 1, ev.shiftKey);
      case 'ArrowLeft': case 'a': case 'A': ev.preventDefault(); return moveCursor(-1, 0, ev.shiftKey);
      case 'ArrowRight': case 'd': case 'D': ev.preventDefault(); return moveCursor(1, 0, ev.shiftKey);
      case 'Enter':
        ev.preventDefault();
        view.kb = true;
        if (view.cursor) api.commitCell(view.cursor);
        return;
      case ' ':
        ev.preventDefault();
        return api.endTurn();
      case 'Tab':
        ev.preventDefault();
        return cycleTowers(ev.shiftKey);
      case '+': case '=': ev.preventDefault(); return zoomStep(1.25);
      case '-': case '_': ev.preventDefault(); return zoomStep(1 / 1.25);
      case '0': ev.preventDefault(); return fit();
    }

    if (k >= '1' && k <= '4') {
      ev.preventDefault();
      const key = BASE_TOWERS[+k - 1];
      const sel = api.selectedTower();
      if (view.mode === 'transform' && sel) api.action('transform-to', sel, key);
      else api.pickBuild(key);
      return;
    }

    const sel = api.selectedTower();
    switch (low) {
      case 'p': return api.togglePaths();
      case 'o': return api.overload();
      case 'v': return api.cycleSpeed();
      case 'h': return api.help();
      case 'm': if (sel) api.action('mutate-key', sel, ev.shiftKey ? 1 : 0); return;
      case 'f': if (sel) api.action('fusionar', sel); return;
      case 'r': if (sel) api.action('mover', sel); return;
      case 't': if (sel) api.action('transformar', sel); return;
      case 'u': if (sel) api.action('millorar', sel); return;
      case 'x': if (sel) api.action('reciclar', sel); return;
    }
  });

  // el cursor comença al costat del nucli
  const g0 = api.getGame();
  view.cursor = { x: Math.max(0, g0.core.x - 3), y: g0.core.y };
}
