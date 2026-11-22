'use client';
const THEME_KEY = 'arundhati-theme';

export function getTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme || 'light';
}
export function isDark() { return getTheme() === 'dark'; }
export function applyTheme(t) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
}
export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// ---------- accent colour ----------
const ACCENT_KEY = 'arundhati-accent';
export const DEFAULT_ACCENT = '#059669';
// Preset palette (mirrors the Campus-Hub picker).
export const ACCENTS = [
  '#ef4444', '#059669', '#ec4899', '#be123c', '#7c3aed',
  '#4338ca', '#2563eb', '#0d9488', '#d97706', '#334155',
];

export function getAccent() {
  try { return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT; } catch (e) { return DEFAULT_ACCENT; }
}
// Sets --primary on <html>; the derived tints (--primary-2/-soft, --bg) are
// color-mixed from it in globals.css, so one property recolours everything.
export function applyAccent(hex) {
  if (typeof document === 'undefined') return;
  try {
    if (hex && hex !== DEFAULT_ACCENT) { document.documentElement.style.setProperty('--primary', hex); localStorage.setItem(ACCENT_KEY, hex); }
    else { document.documentElement.style.removeProperty('--primary'); localStorage.removeItem(ACCENT_KEY); }
  } catch (e) {}
}
