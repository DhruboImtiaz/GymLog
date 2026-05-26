// js/utils.js — Pure helper utilities (no DOM, no side effects)

/** Generate a short unique ID */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Return today's date as YYYY-MM-DD in local time */
export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Format a YYYY-MM-DD date string to "Jan 5, 2026" */
export function fmt(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[+m - 1] + ' ' + parseInt(day) + ', ' + y;
}

/** Escape HTML special characters to prevent XSS */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
