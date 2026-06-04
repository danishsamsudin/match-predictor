export type Theme = "light" | "dark";

/** SSR and first client paint — avoids hydration mismatch with stored preference. */
export const DEFAULT_THEME: Theme = "dark";

export const THEME_STORAGE_KEY = "dynamixg-theme";
const LEGACY_THEME_STORAGE_KEY = "match-predictor-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  let stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored !== "light" && stored !== "dark") {
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark") {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      stored = legacy;
    }
  }
  return stored === "light" || stored === "dark" ? stored : null;
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/** User-saved theme after first visit; otherwise default dark. Client-only. */
export function resolveThemeFromStorage(): Theme {
  return getStoredTheme() ?? DEFAULT_THEME;
}
