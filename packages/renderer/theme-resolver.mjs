/**
 * Offline theme resolver shared by tools/mermaid renderers.
 *
 * These presets are intentionally local so vendor mode can resolve common
 * themes without Shiki, CDN, npm, or any runtime download.
 */

export const OFFLINE_THEME_PRESETS = Object.freeze({
  dracula: Object.freeze({
    bg: "#282a36",
    fg: "#f8f8f2",
    line: "#6272a4",
    accent: "#bd93f9",
    muted: "#6272a4",
  }),
  nord: Object.freeze({
    bg: "#2e3440",
    fg: "#d8dee9",
    line: "#4c566a",
    accent: "#88c0d0",
    muted: "#616e88",
  }),
  "nord-light": Object.freeze({
    bg: "#eceff4",
    fg: "#2e3440",
    line: "#aab1c0",
    accent: "#5e81ac",
    muted: "#7b88a1",
  }),
});

export const OFFLINE_THEME_ALIASES = Object.freeze({
  nordic: "nord",
});

function cloneTheme(theme) {
  return theme ? { ...theme } : null;
}

export function normalizeThemeName(themeName) {
  return String(themeName || "").trim().toLowerCase();
}

export function resolveOfflineTheme(themeName) {
  const normalized = normalizeThemeName(themeName);
  if (!normalized || normalized === "default") return null;
  const canonical = OFFLINE_THEME_ALIASES[normalized] || normalized;
  return cloneTheme(OFFLINE_THEME_PRESETS[canonical]);
}

export function resolveThemeDescriptor(themeName, themeCatalog = {}) {
  const normalized = normalizeThemeName(themeName);
  if (!normalized || normalized === "default") return null;

  const offline = resolveOfflineTheme(normalized);
  if (offline) return offline;

  if (themeCatalog && typeof themeCatalog === "object") {
    if (themeCatalog[themeName]) return cloneTheme(themeCatalog[themeName]);
    if (themeCatalog[normalized]) return cloneTheme(themeCatalog[normalized]);
  }

  return null;
}
