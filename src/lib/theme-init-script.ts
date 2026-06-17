import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";

/** Runs before paint; only reads explicit saved choice, not system light/dark. */
export function buildThemeInitScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const fallback = DEFAULT_THEME;
  return `(function(){try{var k=${key};var leg="match-predictor-theme";var t=localStorage.getItem(k);if(t!=='dark'&&t!=='light'){var o=localStorage.getItem(leg);if(o==='dark'||o==='light'){localStorage.setItem(k,o);t=o;}}var theme=t==='dark'||t==='light'?t:'${fallback}';document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.dataset.theme='${fallback}';}})();`;
}
