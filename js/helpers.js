// js/helpers.js — DOM-related helpers (modals, toasts)
import { esc } from './utils.js';

/** Open a modal by ID */
export function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
  }
}

/** Close a modal by ID */
export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 300);
  }
}

/** Toast notification */
export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2000);
}

/** Confirmation dialog replacement */
export function confirm2(msg, onYes) {
  const m = document.getElementById('modalConfirm');
  if (!m) return;
  document.getElementById('confirmText').innerHTML = esc(msg);
  const y = document.getElementById('confirmYesBtn');
  const old = y.cloneNode(true);
  y.parentNode.replaceChild(old, y);
  old.onclick = () => { closeModal('modalConfirm'); onYes(); };
  openModal('modalConfirm');
}

/** Set button loading state */
export function setBtnLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<div class="loader-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || '';
    btn.disabled = false;
  }
}
