// js/charts.js — Chart.js wrappers
import { fmt } from './utils.js';

let chartProgress = null;
let chartMeas = null;

export function updateProgressCharts(ex) {
  if (!ex) return;
  const ctx = document.getElementById('chartProgress').getContext('2d');
  if (chartProgress) chartProgress.destroy();
  
  if (!ex.history || ex.history.length === 0) {
    // Show empty state
    chartProgress = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: { plugins: { title: { display: true, text: 'No History Yet' } } }
    });
    return;
  }
  
  const labels = ex.history.slice().reverse().map(h => fmt(h.date));
  const maxW = ex.history.slice().reverse().map(h => Math.max(0, ...h.sets.map(s => s.weight)));
  const vol = ex.history.slice().reverse().map(h => h.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0));
  
  chartProgress = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Max Weight', data: maxW, borderColor: '#f97316', backgroundColor: '#f97316', yAxisID: 'y' },
        { label: 'Total Vol', data: vol, borderColor: '#3b82f6', backgroundColor: '#3b82f6', yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: '#a1a1aa',
      scales: {
        x: { ticks: { color: '#a1a1aa' }, grid: { color: '#3f3f46' } },
        y: { type: 'linear', position: 'left', ticks: { color: '#f97316' }, grid: { color: '#3f3f46' } },
        y1: { type: 'linear', position: 'right', ticks: { color: '#3b82f6' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

export function updateMeasProgressChart(m) {
  if (!m) return;
  const ctx = document.getElementById('chartMeasProgress').getContext('2d');
  if (chartMeas) chartMeas.destroy();
  
  if (!m.entries || m.entries.length === 0) {
    chartMeas = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: { plugins: { title: { display: true, text: 'No Entries Yet' } } }
    });
    return;
  }
  
  const labels = m.entries.slice().reverse().map(e => fmt(e.date));
  const vals = m.entries.slice().reverse().map(e => e.val);
  
  chartMeas = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{ label: m.name, data: vals, borderColor: '#f97316', backgroundColor: '#f97316' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: '#a1a1aa',
      scales: {
        x: { ticks: { color: '#a1a1aa' }, grid: { color: '#3f3f46' } },
        y: { ticks: { color: '#f97316' }, grid: { color: '#3f3f46' } }
      }
    }
  });
}
