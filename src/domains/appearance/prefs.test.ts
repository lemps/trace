// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PREFS, parsePrefs, systemThemes, UI_SCALES } from "./prefs.ts";
import { resolveTheme } from "./themes.ts";
import { stepScale } from "./zoom.ts";

describe("parsePrefs: System's light and dark picks", () => {
  it("defaults to Light and Dark, so System means what it always did", () => {
    const prefs = parsePrefs({ theme: "system" });
    assert.equal(prefs.lightTheme, "light");
    assert.equal(prefs.darkTheme, "dark");
  });

  it("keeps valid picks", () => {
    const prefs = parsePrefs({ lightTheme: "paper", darkTheme: "midnight" });
    assert.deepEqual(systemThemes(prefs), { light: "paper", dark: "midnight" });
  });

  it("refuses a pick of the wrong kind or an unknown one", () => {
    const prefs = parsePrefs({ lightTheme: "midnight", darkTheme: "paper" });
    assert.deepEqual(systemThemes(prefs), { light: "light", dark: "dark" });
    assert.equal(parsePrefs({ darkTheme: "neon" }).darkTheme, "dark");
  });
});

describe("parsePrefs: the code font", () => {
  it("is blank (Geist Mono) unless set, and capped like the other fonts", () => {
    assert.equal(parsePrefs({}).monoFont, "");
    assert.equal(parsePrefs({ monoFont: "JetBrains Mono" }).monoFont, "JetBrains Mono");
    assert.equal(parsePrefs({ monoFont: 12 }).monoFont, "");
    assert.equal(parsePrefs({ monoFont: "x".repeat(500) }).monoFont.length, 200);
  });

  it("leaves an existing chat code font as the chat's own override", () => {
    const prefs = parsePrefs({ chat: { codeFont: "Fira Code" } });
    assert.equal(prefs.chat.codeFont, "Fira Code");
    assert.equal(prefs.monoFont, "");
  });
});

describe("parsePrefs: Interface size", () => {
  it("accepts every step, old and new", () => {
    for (const s of [80, 90, 100, 110, 125, 150])
      assert.equal(parsePrefs({ uiScale: s }).uiScale, s);
  });

  it("refuses anything else", () => {
    for (const s of [75, 105, 200, "125", null]) {
      assert.equal(parsePrefs({ uiScale: s }).uiScale, DEFAULT_PREFS.uiScale);
    }
  });
});

describe("resolveTheme", () => {
  const picks = { light: "paper", dark: "midnight" } as const;

  it("uses System's pick for the OS's mode", () => {
    assert.equal(resolveTheme("system", "dark", picks), "midnight");
    assert.equal(resolveTheme("system", "light", picks), "paper");
  });

  it("falls back to Dark and Light without picks", () => {
    assert.equal(resolveTheme("system", "dark"), "dark");
    assert.equal(resolveTheme("system", "light"), "light");
  });

  it("ignores the picks under a chosen theme", () => {
    assert.equal(resolveTheme("light", "dark", picks), "light");
    assert.equal(resolveTheme("dark", "light", picks), "dark");
  });
});

describe("stepScale (the zoom shortcuts)", () => {
  it("walks the Interface size steps", () => {
    assert.equal(stepScale(100, "in"), 110);
    assert.equal(stepScale(110, "in"), 125);
    assert.equal(stepScale(125, "in"), 150);
    assert.equal(stepScale(100, "out"), 90);
    assert.equal(stepScale(90, "out"), 80);
  });

  it("stays put at either end", () => {
    assert.equal(stepScale(150, "in"), 150);
    assert.equal(stepScale(80, "out"), 80);
  });

  it("goes back to 100% for Actual size", () => {
    for (const s of UI_SCALES) assert.equal(stepScale(s, "reset"), 100);
  });

  it("moves an odd value to the nearest step that way", () => {
    assert.equal(stepScale(105, "in"), 110);
    assert.equal(stepScale(105, "out"), 100);
  });
});
