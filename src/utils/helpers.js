export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function getDateOffsetIso(daysBack = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export function fmt(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + ' ' + parseInt(day) + ', ' + y;
}

export function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
