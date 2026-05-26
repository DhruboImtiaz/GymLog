// js/app.js — Main App Entry Point
import { initAuth, signIn, signUp, signOut, getUser } from './auth.js';
import { fetchAllData, createDay, renameDay, deleteDay, createExercise, renameExercise, deleteExercise, saveSession, createMeasurement, renameMeasurement, deleteMeasurement, addMeasurementEntry, deleteMeasurementEntry } from './db.js';
import { getCache, loadCacheFromStorage, getDraft, setDraft, clearDraft } from './cache.js';
import { openModal, closeModal, toast, confirm2, setBtnLoading } from './helpers.js';
import { renderDash, renderDay, renderEx, renderProg, renderMeasurements, renderMeasurementDetail } from './ui.js';
import { uid, today } from './utils.js';

// State
let curPage = 'pageDashboard';
let curDayId = null;
let curExId = null;
let curMeasId = null;
let editSetIdx = -1; // -1 for new set, >=0 for edit

// ── Routing ──────────────────────────────────────────────────

function showApp() {
  document.getElementById('appLoader').style.display = 'none';
  document.getElementById('pageAuth').style.display = 'none';
  
  // Set user email in navbars
  const u = getUser();
  document.querySelectorAll('.nav-email').forEach(el => el.innerText = u ? u.email : '');
  
  goTo('pageDashboard');
}

function showAuth() {
  document.getElementById('appLoader').style.display = 'none';
  document.getElementById('pageAuth').style.display = 'flex';
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
}

window.goTo = function(pageId, push = true) {
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  const p = document.getElementById(pageId);
  if (p) p.classList.add('active');
  curPage = pageId;

  if (pageId === 'pageDashboard') renderDash(handleDayClick);
  else if (pageId === 'pageDay') renderDay(curDayId, handleExClick);
  else if (pageId === 'pageEx') renderEx(curDayId, curExId, handleEditDraftClick, handleDeleteDraftClick);
  else if (pageId === 'pageProg') renderProg(curDayId, curExId);
  else if (pageId === 'pageMeasurements') renderMeasurements(handleMeasClick);
  else if (pageId === 'pageMeasDetail') renderMeasurementDetail(curMeasId, handleDeleteMeasEntry);

  if (push) history.pushState({ pageId, curDayId, curExId, curMeasId }, '');
  window.scrollTo(0,0);
};

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.pageId) {
    curDayId = e.state.curDayId;
    curExId = e.state.curExId;
    curMeasId = e.state.curMeasId;
    goTo(e.state.pageId, false);
  }
});

// ── Auth Handlers ────────────────────────────────────────────

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(tab === 'login' ? 'authLogin' : 'authRegister').classList.add('active');
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const em = document.getElementById('loginEmail').value;
  const pw = document.getElementById('loginPass').value;
  const btn = document.getElementById('btnLogin');
  await signIn(em, pw, btn, async () => {
    document.getElementById('appLoader').style.display = 'flex';
    try { await fetchAllData(); showApp(); } catch (err) { toast('Error loading data'); }
  });
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const fullName = document.getElementById('regFullName').value.trim();
  const em = document.getElementById('regEmail').value;
  const pw = document.getElementById('regPass').value;
  const pwc = document.getElementById('regPassConfirm').value;
  const btn = document.getElementById('btnRegister');
  if (!fullName) return toast('Please enter your full name');
  if (pw !== pwc) return toast('Passwords do not match');
  await signUp(em, pw, fullName, btn, async () => {
    document.getElementById('appLoader').style.display = 'flex';
    try { await fetchAllData(); showApp(); } catch (err) { toast('Error loading data'); }
  });
};

window.handleLogout = async function() {
  document.getElementById('appLoader').style.display = 'flex';
  await signOut(() => showAuth());
};

// ── App Handlers (Click / Navigation) ─────────────────────────

function handleDayClick(id) { curDayId = id; goTo('pageDay'); }
function handleExClick(dId, eId) { curDayId = dId; curExId = eId; goTo('pageEx'); }
function handleMeasClick(id) { curMeasId = id; goTo('pageMeasDetail'); }

window.goDash = () => goTo('pageDashboard');
window.goDay = () => goTo('pageDay');
window.goEx = () => goTo('pageEx');
window.goMeas = () => goTo('pageMeasurements');

// ── Modals & Actions (Days) ───────────────────────────────────

window.openNewDay = () => { document.getElementById('inpNewDay').value = ''; openModal('modalNewDay'); };
window.saveNewDay = async () => {
  const v = document.getElementById('inpNewDay').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnSaveDay');
  setBtnLoading(btn, true);
  try {
    await createDay(v);
    closeModal('modalNewDay');
    renderDash(handleDayClick);
  } catch (err) { toast('Error creating day'); }
  finally { setBtnLoading(btn, false); }
};

window.openEditDay = () => {
  const c = getCache();
  const d = c.days.find(x => x.id === curDayId);
  if (!d) return;
  document.getElementById('inpEditDay').value = d.name;
  openModal('modalEditDay');
};
window.saveEditDay = async () => {
  const v = document.getElementById('inpEditDay').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnUpdateDay');
  setBtnLoading(btn, true);
  try {
    await renameDay(curDayId, v);
    closeModal('modalEditDay');
    renderDay(curDayId, handleExClick);
  } catch (err) { toast('Error updating day'); }
  finally { setBtnLoading(btn, false); }
};
window.delDay = () => {
  confirm2('Delete this day and all its data?', async () => {
    try {
      await deleteDay(curDayId);
      closeModal('modalEditDay');
      goDash();
    } catch (err) { toast('Error deleting day'); }
  });
};

// ── Modals & Actions (Exercises) ──────────────────────────────

window.openNewEx = () => { document.getElementById('inpNewEx').value = ''; openModal('modalNewEx'); };
window.saveNewEx = async () => {
  const v = document.getElementById('inpNewEx').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnSaveEx');
  setBtnLoading(btn, true);
  try {
    await createExercise(curDayId, v);
    closeModal('modalNewEx');
    renderDay(curDayId, handleExClick);
  } catch (err) { toast('Error creating exercise'); }
  finally { setBtnLoading(btn, false); }
};

window.openEditEx = () => {
  const c = getCache();
  const d = c.days.find(x => x.id === curDayId);
  const e = d?.exercises.find(x => x.id === curExId);
  if (!e) return;
  document.getElementById('inpEditEx').value = e.name;
  openModal('modalEditEx');
};
window.saveEditEx = async () => {
  const v = document.getElementById('inpEditEx').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnUpdateEx');
  setBtnLoading(btn, true);
  try {
    await renameExercise(curExId, v);
    closeModal('modalEditEx');
    renderEx(curDayId, curExId, handleEditDraftClick, handleDeleteDraftClick);
  } catch (err) { toast('Error updating exercise'); }
  finally { setBtnLoading(btn, false); }
};
window.delEx = () => {
  confirm2('Delete this exercise and its history?', async () => {
    try {
      await deleteExercise(curExId);
      closeModal('modalEditEx');
      goDay();
    } catch (err) { toast('Error deleting exercise'); }
  });
};

// ── Modals & Actions (Sets / Drafts) ──────────────────────────
// Note: Sets are draft-only (localStorage) until user hits "Save Workout to History"

window.openNewSet = () => {
  editSetIdx = -1;
  const r = document.getElementById('inpReps');
  const w = document.getElementById('inpWeight');
  const btn = document.getElementById('btnSaveSet');
  btn.innerText = 'Log Set';
  
  // Auto-fill from last draft set, or last history set
  const drafts = getDraft(curExId);
  if (drafts.length > 0) {
    const last = drafts[drafts.length - 1];
    r.value = last.reps;
    w.value = last.weight;
  } else {
    const c = getCache();
    const e = c.days.find(x => x.id === curDayId)?.exercises.find(x => x.id === curExId);
    if (e && e.history && e.history.length > 0) {
      const lastHistSet = e.history[0].sets[e.history[0].sets.length - 1];
      if (lastHistSet) {
        r.value = lastHistSet.reps;
        w.value = lastHistSet.weight;
      } else { r.value = ''; w.value = ''; }
    } else { r.value = ''; w.value = ''; }
  }
  openModal('modalSet');
  setTimeout(() => w.focus(), 50);
};

window.saveSet = () => {
  const r = parseFloat(document.getElementById('inpReps').value);
  const w = parseFloat(document.getElementById('inpWeight').value);
  if (isNaN(r) || isNaN(w)) return toast('Valid numbers required');
  
  const drafts = getDraft(curExId);
  if (editSetIdx >= 0) {
    drafts[editSetIdx] = { id: drafts[editSetIdx].id, reps: r, weight: w };
  } else {
    drafts.push({ id: uid(), reps: r, weight: w });
  }
  setDraft(curExId, drafts);
  closeModal('modalSet');
  renderEx(curDayId, curExId, handleEditDraftClick, handleDeleteDraftClick);
};

function handleEditDraftClick(idx) {
  editSetIdx = idx;
  const draft = getDraft(curExId)[idx];
  document.getElementById('inpReps').value = draft.reps;
  document.getElementById('inpWeight').value = draft.weight;
  document.getElementById('btnSaveSet').innerText = 'Update Set';
  openModal('modalSet');
}

function handleDeleteDraftClick(idx) {
  const drafts = getDraft(curExId);
  drafts.splice(idx, 1);
  setDraft(curExId, drafts);
  renderEx(curDayId, curExId, handleEditDraftClick, handleDeleteDraftClick);
}

window.adj = function(id, amt) {
  const el = document.getElementById(id);
  const v = parseFloat(el.value) || 0;
  el.value = Math.max(0, v + amt);
};

// ── Modals & Actions (Save Session to DB) ─────────────────────

window.finishWorkout = async () => {
  const drafts = getDraft(curExId);
  if (drafts.length === 0) return toast('No sets to save');
  const btn = document.getElementById('btnFinishWorkout');
  
  // Get date for session (default today)
  let dateStr = today(); // In a real app we might prompt the user for the date if not today
  
  setBtnLoading(btn, true);
  try {
    await saveSession(curExId, drafts, dateStr);
    clearDraft(curExId);
    toast('Workout Saved!');
    renderEx(curDayId, curExId, handleEditDraftClick, handleDeleteDraftClick);
  } catch (err) {
    toast('Error saving workout');
  } finally {
    setBtnLoading(btn, false);
  }
};

// ── Measurements (Global) ─────────────────────────────────────

window.openNewMeas = () => { document.getElementById('inpNewMeas').value = ''; openModal('modalNewMeas'); };
window.saveNewMeas = async () => {
  const v = document.getElementById('inpNewMeas').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnSaveMeas');
  setBtnLoading(btn, true);
  try {
    await createMeasurement(v);
    closeModal('modalNewMeas');
    renderMeasurements(handleMeasClick);
  } catch(err) { toast('Error'); }
  finally { setBtnLoading(btn, false); }
};

window.openEditMeas = () => {
  const c = getCache();
  const m = c.measurements.find(x => x.id === curMeasId);
  if (!m) return;
  document.getElementById('inpEditMeas').value = m.name;
  openModal('modalEditMeas');
};
window.saveEditMeas = async () => {
  const v = document.getElementById('inpEditMeas').value.trim();
  if (!v) return;
  const btn = document.getElementById('btnUpdateMeas');
  setBtnLoading(btn, true);
  try {
    await renameMeasurement(curMeasId, v);
    closeModal('modalEditMeas');
    renderMeasurementDetail(curMeasId, handleDeleteMeasEntry);
  } catch(err) { toast('Error'); }
  finally { setBtnLoading(btn, false); }
};
window.delMeas = () => {
  confirm2('Delete this measurement?', async () => {
    try {
      await deleteMeasurement(curMeasId);
      closeModal('modalEditMeas');
      goMeas();
    } catch (err) { toast('Error'); }
  });
};

window.openNewMeasEntry = () => {
  document.getElementById('inpMeasVal').value = '';
  document.getElementById('inpMeasDate').value = today();
  // Remember last unit
  const c = getCache();
  const m = c.measurements.find(x => x.id === curMeasId);
  if (m && m.entries.length > 0) document.getElementById('inpMeasUnit').value = m.entries[0].unit;
  openModal('modalMeasEntry');
};
window.saveMeasEntry = async () => {
  const val = parseFloat(document.getElementById('inpMeasVal').value);
  const u = document.getElementById('inpMeasUnit').value.trim() || 'kg';
  const d = document.getElementById('inpMeasDate').value || today();
  if (isNaN(val)) return toast('Enter valid number');
  const btn = document.getElementById('btnSaveMeasEntry');
  setBtnLoading(btn, true);
  try {
    await addMeasurementEntry(curMeasId, val, u, d);
    closeModal('modalMeasEntry');
    renderMeasurementDetail(curMeasId, handleDeleteMeasEntry);
  } catch (err) { toast('Error saving entry'); }
  finally { setBtnLoading(btn, false); }
};

async function handleDeleteMeasEntry(entryId) {
  confirm2('Delete this entry?', async () => {
    try {
      await deleteMeasurementEntry(entryId);
      renderMeasurementDetail(curMeasId, handleDeleteMeasEntry);
    } catch(err) { toast('Error deleting'); }
  });
}

// ── Theme Toggle ──────────────────────────────────────────────

window.toggleTheme = function() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('gymlog_theme', isLight ? 'light' : 'dark');
  document.querySelectorAll('.theme-btn').forEach(btn => btn.innerText = isLight ? 'Dark' : 'Light');
  
  if (curPage === 'pageProg') renderProg(curDayId, curExId);
  if (curPage === 'pageMeasDetail') renderMeasurementDetail(curMeasId, handleDeleteMeasEntry);
};

// ── Global Modal Click To Close ───────────────────────────────

window.onclick = function(e) {
  if (e.target.classList.contains('modal')) closeModal(e.target.id);
};
window.closeModal = closeModal;

// ── Init App ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Theme
  const isLight = localStorage.getItem('gymlog_theme') === 'light';
  if (isLight) document.body.classList.add('light-mode');
  document.querySelectorAll('.theme-btn').forEach(btn => btn.innerText = isLight ? 'Dark' : 'Light');

  // 2. Auth Flow
  initAuth(
    // On Authenticated
    async () => {
      // Try to load cache from local storage first for speed
      const hasLocalCache = loadCacheFromStorage();
      if (hasLocalCache) showApp();
      
      try {
        // Fetch fresh from Supabase in background
        await fetchAllData();
        if (!hasLocalCache) showApp();
        // If we showed the app from local cache, re-render current page with fresh data
        else if (curPage === 'pageDashboard') renderDash(handleDayClick);
      } catch (err) {
        console.error("Failed to fetch fresh data", err);
        if (!hasLocalCache) toast("Failed to load data. Please refresh.");
      }
    },
    // On Unauthenticated
    () => {
      showAuth();
    }
  );
  
  // Initial history push
  history.replaceState({ pageId: 'pageDashboard' }, '');
});
