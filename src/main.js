// Punt d'entrada: arrencada, bucle, integració amb YouTube Playables
// i pont entre l'entrada de l'usuari i el motor de joc.
import { TICK_MS, TOWERS, COST, EMERGENCY_MULT, WAVE_COUNT, MUTATE_KILLS } from './config.js';
import { inBounds, isCoreCell, allSpawnsConnected } from './grid.js';
import {
  createGame, startPlanning, startInvasion, invasionTick, buildTower, moveTower,
  transformTower, mutateTower, fuseTowers, recycleTower, overload, towerAt, cellAt,
  canFusePair, logMsg, mutationOptions, upgradeTower,
} from './game.js';
import { resizeCanvas, getContext, draw, fxFromTick, fxAt } from './render.js';
import * as fxp from './fx.js';
import * as audio from './audio.js';
import { zoomStep, fit, cellFromScreen, centerOnCell } from './camera.js';
import { initInput, isCoarse } from './input.js';
import * as UI from './ui.js';
import * as platform from './platform.js';
import { serialize, restore, peek } from './save.js';
import { t, towerName, setLang, onLangChange, normalizeLang } from './i18n.js';

platform.installErrorReporting();

const canvas = document.getElementById('board');
const ctx = getContext(canvas);
const wrap = document.getElementById('canvasWrap');

let g = createGame();
let best = 0;
let snapshot = null;
let undoSnapshot = null;

const view = {
  mode: 'idle',          // idle | build | move | fuse | transform
  buildKey: null,
  selected: null,
  hover: null,
  hoverValid: null,
  hoverTower: null,
  ghost: null,
  ghostIgnore: null,
  pending: null,         // objectiu pendent de confirmació (tàctil)
  cursor: null,          // cursor de graella (teclat)
  kb: false,
  showPaths: true,
  tickAlpha: 1,
  speed: 1,
  baseSpeed: 1,
};

let lastTickAt = 0;
let running = false;     // invasió en curs
let paused = false;      // pausa demanada per YouTube
let rafId = 0;

// ── MIDA DEL TAULER ────────────────────────────────────────
function syncSize() { resizeCanvas(canvas); schedule(); }
syncSize();
if (window.ResizeObserver) new ResizeObserver(syncSize).observe(wrap);
window.addEventListener('resize', syncSize);
window.addEventListener('orientationchange', () => setTimeout(syncSize, 250));

// ── BUCLE ──────────────────────────────────────────────────
function loop(time) {
  rafId = 0;
  if (paused) return;                 // ni lògica ni render mentre YouTube ens pausa
  if (g.phase === 'invasion' && running) {
    const dur = TICK_MS / view.speed;
    const since = time - lastTickAt;
    view.tickAlpha = Math.min(1, since / dur);
    if (since >= dur) {
      lastTickAt = time;
      view.tickAlpha = 0;
      invasionTick(g);
      afterTick();
    }
  } else {
    view.tickAlpha = 1;
  }
  draw(ctx, g, view, time);
  schedule();
}

function schedule() {
  if (!rafId && !paused) rafId = requestAnimationFrame(loop);
}

function afterTick() {
  fxFromTick(g);
  playTickSounds(g);
  audio.tickPulse(g.tick);
  UI.renderTop(g);
  UI.renderLog(g);
  if (view.selected != null) UI.renderInspector(g, view, onAction);
  if (g.phase === 'defeat') { running = false; endGame(false); }
  else if (g.phase === 'victory') { running = false; endGame(true); }
  else if (g.phase === 'planning') { running = false; audio.sfx('waveClear'); enterPlanning(); }
}

/**
 * Un tic pot generar desenes d'esdeveniments sonors. Es limiten a dues repeticions
 * per tipus i sis en total: si no, a 8x la invasio es converteix en soroll blanc.
 */
function playTickSounds(g) {
  if (!g.fx.sounds.length) return;
  const seen = new Map();
  let total = 0;
  for (const id of g.fx.sounds) {
    if (total >= 6) break;
    const c = seen.get(id) || 0;
    if (c >= 2) continue;
    seen.set(id, c + 1);
    total++;
    audio.sfx(id);
  }
}

// ── PAUSA I REPRESA (requisit d'integració 6) ──────────────
platform.onPause(() => {
  paused = true;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  audio.setPaused(true);
  flushSave();
});
platform.onResume(() => {
  if (!paused) return;
  paused = false;
  audio.setPaused(false);
  lastTickAt = performance.now();     // el temps aturat no compta com a tics perduts
  schedule();
});

// ── DESAT AL NÚVOL ─────────────────────────────────────────
// Es desa als límits de fase: punt de represa honest sense congelar enemics a mig vol.
function autosave(extra = {}) {
  snapshot = serialize(g, { best, ...extra });
  platform.saveData(snapshot);
}
function flushSave() {
  if (snapshot) platform.saveData(snapshot);
}

// ── FASES ──────────────────────────────────────────────────
function enterPlanning(fromSave = false) {
  resetMode();
  view.speed = view.baseSpeed;
  document.getElementById('btnSpeed').textContent = `${view.speed}×`;
  document.getElementById('btnEnd').textContent = t('ui.startInvasion');
  UI.banner(t('banner.wave', { n: g.wave + 1 }));
  audio.startMusic('planning', g.wave);
  if (g.pendingEvent) audio.sfx('event');
  if (!fromSave) autosave();
  refreshAll();
  const hint = tutorialHint() || { key: 'ui.planningHint', params: { n: g.energy } };
  UI.setHint(hint.key, hint.params);
  schedule();
}

function enterInvasion() {
  undoSnapshot = null;
  startInvasion(g);
  running = true;
  lastTickAt = performance.now();
  resetMode();
  document.getElementById('btnEnd').textContent = t('ui.resolve');
  UI.banner(t('banner.invasion'));
  audio.sfx('waveStart');
  audio.startMusic('invasion', g.wave);
  refreshAll();
  const hint = tutorialHint() || { key: 'ui.invasionHint', params: { n: EMERGENCY_MULT } };
  UI.setHint(hint.key, hint.params);
  schedule();
}

function tutorialHint() {
  if (g.stats.mutations > 0) return null;
  if (!g.towers.size) return { key: 'tutorial.build' };
  if (g.phase === 'invasion' && g.wave === 0) return { key: 'tutorial.invasion' };
  const kills = Math.max(...[...g.towers.values()].map((tower) => tower.totalKills), 0);
  if ([...g.towers.values()].some((tower) => tower.totalKills >= MUTATE_KILLS)) {
    return { key: 'tutorial.mutate', params: { n: MUTATE_KILLS } };
  }
  return { key: 'tutorial.progress', params: { n: kills, total: MUTATE_KILLS } };
}

function endGame(won) {
  const score = UI.finalScore(g);
  best = Math.max(best, score);
  // primer el desat, després la puntuació: han de coincidir (requisit d'integració 3)
  autosave({ done: true });
  platform.sendScore(best);
  audio.stopMusic();
  audio.sfx(won ? 'victory' : 'defeat');
  UI.showModal(UI.endHtml(g, won, best));
  document.querySelector('[data-restart]').onclick = () => newGame();
  document.querySelector('[data-same-seed]').onclick = () => newGame(g.seed);
}

function planAction(action) {
  const before = g.phase === 'planning' ? serialize(g) : null;
  const result = action();
  if (result?.ok && before) undoSnapshot = before;
  return result;
}

function undoPlanning() {
  if (g.phase !== 'planning' || !undoSnapshot) return false;
  const restored = restore(undoSnapshot);
  if (!restored?.game) return false;
  g = restored.game;
  undoSnapshot = null;
  fxp.reset();
  resetMode();
  autosave();
  refreshAll();
  UI.setHint('ui.undone');
  schedule();
  return true;
}

function newGame(seed, endless = false, difficulty = 'normal') {
  g = createGame(seed, { endless, difficulty });
  undoSnapshot = null;
  fxp.reset();
  view.selected = null;
  view.cursor = { x: Math.max(0, g.core.x - 3), y: g.core.y };
  resetMode();
  running = false;
  UI.hideModal();
  startPlanning(g);
  centerOnCell(g.core.x - 2, g.core.y);
  enterPlanning();
}

function resumeGame(restored) {
  g = restored;
  undoSnapshot = null;
  fxp.reset();
  view.selected = null;
  view.cursor = { x: Math.max(0, g.core.x - 3), y: g.core.y };
  resetMode();
  running = false;
  UI.hideModal();
  logMsg(g, 'log.saveLoaded', { n: g.wave + 1 }, 'good');
  logMsg(g, 'log.phasePlanning', { n: g.wave + 1, total: g.endless ? '∞' : WAVE_COUNT }, 'phase');
  centerOnCell(g.core.x - 2, g.core.y);
  enterPlanning(true);
}

function resetMode() {
  view.mode = 'idle';
  view.buildKey = null;
  view.ghost = null;
  view.ghostIgnore = null;
  setPending(null);
}

function refreshAll() {
  UI.renderTop(g);
  UI.renderUndo(g, !!undoSnapshot);
  UI.renderPalette(g, view, pickBuild);
  UI.renderInspector(g, view, onAction);
  UI.renderEvent(g);
  UI.renderWavePreview(g);
  UI.renderWaveReport(g);
  UI.renderLog(g);
}

// ── VALIDACIÓ DE COL·LOCACIÓ ───────────────────────────────
/** Clau del motiu pel qual no s'hi pot col·locar, o null si és vàlid. */
function placementIssue(x, y, ignoreId) {
  if (!inBounds(x, y)) return 'err.outOfMap';
  const c = cellAt(g, x, y);
  if (c.t === 'rock') return 'err.rubble';
  if (isCoreCell(g.core, x, y)) return 'err.isCore';
  if (c.tower != null && c.tower !== ignoreId) return 'err.occupied';
  if (g.spawns.some((s) => s.x === x && s.y === y)) return 'err.isSpawn';
  if (ignoreId != null) {
    const tw = g.towers.get(ignoreId);
    if (tw && Math.max(Math.abs(tw.x - x), Math.abs(tw.y - y)) > 3) return 'err.tooFarShort';
  }
  if (!allSpawnsConnected(g.cells, g.core, g.spawns, { x, y }, ignoreId)) return 'err.wouldSealShort';
  return null;
}
const buildValid = (x, y, ignoreId) => placementIssue(x, y, ignoreId) === null;

// ── ACCIÓ SOBRE UNA CASELLA ────────────────────────────────
function commitCell(cell) {
  const tw = towerAt(g, cell.x, cell.y);

  if (view.mode === 'build' && view.buildKey) {
    if (tw) { selectTower(tw.id); return; }
    const r = planAction(() => buildTower(g, view.buildKey, cell.x, cell.y));
    if (!r.ok) { audio.sfx('error'); UI.setHint(r.msg, r.params, true); }
    else {
      const still = g.scrap >= TOWERS[view.buildKey].cost
        && g.energy >= COST.build * (g.phase === 'invasion' ? EMERGENCY_MULT : 1);
      if (!still) { view.mode = 'idle'; view.buildKey = null; }
      audio.sfx('build');
      fxAt(cell.x, cell.y, TOWERS[r.tower.key].color, 'build');
      UI.setHint('ui.deployed', { name: towerName(r.tower.key), n: g.energy });
    }
    view.ghost = null;
    setPending(null);
    return refreshAll();
  }

  if (view.mode === 'move' && view.selected != null) {
    const src = g.towers.get(view.selected);
    const r = planAction(() => moveTower(g, src, cell.x, cell.y));
    if (!r.ok) { audio.sfx('error'); UI.setHint(r.msg, r.params, true); }
    else {
      view.mode = 'idle';
      audio.sfx('move');
      fxAt(cell.x, cell.y, TOWERS[src.key].color, 'move');
      UI.setHint('ui.relocated', { n: g.energy });
    }
    view.ghost = null;
    setPending(null);
    return refreshAll();
  }

  if (view.mode === 'fuse' && view.selected != null) {
    const a = g.towers.get(view.selected);
    if (tw && canFusePair(g, a, tw)) {
      const ax = a.x, ay = a.y;
      const r = planAction(() => fuseTowers(g, a, tw));
      if (!r.ok) { audio.sfx('error'); UI.setHint(r.msg, r.params, true); }
      else {
        audio.sfx('fuse');
        fxAt(ax, ay, TOWERS[r.key].color, 'fuse');
        UI.banner(towerName(r.key).toUpperCase());
        view.mode = 'idle';
      }
    } else {
      audio.sfx('error');
      UI.setHint('ui.fuseError', null, true);
    }
    return refreshAll();
  }

  selectTower(tw ? tw.id : null);
}

function selectTower(id) {
  view.mode = 'idle';
  view.buildKey = null;
  view.ghost = null;
  setPending(null);
  view.selected = id;
  if (id != null) {
    const tw = g.towers.get(id);
    if (tw) view.cursor = { x: tw.x, y: tw.y };
    UI.openTab('build');
    UI.scrollSheetTop();     // al mòbil el full pot venir desplaçat de l'ús anterior
  }
  refreshAll();
}

function setPending(cell) {
  if (!cell) {
    view.pending = null;
    UI.setConfirm(null);
    return;
  }
  const ignore = view.mode === 'move' ? view.selected : null;
  const issue = placementIssue(cell.x, cell.y, ignore);
  view.pending = { x: cell.x, y: cell.y, valid: !issue };
  view.ghostIgnore = ignore;
  const what = view.mode === 'move'
    ? t('ui.move', { name: towerName(g.towers.get(view.selected).key) })
    : t('ui.place', { name: towerName(view.buildKey) });
  const where = `${cell.x + 1},${cell.y + 1}`;
  UI.setConfirm(
    issue
      ? `${what} ${t('ui.at')} ${where} — <span class="no">${t(issue)}</span>`
      : `${what} ${t('ui.at')} <b>${where}</b>`,
    !issue,
  );
}

// ── ACCIONS DE L'INSPECTOR ─────────────────────────────────
function pickBuild(key) {
  if (view.buildKey === key) { view.buildKey = null; view.mode = 'idle'; }
  else { view.buildKey = key; view.mode = 'build'; view.selected = null; }
  view.ghost = null;
  setPending(null);
  refreshAll();
  audio.sfx('click');
  if (view.buildKey) {
    UI.openTab('build');
    UI.setHint(isCoarse() ? 'ui.placeHintTouch' : 'ui.placeHintMouse', { name: towerName(key) });
  }
}

function onAction(act, tw, arg) {
  switch (act) {
    case 'mover':
      view.mode = 'move'; view.buildKey = null; view.ghostIgnore = tw.id;
      setPending(null);
      UI.setHint('ui.moveHint', { name: towerName(tw.key) });
      break;
    case 'mutate-to': {
      const r = planAction(() => mutateTower(g, tw, arg));
      if (!r.ok) { audio.sfx('error'); return UI.setHint(r.msg, r.params, true); }
      audio.sfx('mutate');
      fxAt(tw.x, tw.y, TOWERS[r.key].color, 'mutate');
      UI.banner(towerName(r.key).toUpperCase());
      break;
    }
    // des del teclat: 0 = opció dominant, 1 = alternativa
    case 'mutate-key': {
      const opts = mutationOptions(tw);
      if (!opts.length) { audio.sfx('error'); return UI.setHint('err.needKills', { n: MUTATE_KILLS, have: tw.totalKills }, true); }
      return onAction('mutate-to', tw, opts[Math.min(arg, opts.length - 1)]);
    }
    case 'transformar':
      view.mode = view.mode === 'transform' ? 'idle' : 'transform';
      break;
    case 'transform-to': {
      const r = planAction(() => transformTower(g, tw, arg));
      view.mode = 'idle';
      if (!r.ok) { audio.sfx('error'); return UI.setHint(r.msg, r.params, true); }
      audio.sfx('build');
      fxAt(tw.x, tw.y, TOWERS[tw.key].color, 'build');
      break;
    }
    case 'fusionar':
      view.mode = 'fuse';
      UI.setHint('ui.fuseHint', { name: towerName(tw.key) });
      break;
    case 'millorar': {
      const r = planAction(() => upgradeTower(g, tw));
      if (!r.ok) { audio.sfx('error'); return UI.setHint(r.msg, r.params, true); }
      audio.sfx('build');
      fxAt(tw.x, tw.y, TOWERS[tw.key].accent, 'build');
      UI.setHint('ui.upgraded', { name: towerName(tw.key), n: r.lvl });
      break;
    }
    case 'deseleccionar':
      audio.sfx('click');
      view.selected = null;
      break;
    case 'reciclar':
      audio.sfx('recycle');
      fxAt(tw.x, tw.y, TOWERS[tw.key].color, 'move');
      planAction(() => recycleTower(g, tw));
      view.selected = null; view.mode = 'idle';
      break;
  }
  refreshAll();
}

// ── PONT AMB L'ENTRADA ─────────────────────────────────────
function hoverAt(sx, sy) {
  view.kb = false;
  const cell = cellFromScreen(sx, sy);
  view.hover = cell;
  view.hoverValid = null;
  view.ghost = null;
  view.hoverTower = null;
  if (!cell) return UI.hideTooltip();

  if (view.mode === 'build' || view.mode === 'move') {
    const ignore = view.mode === 'move' ? view.selected : null;
    const ok = buildValid(cell.x, cell.y, ignore);
    view.hoverValid = ok;
    view.ghost = { x: cell.x, y: cell.y, valid: ok };
    view.ghostIgnore = ignore;
    UI.hideTooltip();
    return;
  }
  showCellTooltip(cell, sx, sy);
}

function showCellTooltip(cell, sx, sy) {
  const r = canvas.getBoundingClientRect();
  const box = wrap.getBoundingClientRect();
  const lx = sx + (r.left - box.left), ly = sy + (r.top - box.top);

  let bestE = null, bd = 0.7;
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - cell.x, e.y - cell.y);
    if (d < bd) { bd = d; bestE = e; }
  }
  if (bestE) return UI.showTooltip(UI.enemyTooltip(g, bestE), lx, ly);
  const tw = towerAt(g, cell.x, cell.y);
  if (tw) { view.hoverTower = tw.id; return UI.showTooltip(UI.towerTooltip(g, tw), lx, ly); }
  UI.hideTooltip();
}

function cursorMoved() {
  const c = view.cursor;
  view.hover = c;
  if (view.mode === 'build' || view.mode === 'move') {
    const ignore = view.mode === 'move' ? view.selected : null;
    const ok = buildValid(c.x, c.y, ignore);
    view.hoverValid = ok;
    view.ghost = { x: c.x, y: c.y, valid: ok };
    view.ghostIgnore = ignore;
  } else {
    view.hoverValid = null;
    view.ghost = null;
    const tw = towerAt(g, c.x, c.y);
    view.hoverTower = tw ? tw.id : null;
  }
  schedule();
}

function cancel() {
  if (UI.modalOpen()) return UI.hideModal();
  if (view.pending) { setPending(null); UI.setHint('ui.placeCancelled'); return; }
  resetMode();
  view.selected = null;
  UI.hideTooltip();
  refreshAll();
}

function endTurn() {
  if (g.phase === 'planning') enterInvasion();
  else if (g.phase === 'invasion') {
    view.speed = 8;
    document.getElementById('btnSpeed').textContent = '8×';
  }
}

function togglePaths() {
  view.showPaths = !view.showPaths;
  document.getElementById('btnPaths').classList.toggle('on', view.showPaths);
  schedule();
}

function cycleSpeed() {
  view.speed = view.speed >= 8 ? 1 : view.speed * 2;
  view.baseSpeed = view.speed;
  document.getElementById('btnSpeed').textContent = `${view.speed}×`;
}

function doOverload() {
  const r = planAction(() => overload(g));
  audio.sfx(r.ok ? 'overload' : 'error');
  if (r.ok) UI.setHint('ui.overloadDone', { n: g.energy });
  else UI.setHint(r.msg, r.params, true);
  refreshAll();
}

function help() {
  UI.showModal(UI.introHtml());
  document.querySelector('[data-close]').onclick = () => UI.hideModal();
}

initInput({
  canvas,
  view,
  getGame: () => g,
  paused: () => paused,
  commitCell,
  setPending,
  towerAtCell: (cell) => towerAt(g, cell.x, cell.y),
  hoverAt,
  clearHover: () => { view.hover = null; view.ghost = null; view.hoverTower = null; UI.hideTooltip(); },
  hideTooltip: UI.hideTooltip,
  inspectCell: (cell, sx, sy) => { view.hoverTower = null; showCellTooltip(cell, sx, sy); },
  cursorMoved,
  selectTower,
  selectedTower: () => (view.selected != null ? g.towers.get(view.selected) : null),
  action: onAction,
  undo: undoPlanning,
  pickBuild,
  cancel,
  endTurn,
  togglePaths,
  overload: doOverload,
  cycleSpeed,
  help,
  redraw: schedule,
  modalOpen: UI.modalOpen,
  confirmModal: () => {
    const b = document.querySelector('[data-resume]')
      || document.querySelector('[data-close]')
      || document.querySelector('[data-restart]');
    if (b) b.click();
  },
});

// ── BOTONS ─────────────────────────────────────────────────
document.getElementById('btnEnd').onclick = endTurn;
document.getElementById('btnUndo').onclick = undoPlanning;
document.getElementById('btnPaths').onclick = togglePaths;
document.getElementById('btnSpeed').onclick = cycleSpeed;
document.getElementById('btnHelp').onclick = help;
document.getElementById('btnLang').onclick = () => UI.cycleLang();
document.getElementById('btnMusic').onclick = (ev) => {
  const on = !audio.settings.music;
  audio.setMusicEnabled(on);
  ev.currentTarget.classList.toggle('on', on);
};
document.getElementById('btnSfx').onclick = (ev) => {
  const on = !audio.settings.sfx;
  audio.setSfxEnabled(on);
  ev.currentTarget.classList.toggle('on', on);
  if (on) audio.sfx('click');
};
document.getElementById('zoomIn').onclick = () => { zoomStep(1.3); schedule(); };
document.getElementById('zoomOut').onclick = () => { zoomStep(1 / 1.3); schedule(); };
document.getElementById('zoomFit').onclick = () => { fit(); schedule(); };
document.getElementById('confirmYes').onclick = () => { if (view.pending) commitCell(view.pending); };
document.getElementById('confirmNo').onclick = () => setPending(null);
document.querySelectorAll('#tabbar button').forEach((b) => {
  b.onclick = () => UI.openTab(b.dataset.tab);
});

onLangChange(() => {
  UI.renderStatic();
  UI.refreshHint();
  document.getElementById('btnEnd').textContent =
    t(g.phase === 'invasion' ? 'ui.resolve' : 'ui.startInvasion');
  refreshAll();
  if (UI.modalOpen()) help();
});

// El context d'audio nomes es pot crear des d'un gest de l'usuari.
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, function once() {
    audio.unlock();
    for (const e2 of ['pointerdown', 'keydown']) window.removeEventListener(e2, once);
  }, { once: false });
}

// ── ARRENCADA ──────────────────────────────────────────────
async function boot() {
  // La pantalla de càrrega ja és visible i diu explícitament que està carregant.
  platform.firstFrameReady();
  setLang(normalizeLang(platform.getLanguage() || 'en'));
  UI.renderStatic();

  const raw = await platform.loadData();
  const meta = raw ? peek(raw) : null;
  const resumable = meta && !meta.done && meta.wave > 0 ? meta : null;
  if (meta) best = meta.best || 0;

  refreshAll();
  centerOnCell(g.core.x - 2, g.core.y);
  draw(ctx, g, view, performance.now());

  document.getElementById('loading').classList.add('gone');
  UI.showModal(UI.introHtml(resumable ? resumable.wave : null));

  const close = document.querySelector('[data-close]');
  const selectedDifficulty = () => document.querySelector('[data-difficulty]')?.value || 'normal';
  if (close) close.onclick = () => newGame(undefined, false, selectedDifficulty());
  const endless = document.querySelector('[data-endless]');
  if (endless) endless.onclick = () => newGame(undefined, true, selectedDifficulty());
  const res = document.querySelector('[data-resume]');
  if (res) {
    res.onclick = () => {
      const r = restore(raw);
      if (r && r.game) { best = r.best || best; resumeGame(r.game); }
      else newGame();                 // desat il·legible: comencem net, sense petar
    };
  }

  // Ja hi ha un menú interactuable: YouTube pot treure el seu indicador de càrrega.
  platform.gameReady();
  schedule();
}

boot();
