// Embolcall del SDK de YouTube Playables.
// Fora de YouTube tot això són no-ops (o localStorage per poder provar-ho en local),
// de manera que el joc funciona igual servit des d'un servidor estàtic qualsevol.

const sdk = typeof window !== 'undefined' ? window.ytgame : undefined;

export const IN_PLAYABLES = !!(sdk && sdk.IN_PLAYABLES_ENV);
const LOCAL_KEY = 'fortalesamutant.save.v1';

let firstFrameSent = false;
let gameReadySent = false;
let loadPromise = null;
let loaded = false;

// ── Senyals de càrrega ─────────────────────────────────────
// firstFrameReady: hi ha una pantalla de càrrega visible.
// gameReady: el joc ja és interactuable (el menú inicial). YouTube no treu
// el seu indicador de càrrega fins que s'hi crida.
export function firstFrameReady() {
  if (firstFrameSent) return;
  firstFrameSent = true;
  try { sdk?.game?.firstFrameReady?.(); } catch (e) { logError(e); }
}

export function gameReady() {
  if (gameReadySent) return;
  gameReadySent = true;
  try { sdk?.game?.gameReady?.(); } catch (e) { logError(e); }
}

// ── Idioma ─────────────────────────────────────────────────
/** Locale de l'usuari segons YouTube. Mai no es toca navigator.language. */
export function getLanguage() {
  try {
    const l = sdk?.system?.getLanguage?.();
    return typeof l === 'string' ? l : null;
  } catch { return null; }
}

// ── Àudio ──────────────────────────────────────────────────
// El joc encara no té so, però es respecta el silenci de YouTube des del principi:
// qualsevol so futur ha de passar per audioEnabled().
let audioOn = true;
const audioListeners = new Set();

/** Només accepta booleans: el SDK en mode no-op crida el callback sense valor
 *  i, si ho prenguéssim com a «silenciat», el joc quedaria mut fora de YouTube. */
function setAudioOn(v) {
  if (typeof v !== 'boolean') return;
  if (v === audioOn) return;
  audioOn = v;
  for (const fn of audioListeners) fn(audioOn);
}

try { setAudioOn(sdk?.system?.isAudioEnabled?.()); } catch { /* fora de Playables */ }
try { sdk?.system?.onAudioEnabledChange?.(setAudioOn); } catch { /* fora de Playables */ }

/** Relectura sincrònica per si el valor ha canviat sense avisar. */
export function refreshAudioFlag() {
  try { setAudioOn(sdk?.system?.isAudioEnabled?.()); } catch { /* ignora */ }
}

export const audioEnabled = () => audioOn;
export function onAudioChange(fn) { audioListeners.add(fn); }

// ── Pausa i represa ────────────────────────────────────────
// Requisit: aturar TOTA l'execució (bucle, render, temporitzadors) fins a onResume.
// Prohibit fer servir la Page Visibility API per a això.
const pauseListeners = new Set();
const resumeListeners = new Set();
let pauseWired = false;

function wirePause() {
  if (pauseWired) return;
  pauseWired = true;
  try {
    sdk?.system?.onPause?.(() => { for (const fn of pauseListeners) fn(); });
    sdk?.system?.onResume?.(() => { for (const fn of resumeListeners) fn(); });
  } catch (e) { logError(e); }
}

export function onPause(fn) { pauseListeners.add(fn); wirePause(); }
export function onResume(fn) { resumeListeners.add(fn); wirePause(); }

// Fora de YouTube no hi ha res que dispari la pausa: aquest ganxo permet
// provar-la en local. Mai no s'exposa dins de Playables.
if (!IN_PLAYABLES && typeof window !== 'undefined') {
  window.__fmDebug = {
    pause: () => { for (const fn of pauseListeners) fn(); },
    resume: () => { for (const fn of resumeListeners) fn(); },
  };
}

// ── Desat al núvol ─────────────────────────────────────────
/** Cal esperar sempre loadData abans del primer saveData. */
export function loadData() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      if (IN_PLAYABLES) {
        const raw = await sdk.game.loadData();
        return typeof raw === 'string' && raw.length ? raw : null;
      }
      return localStorage.getItem(LOCAL_KEY);
    } catch (e) {
      logWarning(e);
      return null;
    } finally {
      loaded = true;
    }
  })();
  return loadPromise;
}

export async function saveData(raw) {
  if (!loaded) await loadData();
  try {
    if (IN_PLAYABLES) await sdk.game.saveData(raw);
    else localStorage.setItem(LOCAL_KEY, raw);
    return true;
  } catch (e) {
    logWarning(e);
    return false;
  }
}

export async function clearSave() {
  return saveData('');
}

// ── Puntuació ──────────────────────────────────────────────
/** La millor puntuació enviada ha de coincidir amb la del desat (requisit d'integració 3). */
export function sendScore(value) {
  if (!Number.isFinite(value) || value < 0) return;
  try { sdk?.engagement?.sendScore?.({ value: Math.round(value) }); } catch (e) { logWarning(e); }
}

// ── Salut ──────────────────────────────────────────────────
export function logError(err) {
  try { sdk?.health?.logError?.(); } catch { /* ignora */ }
  if (!IN_PLAYABLES) console.error(err);
}
export function logWarning(err) {
  try { sdk?.health?.logWarning?.(); } catch { /* ignora */ }
  if (!IN_PLAYABLES) console.warn(err);
}

export function installErrorReporting() {
  window.addEventListener('error', (ev) => logError(ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason));
}
