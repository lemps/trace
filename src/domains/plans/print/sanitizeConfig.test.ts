import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORBIDDEN_ATTRS, FORBIDDEN_TAGS, PURIFY_CONFIG } from "./sanitizeConfig.ts";

// The sanitiser itself needs a DOM, which `npm test` doesn't have: these pin the
// configuration it runs with, so loosening it is a visible change to a test.

describe("the print copy's sanitiser configuration", () => {
  it("forbids everything that runs, embeds, redirects or submits", () => {
    for (const tag of [
      "script",
      "iframe",
      "frame",
      "object",
      "embed",
      "portal",
      "base",
      "meta",
      "link",
      "form",
      "foreignobject",
      "use",
      "animate",
      "set",
    ]) {
      assert.ok(PURIFY_CONFIG.FORBID_TAGS.includes(tag), tag);
    }
    for (const attr of ["action", "formaction", "srcset", "ping", "popovertarget", "autofocus"]) {
      assert.ok(PURIFY_CONFIG.FORBID_ATTR.includes(attr), attr);
    }
  });

  it("keeps <style> and style attributes, so the document keeps its look", () => {
    assert.ok(!(FORBIDDEN_TAGS as readonly string[]).includes("style"));
    assert.ok(!(FORBIDDEN_ATTRS as readonly string[]).includes("style"));
  });

  it("allows SVG and MathML only through DOMPurify's profiles", () => {
    assert.deepEqual(PURIFY_CONFIG.USE_PROFILES, {
      html: true,
      svg: true,
      svgFilters: true,
      mathMl: true,
    });
    assert.equal(PURIFY_CONFIG.ALLOW_UNKNOWN_PROTOCOLS, false);
    assert.equal(PURIFY_CONFIG.SAFE_FOR_XML, true);
  });

  it("returns the whole sanitised document as a node, never a string to re-parse", () => {
    assert.equal(PURIFY_CONFIG.WHOLE_DOCUMENT, true);
    assert.equal(PURIFY_CONFIG.RETURN_DOM, true);
    assert.equal(PURIFY_CONFIG.RETURN_DOM_FRAGMENT, false);
    assert.equal(PURIFY_CONFIG.IN_PLACE, false);
  });
});
