// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { common, createLowlight } from "lowlight";
import { fenceLanguage, highlightCode, textOfNode } from "./highlight.ts";

describe("fenceLanguage", () => {
  it("reads the language from a fence's class", () => {
    assert.equal(fenceLanguage(["language-TS"]), "ts");
    assert.equal(fenceLanguage("hljs language-rust"), "rust");
  });

  it("is null without one", () => {
    assert.equal(fenceLanguage(undefined), null);
    assert.equal(fenceLanguage(["language-"]), null);
    assert.equal(fenceLanguage(["other"]), null);
  });
});

describe("textOfNode", () => {
  it("joins the text under a node", () => {
    const node = {
      type: "element",
      children: [
        { type: "text", value: "a" },
        { type: "element", children: [{ type: "text", value: "b" }] },
      ],
    };
    assert.equal(textOfNode(node), "ab");
    assert.equal(textOfNode(undefined), "");
  });
});

describe("highlightCode", () => {
  const hl = createLowlight(common);

  it("highlights a known language, keeping the text", () => {
    const tree = highlightCode(hl, "ts", 'const a = "x";');
    assert.ok(tree);
    assert.equal(tree.map(textOfNode).join(""), 'const a = "x";');
    assert.ok(tree.some((n) => n.type === "element"));
  });

  it("is null for a language it doesn't know, or half-typed", () => {
    assert.equal(highlightCode(hl, "typ", "x"), null);
  });
});
