import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapRootSelectors, type RootTargets, reachesOutside } from "./rootSelectors.ts";

const T: RootTargets = { html: "H", body: "B", root: "R" };
const map = (s: string) => mapRootSelectors(s, T);

describe("a document's root selectors in the print copy", () => {
  it("map html, body and :root onto the wrappers", () => {
    assert.equal(map("body"), "B");
    assert.equal(map("html, body"), "H, B");
    assert.equal(map(":root"), "R");
    assert.equal(map("html body .card > p"), "H B .card > p");
    assert.equal(map("html>body"), "H>B");
    assert.equal(map("body.dark .x"), "B.dark .x");
    assert.equal(map('html[data-theme="dark"] body'), 'H[data-theme="dark"] B');
    assert.equal(map(":root:has(.wide)"), "R:has(.wide)");
    assert.equal(map("BODY"), "B");
    assert.equal(map("body + p, body ~ div"), "B + p, B ~ div");
  });

  it("map inside selector arguments", () => {
    assert.equal(map(":is(html, body) p"), ":is(H, B) p");
    assert.equal(map("p:not(body)"), "p:not(B)");
    assert.equal(map(":where(:root) a"), ":where(R) a");
  });

  it("leave everything that only looks like them", () => {
    for (const s of [
      ".body",
      "#html",
      ".my-body p",
      "tbody td",
      "body-text",
      "x-html",
      '[data-x="body"]',
      "[title='html body']",
      "p:lang(html)",
      "::part(body)",
      "svg|body",
      ":rooted",
      "a\\:body",
    ]) {
      assert.equal(map(s), s, s);
    }
  });

  it("keep the type selector's specificity by default", () => {
    assert.equal(mapRootSelectors("body p"), "div:where(.trace-print-body) p");
    assert.equal(mapRootSelectors(":root"), ".trace-print-html");
  });
});

describe("rules that reach outside the print copy", () => {
  it("are the host and cross-boundary ones", () => {
    assert.equal(reachesOutside(":host"), true);
    assert.equal(reachesOutside(":host(.x) p"), true);
    assert.equal(reachesOutside(":host-context(.dark) p"), true);
    assert.equal(reachesOutside("::slotted(p)"), true);
    assert.equal(reachesOutside("x::part(label)"), true);
    assert.equal(reachesOutside(".hostname p"), false);
    assert.equal(reachesOutside("body p"), false);
  });
});
