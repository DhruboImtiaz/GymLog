// js/cache.js — In-memory cache layer with localStorage backup and draft sets

const CACHE_KEY = 'gymlog_cache';
const DRAFT_KEY = 'gymlog_drafts';

/** @type {{ days: Array, measurements: Array }} */
let _cache = { days: [], measurements: [] };

// ── Main cache ────────────────────────────────────────────────

/** Return the current in-memory cache */
export function getCache() {
  return _cache;
}

/** Replace the entire cache and persist to localStorage */
export function setCache(data) {
  _cache = data;
  _persist();
}

/**
 * Apply a mutation to the cache, then persist.
 * @param {function(_cache): void} mutatorFn
 */
export function updateCache(mutatorFn) {
  mutatorFn(_cache);
  _persist();
}

/**
 * Try to hydrate the in-memory cache from localStorage.
 * @returns {boolean} true if data was found
 */
export function loadCacheFromStorage() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      _cache = JSON.parse(raw);
      return true;
    }
  } catch (_) { /* ignore parse errors */ }
  return false;
}

/** Clear the in-memory cache and remove from localStorage */
export function clearCache() {
  _cache = { days: [], measurements: [] };
  try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
}

function _persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(_cache)); } catch (_) {}
}

// ── Draft sets ────────────────────────────────────────────────
// Draft sets are active (unsaved) sets for a given exercise.
// They live only in localStorage until the user taps "Save Workout to History".

/**
 * Get draft sets for an exercise.
 * @param {string} exerciseId
 * @returns {Array<{id:string, num:number, reps:number, weight:number}>}
 */
export function getDraft(exerciseId) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    return all[exerciseId] || [];
  } catch (_) { return []; }
}

/**
 * Persist draft sets for an exercise.
 * @param {string} exerciseId
 * @param {Array} sets
 */
export function setDraft(exerciseId, sets) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    all[exerciseId] = sets;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch (_) {}
}

/**
 * Remove draft sets for an exercise (called after saveSession succeeds).
 * @param {string} exerciseId
 */
export function clearDraft(exerciseId) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    delete all[exerciseId];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch (_) {}
}

/** Remove ALL draft sets (called on logout) */
export function clearAllDrafts() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
}
