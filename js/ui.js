// js/ui.js — UI DOM Rendering Logic
import { getCache, getDraft } from './cache.js';
import { fmt, esc } from './utils.js';
import { updateProgressCharts, updateMeasProgressChart } from './charts.js';

export function renderDash(onClickDay) {
  const c = getCache();
  const lst = document.getElementById('dashList');
  lst.innerHTML = '';
  if (!c.days || c.days.length === 0) {
    lst.innerHTML = '<div class="empty">No Workout Days yet.</div>';
    return;
  }
  c.days.forEach(d => {
    const el = document.createElement('div');
    el.className = 'card card-clickable';
    el.innerHTML = `
      <div style="padding: 1rem 1.25rem;">
        <h3 style="margin-bottom: 0.2rem; font-family: var(--fd); font-size: 1.3rem; letter-spacing: 0.5px;">${esc(d.name)}</h3>
        <div class="muted" style="font-size: 0.85rem;">${d.exercises ? d.exercises.length : 0} Exercises</div>
      </div>
    `;
    el.onclick = () => onClickDay(d.id);
    lst.appendChild(el);
  });
}

export function renderDay(dayId, onClickEx) {
  const c = getCache();
  const d = c.days.find(x => x.id === dayId);
  if (!d) return;
  document.getElementById('dayTitle').innerText = d.name;
  const lst = document.getElementById('dayExList');
  lst.innerHTML = '';
  if (!d.exercises || d.exercises.length === 0) {
    lst.innerHTML = '<div class="empty">No Exercises yet.</div>';
    return;
  }
  d.exercises.forEach(e => {
    const el = document.createElement('div');
    el.className = 'card ex-item';
    let summary = 'No history';
    if (e.history && e.history.length > 0) {
      const last = e.history[0];
      const maxW = Math.max(...last.sets.map(s => s.weight));
      summary = `Last: ${fmt(last.date)} • Max: ${maxW}`;
    }
    el.innerHTML = `
      <div class="ex-info">
        <div class="ex-name">${esc(e.name)}</div>
        <div class="ex-summary">${summary}</div>
      </div>
      <div>❯</div>
    `;
    el.onclick = () => onClickEx(d.id, e.id);
    lst.appendChild(el);
  });
}

export function renderEx(dayId, exId, onClickEditDraft, onClickDeleteDraft) {
  const c = getCache();
  const d = c.days.find(x => x.id === dayId);
  if (!d) return;
  const e = d.exercises.find(x => x.id === exId);
  if (!e) return;
  document.getElementById('exTitle').innerText = e.name;
  
  // Render Draft Sets
  const draftSets = getDraft(exId);
  const curLst = document.getElementById('curSetList');
  curLst.innerHTML = '';
  if (draftSets.length === 0) {
    curLst.innerHTML = '<div class="empty">No sets logged yet.</div>';
  } else {
    draftSets.forEach((s, i) => {
      const r = document.createElement('div');
      r.className = 'set-row';
      r.innerHTML = `
        <div class="set-num">${i + 1}</div>
        <div class="set-val">${s.reps} × ${s.weight}</div>
        <div class="set-actions">
          <button class="btn btn-ghost" onclick="window._ui.onClickEditDraft(${i})">✎</button>
          <button class="btn btn-ghost" style="color:var(--danger)" onclick="window._ui.onClickDeleteDraft(${i})">×</button>
        </div>
      `;
      curLst.appendChild(r);
    });
  }

  // Render History List
  const histLst = document.getElementById('histList');
  histLst.innerHTML = '';
  if (!e.history || e.history.length === 0) {
    histLst.innerHTML = '<div class="empty">No history.</div>';
  } else {
    e.history.slice(0, 10).forEach(h => {
      const card = document.createElement('div');
      card.className = 'hist-card';
      let html = `<div class="hist-date">${fmt(h.date)}</div>`;
      h.sets.forEach((s, i) => {
        html += `<div class="hist-set"><span class="muted">${i+1}.</span> ${s.reps} × ${s.weight}</div>`;
      });
      card.innerHTML = html;
      histLst.appendChild(card);
    });
  }

  // Bind to global for inline onclick handlers above
  window._ui = { onClickEditDraft, onClickDeleteDraft };
}

export function renderProg(dayId, exId) {
  const c = getCache();
  const d = c.days.find(x => x.id === dayId);
  if (!d) return;
  const e = d.exercises.find(x => x.id === exId);
  if (!e) return;
  document.getElementById('progTitle').innerText = e.name;
  updateProgressCharts(e);
}

export function renderMeasurements(onClickMeas) {
  const c = getCache();
  const lst = document.getElementById('measList');
  lst.innerHTML = '';
  if (!c.measurements || c.measurements.length === 0) {
    lst.innerHTML = '<div class="empty">No measurements yet.</div>';
    return;
  }
  c.measurements.forEach(m => {
    const el = document.createElement('div');
    el.className = 'card ex-item';
    let valStr = 'No entries';
    if (m.entries && m.entries.length > 0) {
      valStr = `${m.entries[0].val} ${m.entries[0].unit}`;
    }
    el.innerHTML = `
      <div class="ex-info">
        <div class="ex-name">${esc(m.name)}</div>
        <div class="ex-summary">${valStr}</div>
      </div>
      <div>❯</div>
    `;
    el.onclick = () => onClickMeas(m.id);
    lst.appendChild(el);
  });
}

export function renderMeasurementDetail(measId, onClickDeleteEntry) {
  const c = getCache();
  const m = c.measurements.find(x => x.id === measId);
  if (!m) return;
  document.getElementById('measTitle').innerText = m.name;
  updateMeasProgressChart(m);
  
  const lst = document.getElementById('measEntryList');
  lst.innerHTML = '';
  if (!m.entries || m.entries.length === 0) {
    lst.innerHTML = '<div class="empty">No entries yet.</div>';
    return;
  }
  m.entries.forEach(e => {
    const el = document.createElement('div');
    el.className = 'set-row';
    el.innerHTML = `
      <div>
        <div style="font-weight:700;">${e.val} ${esc(e.unit)}</div>
        <div class="muted" style="font-size:0.8rem;">${fmt(e.date)}</div>
      </div>
      <button class="btn btn-ghost" style="color:var(--danger)" onclick="window._ui.onClickDeleteEntry('${e.id}')">×</button>
    `;
    lst.appendChild(el);
  });

  window._ui = window._ui || {};
  window._ui.onClickDeleteEntry = onClickDeleteEntry;
}
