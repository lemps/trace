// Run: `npm test`.
// The Settings page keeps the Standard density (appearance.css), and its
// previews opt back in to the chosen one. Both restate values defined
// elsewhere, so this keeps them from drifting: the page's pin must be exactly
// the tokens density changes, at their tokens.css :root values, and each
// preview density block must match themes.css's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = join(import.meta.dirname, "..", "..");
const css = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties declared in every rule whose selector is exactly `selector`. */
function declared(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rule = /([^{}]+)\{([^}]*)\}/g;
  for (let m = rule.exec(source); m; m = rule.exec(source)) {
    if (m[1].trim() !== selector) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

const tokens = css("styles/tokens.css");
const themes = css("styles/themes.css");
const appearance = css("domains/appearance/appearance.css");
const PIN = ":is(.settings-page, .page:has(> .page-body > .settings-wrap))";
const DENSITIES = ["compact", "comfortable"] as const;

describe("Settings' density pin", () => {
  const changed = new Set(
    DENSITIES.flatMap((d) => Object.keys(declared(themes, `:root[data-density="${d}"]`)))
  );

  it("finds the density rules it checks", () => {
    assert.ok(changed.has("--control-h"));
    assert.ok(changed.has("--text-body"));
  });

  it("pins exactly the tokens density changes, at their Standard values", () => {
    const standard = declared(tokens, ":root");
    const expected = Object.fromEntries([...changed].sort().map((t) => [t, standard[t]]));
    const pin = declared(appearance, PIN);
    const actual = Object.fromEntries(
      Object.keys(pin)
        .sort()
        .map((t) => [t, pin[t]])
    );
    assert.deepEqual(actual, expected);
  });

  for (const d of DENSITIES) {
    it(`lets a preview show ${d} exactly as the app does`, () => {
      assert.deepEqual(
        declared(appearance, `.ap-frame[data-density="${d}"]`),
        declared(themes, `:root[data-density="${d}"]`)
      );
    });
  }
});
