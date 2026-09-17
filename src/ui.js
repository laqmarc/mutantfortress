// Interfície DOM: paleta, inspector, esdeveniments, registre i modals.
// Cap text literal: tot passa per i18n.js.
import {
  TOWERS, ENEMIES, EVENTS, BASE_TOWERS, DIFFICULTIES, WAVE_COUNT, waveAt, COST, TRANSFORM_SCRAP, FUSE_SCRAP,
  MUTATE_KILLS, EMERGENCY_MULT, UPGRADE,
} from './config.js';
import {
  towerStats, killProfile, mutationOptions, canMutate, canFusePair, fusionResult,
  canUpgrade, upgradeCost,
  upcomingComposition,
} from './game.js';
import {
  t, towerName, towerDesc, towerTags, enemyName, enemyDesc, waveName,
  eventName, eventText, getLang, setLang, LANGS, LANG_LABEL,
} from './i18n.js';

const $ = (id) => document.getElementById(id);
const CAT_COLOR = {
  basic: '#5ad0c0', fast: '#ffe14d', armor: '#a8b4c6',
  air: '#ff63c4', split: '#7dff5a', shift: '#a06bff',
};

let lastRes = { energy: -1, scrap: -1, core: -1 };

/** Textos fixos del document (títols de panell, etiquetes, tooltips dels botons). */
export function renderStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const s = t(el.dataset.i18nTitle);
    el.title = s;
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', s);
  });
  $('btnLang').textContent = LANG_LABEL[nextLang()];
  $('btnLang').title = t('ui.lang');
}

function nextLang() {
  const i = LANGS.indexOf(getLang());
  return LANGS[(i + 1) % LANGS.length];
}

export function cycleLang() {
  setLang(nextLang());
}

export function renderTop(g) {
  $('seedLabel').textContent = t('ui.seed', { seed: g.seed });
  $('energyVal').textContent = g.energy;
  $('resEnergy').querySelector('.max').textContent = `/${g.maxEnergy}`;
  $('scrapVal').textContent = g.scrap;
  $('coreVal').textContent = g.coreHp;
  $('resCore').querySelector('.max').textContent = `/${g.coreMax}`;

  bump($('resEnergy'), g.energy, lastRes.energy);
  bump($('resScrap'), g.scrap, lastRes.scrap);
  bump($('resCore'), g.coreHp, lastRes.core, true);
  lastRes = { energy: g.energy, scrap: g.scrap, core: g.coreHp };

  const wi = Math.min(g.wave, WAVE_COUNT - 1);
  $('waveVal').textContent = g.wave + 1;
  $('waveName').textContent = g.wave >= WAVE_COUNT
    ? t('ui.endlessWave', { n: g.wave + 1 })
    : waveName(wi);
  $('waveBar').style.width = `${Math.min(100, (g.wave / WAVE_COUNT) * 100)}%`;

  const tag = $('phaseTag');
  const inv = g.phase === 'invasion';
  tag.textContent = t(inv ? 'ui.phaseInvasion' : 'ui.phasePlanning');
  tag.className = inv ? 'phase-invasion' : 'phase-planning';
}

function bump(el, now, before, hurtOnDrop = false) {
  if (before < 0 || now === before) return;
  const cls = hurtOnDrop && now < before ? 'hurt' : 'bump';
  el.classList.remove('bump', 'hurt');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 520);
}

export function renderPalette(g, view, onPick) {
  const el = $('palette');
  el.innerHTML = '';
  for (const key of BASE_TOWERS) {
    const d = TOWERS[key];
    const poor = g.scrap < d.cost || g.energy < COST.build * (g.phase === 'invasion' ? EMERGENCY_MULT : 1);
    const b = document.createElement('button');
    b.className = `tcard${view.buildKey === key ? ' sel' : ''}${poor ? ' poor' : ''}`;
    b.style.color = d.color;
    b.innerHTML = `
      <div class="glyph" style="background:${d.color}"></div>
      <div class="tname" style="color:${d.color}">${towerName(key)}</div>
      <div class="tcost">✦ ${d.cost} <span style="color:var(--amber)">⚡${COST.build}</span></div>
      <div class="tstat">${t('insp.damage')} ${d.dmg} · ${t('insp.range')} ${d.range.toFixed(1)}</div>`;
    b.onclick = () => onPick(key);
    b.title = towerDesc(key);
    el.appendChild(b);
  }
}

export function renderInspector(g, view, actions) {
  const body = $('inspectorBody');
  const tw = view.selected != null ? g.towers.get(view.selected) : null;
  // al mòbil la paleta i l'inspector comparteixen un full de 260 px: amb una
  // torre seleccionada, la paleta fa nosa i tapa els botons d'acció
  document.body.dataset.sel = tw ? 'tower' : (view.buildKey ? 'build' : 'none');

  if (!tw) {
    if (view.buildKey) {
      const key = view.buildKey;
      body.innerHTML = `
        ${headHtml(key)}
        <div class="insp-desc">${towerDesc(key)}</div>
        ${statsHtml(key, TOWERS[key])}
        ${tagsHtml(key)}
        <div class="hint">${t('ui.buildHint')}</div>`;
    } else {
      body.innerHTML = `<div class="hint">${t('ui.selectHint')}<br><br>
        ${t('ui.mutationHint', { n: MUTATE_KILLS })}</div>`;
    }
    return;
  }

  const d = TOWERS[tw.key];
  const st = towerStats(g, tw);
  const mutOpts = mutationOptions(tw);
  const ready = canMutate(g, tw);
  const m = g.phase === 'invasion' ? EMERGENCY_MULT : 1;

  let html = headHtml(tw.key, tw);
  html += `<div class="insp-desc">${towerDesc(tw.key)}</div>`;
  html += statsHtml(tw.key, st);
  html += tagsHtml(tw.key);
  html += killbarsHtml(tw);

  if (d.tier === 1) {
    if (ready && mutOpts.length) {
      const canPay = g.energy >= COST.mutate * m;
      html += `<div class="mutbox">
        <b>${t('insp.chooseMutation')}</b>
        <div class="mutopts">${mutOpts.map((k) => `
          <button class="mutopt" data-mut="${k}" ${canPay ? '' : 'disabled'}
                  style="--mc:${TOWERS[k].color}">
            <span class="mo-name">${towerName(k)}</span>
            <span class="mo-cost">⚡${COST.mutate * m}</span>
            <span class="mo-desc">${towerDesc(k)}</span>
          </button>`).join('')}</div>
        <span class="mo-note">${t(mutOpts.length > 1 ? 'insp.twoOptions' : 'insp.oneOption')}</span>
      </div>`;
    } else {
      html += `<div class="mutbox" style="border-color:var(--dim);background:rgba(255,255,255,.04)">
        ${t('insp.mutationProgress', { a: tw.totalKills, b: MUTATE_KILLS })}<br>
        <span style="color:var(--dim)">${t('insp.mutationDepends')}</span></div>`;
    }
  } else if (d.tier === 2) {
    const partner = findFusePartner(g, tw);
    html += `<div class="mutbox" style="border-color:var(--pink);background:rgba(255,110,231,.08)">
      ${partner
        ? t('insp.fusableWith', {
            a: towerName(partner.key),
            b: towerName(fusionResult(tw.key, partner.key)),
          })
        : `<span style="color:var(--dim)">${t('insp.needPartner')}</span>`}
    </div>`;
  }

  html += '<div class="acts">';
  html += btn('mover', `${t('insp.actMove')} <span class="cost">${t('insp.actMoveCost', { n: COST.move * m })}</span>`,
    g.energy >= COST.move * m);
  if (d.tier === 1) {
    html += btn('transformar', `${t('insp.actTransform')} <span class="cost">⚡${COST.transform * m} ✦${TRANSFORM_SCRAP}</span>`,
      g.energy >= COST.transform * m && g.scrap >= TRANSFORM_SCRAP);
  }
  if (d.tier === 2) {
    html += btn('fusionar', `${t('insp.actFuse')} <span class="cost">⚡${COST.fuse * m} ✦${FUSE_SCRAP}</span>`,
      !!findFusePartner(g, tw) && g.energy >= COST.fuse * m && g.scrap >= FUSE_SCRAP);
  }
  const potPujar = canUpgrade(g, tw);
  const cost = potPujar ? upgradeCost(tw) : 0;
  html += btn('millorar',
    `${t('insp.actUpgrade')} <span class="cost">${potPujar
      ? `⚡${UPGRADE.energy * m} ✦${cost} · ${t('insp.upgradeTo', { n: (tw.lvl || 1) + 1 })}`
      : t('insp.maxLevel')}</span>`,
    potPujar && g.energy >= UPGRADE.energy * m && g.scrap >= cost);
  html += btn('reciclar', `${t('insp.actRecycle')} <span class="cost">${t('insp.actRecycleCost')}</span>`, true, 'danger');
  html += '</div>';
  html += `<div class="mo-note" style="margin-top:7px">${t('insp.upgradeEffect')}</div>`;

  if (view.mode === 'transform') {
    html += '<div style="margin-top:10px" class="acts">';
    for (const k of BASE_TOWERS) {
      if (k === tw.key) continue;
      html += `<button data-tf="${k}" style="color:${TOWERS[k].color}">${towerName(k)}</button>`;
    }
    html += '</div>';
  }

  body.innerHTML = html;
  body.querySelectorAll('button[data-act]').forEach((b) => {
    b.onclick = () => actions(b.dataset.act, tw);
  });
  body.querySelectorAll('button[data-tf]').forEach((b) => {
    b.onclick = () => actions('transform-to', tw, b.dataset.tf);
  });
  body.querySelectorAll('button[data-mut]').forEach((b) => {
    b.onclick = () => actions('mutate-to', tw, b.dataset.mut);
  });
}

function btn(act, label, enabled, cls = '') {
  return `<button class="${cls}" data-act="${act}" ${enabled ? '' : 'disabled'}>${label}</button>`;
}

export function findFusePartner(g, tw) {
  for (const o of g.towers.values()) if (canFusePair(g, tw, o)) return o;
  return null;
}

function headHtml(key, tw = null) {
  const d = TOWERS[key];
  const tier = d.tier === 1 ? 'insp.base' : d.tier === 2 ? 'insp.mutation' : 'insp.fusion';
  const lvl = tw ? (tw.lvl || 1) : 1;
  return `<div class="insp-head">
    <div class="dot" style="background:${d.color};color:${d.color}"></div>
    <div class="nm" style="color:${d.color}">${towerName(key)}</div>
    ${lvl > 1 ? `<div class="lvl">${t('insp.level', { n: lvl })}</div>` : ''}
    <div class="tier" style="color:${d.tier === 3 ? '#fff' : d.accent}">${t(tier)}</div>
    ${tw ? `<button class="insp-close" data-act="deseleccionar"
              aria-label="${t('ui.cancel')}" title="${t('ui.cancel')}">✕</button>` : ''}
  </div>`;
}

function statsHtml(key, st) {
  const d = TOWERS[key];
  const rows = [
    [t('insp.damage'), st.dmgVar ? `${st.dmg - st.dmgVar}–${st.dmg + st.dmgVar}` : st.dmg],
    [t('insp.range'), st.range.toFixed(1) + (st.rangeBonus ? ` (+${st.rangeBonus.toFixed(1)})` : '') + (st.fog ? ' 🌫' : '')],
    [t('insp.rate'), `1/${d.cd} ${t(d.cd > 1 ? 'insp.ticks' : 'insp.tick')}`],
    [t('insp.air'), t(d.air ? 'insp.yes' : 'insp.no')],
  ];
  if (d.splash) rows.push([t('insp.area'), t('insp.radius', { n: d.splash })]);
  if (d.chain) rows.push([t('insp.chain'), t('insp.jumps', { n: d.chain })]);
  if (d.pierce) rows.push([t('insp.armour'), t('insp.armourIgnored')]);
  if (d.slow) rows.push([t('insp.slows'), t('insp.toPct', { n: Math.round(d.slow * 100) })]);
  if (d.burn) rows.push([t('insp.burn'), t('insp.perTick', { n: st.burn || d.burn })]);
  return `<div class="stats">${rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

function tagsHtml(key) {
  return `<div class="tags">${towerTags(key).map((x) => `<span class="tag">${x}</span>`).join('')}</div>`;
}

function killbarsHtml(tw) {
  if (!tw.totalKills) return `<div class="hint" style="margin-bottom:9px">${t('insp.noKills')}</div>`;
  const prof = killProfile(tw);
  const rows = Object.entries(tw.kills).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const pct = Math.round((v / tw.totalKills) * 100);
    const dom = k === prof ? 'font-weight:700' : '';
    return `<div class="killrow" style="${dom}">
      <span style="width:66px;color:${CAT_COLOR[k] || '#fff'}">${t(`cat.${k}`)}</span>
      <span class="kb"><i style="width:${pct}%;background:${CAT_COLOR[k] || '#fff'}"></i></span>
      <span style="width:26px;text-align:right">${v}</span></div>`;
  }).join('');
  return `<div class="killbars"><div style="font-size:11px;color:var(--dim);margin-bottom:4px;letter-spacing:1px">
    ${t('insp.killProfile', { n: tw.totalKills })}</div>${rows}</div>`;
}

export function renderEvent(g) {
  const p = $('eventPanel'), b = $('eventBody');
  if (!g.pendingEvent) {
    p.classList.remove('active');
    b.innerHTML = `<div class="hint">${t('ui.noEvent')}</div>`;
    return;
  }
  const e = g.pendingEvent;
  p.classList.add('active');
  b.innerHTML = `<div class="ev ${e.bad ? 'bad' : 'good'}">
    <div class="evi">${e.icon}</div>
    <div><div class="evn">${eventName(e.id)}</div><div class="evt">${eventText(e.id)}</div></div></div>`;
}

export function renderWavePreview(g) {
  const el = $('wavePreview');
  const comp = upcomingComposition(g);
  if (!comp.length) { el.innerHTML = '<div class="hint">—</div>'; return; }
  const w = waveAt(g.wave);
  el.innerHTML = comp.map(({ type, n, def }) => `
    <div class="wrow" title="${enemyDesc(type)}">
      <span class="wd" style="background:${def.color};color:${def.color}"></span>
      <span class="wn">${enemyName(type)}</span>
      <span class="wc">×${n}</span>
    </div>`).join('')
    + `<div class="hint" style="margin-top:7px">${t('wavePrev.hpMul', { n: w.hpMul.toFixed(2) })}</div>`;
}

export function renderWaveReport(g) {
  const panel = $('reportPanel');
  const el = $('waveReport');
  const report = g.lastWaveReport;
  if (!report) {
    panel.classList.add('hidden');
    el.innerHTML = t('report.none');
    return;
  }

  panel.classList.remove('hidden');
  const damage = Object.values(report.damageByTower).sort((a, b) => b.damage - a.damage);
  const kills = Object.entries(report.killsByCategory).sort((a, b) => b[1] - a[1]);
  const leaks = Object.entries(report.leakedByType).sort((a, b) => b[1] - a[1]);
  const totalKills = kills.reduce((sum, [, n]) => sum + n, 0);
  const totalLeaks = leaks.reduce((sum, [, n]) => sum + n, 0);
  const damageHtml = damage.length
    ? damage.map((row) => `<div>${towerName(row.key)} <b>${row.damage}</b></div>`).join('')
    : `<div>${t('report.none')}</div>`;
  const killsHtml = kills.length
    ? kills.map(([cat, n]) => `<div>${t(`report.cat.${cat}`)} <b>×${n}</b></div>`).join('')
    : `<div>${t('report.none')}</div>`;
  const leaksHtml = leaks.length
    ? leaks.map(([type, n]) => `<div>${enemyName(type)} <b>×${n}</b></div>`).join('')
    : `<div>${t('report.none')}</div>`;

  el.innerHTML = `
    <div>${t('report.ticks')} <b>${report.duration}</b> · ${t('report.kills')} <b>${totalKills}</b> · ${t('report.leaks')} <b>${totalLeaks}</b></div>
    <div style="margin-top:8px"><b>${t('report.damage')}</b>${damageHtml}</div>
    <div style="margin-top:8px"><b>${t('report.categories')}</b>${killsHtml}</div>
    <div style="margin-top:8px"><b>${t('report.leaks')}</b>${leaksHtml}</div>`;
}

/** Els registres es guarden com a clau + paràmetres i es tradueixen aquí. */
function formatLog(l) {
  const p = { ...(l.params || {}) };
  if (p.tower) p.name = towerName(p.tower);
  if (p.old) p.old = towerName(p.old);
  if (p.new) p.new = towerName(p.new);
  if (p.a) p.a = towerName(p.a);
  if (p.b) p.b = towerName(p.b);
  if (p.enemy) p.name = enemyName(p.enemy);
  if (p.waveIdx !== undefined) {
    p.name = p.waveIdx >= WAVE_COUNT
      ? t('ui.endlessWave', { n: p.waveIdx + 1 })
      : waveName(p.waveIdx);
  }
  if (p.event) {
    const ev = EVENTS.find((e) => e.id === p.event);
    p.icon = ev ? ev.icon : '';
    p.name = eventName(p.event);
    p.text = eventText(p.event);
  }
  return t(l.key, p);
}

export function renderLog(g) {
  $('log').innerHTML = g.log.map((l) => `<div class="${l.kind}">${formatLog(l)}</div>`).join('');
}

let lastHint = null;

/** Rep clau + paràmetres (no HTML) perquè es pugui retraduir en canviar d'idioma. */
export function setHint(key, params = null, isErr = false) {
  lastHint = { key, params, isErr };
  const el = $('actionHint');
  el.innerHTML = t(key, params);
  el.classList.remove('err');
  if (isErr) { void el.offsetWidth; el.classList.add('err'); }
}

export function refreshHint() {
  if (lastHint) setHint(lastHint.key, lastHint.params, false);
}

export function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(banner._t);
  banner._t = setTimeout(() => el.classList.add('hidden'), 1500);
}

export function setConfirm(html, valid = true) {
  const bar = $('confirmBar');
  if (!html) { bar.classList.add('hidden'); return; }
  $('confirmText').innerHTML = html;
  bar.classList.toggle('bad', !valid);
  bar.classList.remove('hidden');
}

/** Torna el full inferior a dalt de tot (al mòbil arrossega l'estat anterior). */
export function scrollSheetTop() {
  for (const id of ['left', 'right']) {
    const el = $(id);
    if (el) el.scrollTop = 0;
  }
}

export function openTab(tab) {
  document.body.dataset.tab = tab;
  document.querySelectorAll('#tabbar button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
  });
}

export function showTooltip(html, x, y) {
  const el = $('tooltip');
  el.innerHTML = html;
  el.classList.remove('hidden');
  const wrap = $('canvasWrap').getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.min(Math.max(8, x + 16), wrap.width - w - 8)}px`;
  el.style.top = `${Math.min(Math.max(8, y - h - 12), wrap.height - h - 8)}px`;
}
export function hideTooltip() { $('tooltip').classList.add('hidden'); }

export function enemyTooltip(g, e) {
  const d = ENEMIES[e.type];
  return `<div class="tt-name" style="color:${d.color}">${enemyName(e.type)}</div>
    <div class="tt-row">${t('insp.hpArmour', { hp: Math.max(0, Math.round(e.hp)), max: e.maxHp, armour: d.armor })}</div>
    <div class="tt-row">${t('insp.speedCells', { n: d.speed, d: d.leak })}</div>
    <div class="tt-row" style="margin-top:4px">${enemyDesc(e.type)}</div>`;
}

export function towerTooltip(g, tw) {
  const d = TOWERS[tw.key], st = towerStats(g, tw);
  return `<div class="tt-name" style="color:${d.color}">${towerName(tw.key)}</div>
    <div class="tt-row">${t('insp.damage')} <b>${d.dmg}</b> · ${t('insp.range')} <b>${st.range.toFixed(1)}</b> · ${t('insp.rate')} <b>1/${d.cd}</b></div>
    <div class="tt-row">${t('insp.kills')} <b>${tw.totalKills}</b>${d.tier === 1 ? ` ${t('insp.killsToMutate', { n: MUTATE_KILLS })}` : ''}</div>
    <div class="tt-row" style="margin-top:4px">${towerDesc(tw.key)}</div>`;
}

// ── MODALS ──
export function showModal(html) {
  $('modal').innerHTML = html;
  $('overlay').classList.remove('hidden');
}
export function hideModal() { $('overlay').classList.add('hidden'); }
export const modalOpen = () => !$('overlay').classList.contains('hidden');

/** @param resumeWave  si hi ha partida desada, l'onada on es reprendria. */
export function introHtml(resumeWave = null) {
  const li = (k) => `<li>${t(k)}</li>`;
  return `
  <h2>${t('ui.title')}</h2>
  <p class="lead">${t('modal.introLead')}</p>
  <div class="cols">
    <div>
      <h3>${t('modal.h.turns')}</h3>
      <ul>${li('modal.turns1')}${li('modal.turns2')}</ul>
      <h3>${t('modal.h.twist')}</h3>
      <ul><li>${t('modal.twist1', { n: MUTATE_KILLS })}</li>${li('modal.twist2')}${li('modal.twist3')}${li('modal.twist4')}</ul>
    </div>
    <div>
      <h3>${t('modal.h.map')}</h3>
      <ul>${li('modal.map1')}${li('modal.map2')}${li('modal.map3')}</ul>
      <h3>${t('modal.h.res')}</h3>
      <ul>${li('modal.res1')}${li('modal.res2')}${li('modal.res3')}</ul>
      <h3>${t('modal.h.controls')}</h3>
      <p>${t('modal.controlsTouch')}</p>
      <p style="margin-top:6px">${t('modal.controlsKeys')}</p>
    </div>
  </div>
  <p style="margin-top:16px">${t('modal.goal')}</p>
  <p class="hint">${t('modal.endlessGoal')}</p>
  <label class="hint" for="difficultySelect">${t('modal.difficulty')}</label>
  <select id="difficultySelect" data-difficulty>
    ${Object.entries(DIFFICULTIES).map(([key, d]) => `<option value="${key}"${key === 'normal' ? ' selected' : ''}>${t(d.label)}</option>`).join('')}
  </select>
  <div class="actions">
    ${resumeWave != null
      ? `<button class="primary" data-resume>${t('modal.resume', { n: resumeWave + 1 })}</button>
         <button data-close>${t('modal.newRun')}</button>
         <button data-endless>${t('modal.endless')}</button>`
      : `<button class="primary" data-close>${t('modal.start')}</button>
         <button data-endless>${t('modal.endless')}</button>`}
  </div>`;
}

export function endHtml(g, won, best = 0) {
  const score = finalScore(g);
  return `
  <h2 style="${won ? '' : '-webkit-background-clip:unset;background:none;color:var(--red)'}">
    ${t(won ? 'end.won' : 'end.lost')}</h2>
  <p class="lead">${won ? t('end.wonLead') : t('end.lostLead', { n: g.wave + 1 })}</p>
  <div class="endstats">
    <div class="endstat"><b>${g.wave}</b><span>${t('end.waves')}</span></div>
    <div class="endstat"><b>${g.stats.kills}</b><span>${t('end.kills')}</span></div>
    <div class="endstat"><b>${g.stats.mutations}</b><span>${t('end.mutations')}</span></div>
    <div class="endstat"><b>${g.stats.fusions}</b><span>${t('end.fusions')}</span></div>
  </div>
  <p>${t('end.score')} <b style="font-family:Orbitron;color:var(--amber);font-size:20px">${score}</b>
     · ${t('end.best', { n: Math.max(best, score) })}
     · <span class="kbd">${t('ui.seed', { seed: g.seed })}</span></p>
  <div class="actions">
    <button class="primary" data-restart>${t('end.restart')}</button>
    <button data-same-seed>${t('end.sameSeed')}</button>
  </div>`;
}

export function finalScore(g) {
  return g.coreHp * 100 + g.stats.kills * 5 + g.stats.mutations * 60 + g.stats.fusions * 150;
}
