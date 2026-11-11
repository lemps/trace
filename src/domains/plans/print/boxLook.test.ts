import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type BoxLook,
  CARD_MAX_PX,
  isCard,
  isPlainBox,
  isTransparent,
  isWhite,
} from "./boxLook.ts";

const plain: BoxLook = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  boxShadow: "none",
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  borderTopStyle: "none",
  borderRightStyle: "none",
  borderBottomStyle: "none",
  borderLeftStyle: "none",
};
const block = { ...plain, display: "block", breakInside: "auto" };

describe("a box's colours", () => {
  it("are transparent at alpha 0, whatever the syntax", () => {
    for (const c of [
      "transparent",
      "rgba(0, 0, 0, 0)",
      "rgb(0 0 0 / 0)",
      "oklch(0.5 0.1 200 / 0%)",
    ]) {
      assert.equal(isTransparent(c), true, c);
    }
    for (const c of ["rgb(0, 0, 0)", "rgba(0, 0, 0, 0.5)", "rgb(0 0 0 / 0.04)"]) {
      assert.equal(isTransparent(c), false, c);
    }
  });

  it("are white only when opaque white", () => {
    for (const c of [
      "rgb(255, 255, 255)",
      "rgba(255, 255, 255, 1)",
      "color(srgb 1 1 1)",
      "oklch(1 0 0)",
    ]) {
      assert.equal(isWhite(c), true, c);
    }
    for (const c of ["rgb(250, 250, 250)", "rgb(248, 250, 252)", "rgba(255, 255, 255, 0.5)"]) {
      assert.equal(isWhite(c), false, c);
    }
  });
});

describe("a plain box", () => {
  it("draws nothing of its own on white paper", () => {
    assert.equal(isPlainBox(plain), true);
    assert.equal(isPlainBox({ ...plain, backgroundColor: "rgb(255, 255, 255)" }), true);
    // A zero-width or unstyled border draws nothing.
    assert.equal(isPlainBox({ ...plain, borderTopWidth: "2px" }), true);
  });

  it("isn't when it has a tint, an image, a shadow or a border", () => {
    assert.equal(isPlainBox({ ...plain, backgroundColor: "rgb(248, 250, 252)" }), false);
    assert.equal(isPlainBox({ ...plain, backgroundImage: "linear-gradient(red, blue)" }), false);
    assert.equal(isPlainBox({ ...plain, boxShadow: "rgba(0, 0, 0, 0.1) 0px 1px 2px 0px" }), false);
    assert.equal(isPlainBox({ ...plain, borderLeftWidth: "4px", borderLeftStyle: "solid" }), false);
  });
});

describe("a card kept on one page", () => {
  const card = { ...block, borderTopWidth: "1px", borderTopStyle: "solid" };

  it("is a small drawn block", () => {
    assert.equal(isCard(card, 120), true);
    assert.equal(isCard({ ...card, display: "flex" }, 120), true);
    assert.equal(isCard({ ...block, backgroundColor: "rgb(240, 240, 240)" }, CARD_MAX_PX), true);
  });

  it("isn't plain, tall, inline, a table, or already given a rule", () => {
    assert.equal(isCard(block, 120), false);
    assert.equal(isCard(card, CARD_MAX_PX + 1), false);
    assert.equal(isCard(card, 0), false);
    assert.equal(isCard({ ...card, display: "inline" }, 20), false);
    assert.equal(isCard({ ...card, display: "table" }, 120), false);
    assert.equal(isCard({ ...card, breakInside: "auto" }, 120), true);
    assert.equal(isCard({ ...card, breakInside: "avoid" }, 120), false);
  });
});
