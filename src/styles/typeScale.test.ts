// Run: `npm test`.
// The type scale is a hard rule (trace-ui §4): text is one of the `--text-*`
// tokens, never a token nudged with calc() and never a raw px size. The tokens
// sit 1px apart, so a "half step" is a seventh size nobody named.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const SRC = join(import.meta.dirname, "..");

/** Files that draw at literal sizes on purpose. */
const RAW_PX_ALLOWED = new Set([
  "styles/tokens.css", // defines the scale
  "domains/appearance/previews.css", // miniature theme previews
  "domains/appearance/snippets.css", // miniature code samples
  "domains/orchestrator/VegaChart.tsx", // a Vega spec takes numbers, not CSS
]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.(css|tsx)$/.test(e.name) ? [path] : [];
  });
}

function offenders(pattern: RegExp, skip: ReadonlySet<string> = new Set()): string[] {
  const found: string[] = [];
  for (const path of files(SRC)) {
    const rel = relative(SRC, path).split("\\").join("/");
    if (skip.has(rel)) continue;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
  }
  return found;
}

describe("the type scale", () => {
  it("never nudges a --text-* token with calc()", () => {
    assert.deepEqual(offenders(/calc\([^;]*var\(--text-/), []);
  });

  it("never sets a raw px font size in CSS", () => {
    assert.deepEqual(offenders(/font-size:\s*[\d.]+px/, RAW_PX_ALLOWED), []);
  });

  it("never sets a numeric fontSize inline", () => {
    assert.deepEqual(offenders(/fontSize:\s*["']?[\d.]/, RAW_PX_ALLOWED), []);
  });
});
