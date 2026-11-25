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
// Default accent — Slate Grey (matches the CampusHub AIMS look).
export const DEFAULT_ACCENT = '#475569';
// Preset palette — exact codes chosen by the user.
export const ACCENTS = [
  '#475569', // Slate Grey (default)
  '#D97706', // Amber Orange
  '#0D9488', // Teal
  '#2563EB', // Blue
  '#4F46E5', // Indigo
  '#7C3AED', // Purple
  '#C2185B', // Rose Pink
  '#E11D74', // Hot Pink
  '#059669', // Emerald Green
  '#E05252', // Coral Red
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
