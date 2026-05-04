import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFLINE_THEME_PRESETS,
  resolveThemeDescriptor,
} from "../theme-resolver.mjs";

test("offline theme resolver exposes Dracula without Shiki or network", () => {
  assert.deepEqual(resolveThemeDescriptor("dracula"), OFFLINE_THEME_PRESETS.dracula);
  assert.equal(resolveThemeDescriptor("dracula").bg, "#282a36");
  assert.equal(resolveThemeDescriptor("dracula").accent, "#bd93f9");
});

test("offline theme resolver maps Nordic to Nord dark", () => {
  const nord = resolveThemeDescriptor("nord");
  const nordic = resolveThemeDescriptor("nordic");

  assert.deepEqual(nordic, nord);
  assert.equal(nordic.bg, "#2e3440");
  assert.equal(nordic.fg, "#d8dee9");
  assert.equal(nordic.accent, "#88c0d0");
});

test("offline theme resolver still accepts vendored beautiful-mermaid catalog names", () => {
  const catalog = {
    "tokyo-night": {
      bg: "#1a1b26",
      fg: "#a9b1d6",
      accent: "#7aa2f7",
    },
  };

  assert.deepEqual(resolveThemeDescriptor("tokyo-night", catalog), catalog["tokyo-night"]);
});
