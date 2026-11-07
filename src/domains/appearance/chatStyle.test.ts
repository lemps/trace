// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_SIZE,
  chatStyleVars,
  DEFAULT_CHAT_STYLE,
  parseChatStyle,
  sizeFromInput,
  TEXT_SIZE,
} from "./chatStyle.ts";
import { DEFAULT_PREFS, parsePrefs } from "./prefs.ts";

describe("parseChatStyle", () => {
  it("gives the defaults for nothing stored", () => {
    assert.deepEqual(parseChatStyle(undefined), DEFAULT_CHAT_STYLE);
    assert.deepEqual(parseChatStyle(null), DEFAULT_CHAT_STYLE);
    assert.deepEqual(parseChatStyle("big"), DEFAULT_CHAT_STYLE);
  });

  it("keeps valid values", () => {
    const style = {
      textFont: "Inter",
      textSize: 15,
      codeFont: "Cascadia Code",
      codeSize: 12.5,
      lineHeight: 1.75,
      width: "full",
      spacing: "relaxed",
      headings: "large",
      codeTheme: "nord",
      tools: "expanded",
    };
    assert.deepEqual(parseChatStyle(style), style);
  });

  it("drops each invalid field to its default, keeping the rest", () => {
    const parsed = parseChatStyle({
      textFont: 12,
      textSize: 400,
      codeSize: "12",
      lineHeight: 1.65,
      width: "huge",
      spacing: "standard",
      headings: null,
      codeTheme: "monokai",
      tools: true,
    });
    assert.deepEqual(parsed, { ...DEFAULT_CHAT_STYLE, spacing: "standard" });
  });

  it("rounds sizes to the half pixel and keeps 0 as the default", () => {
    assert.equal(parseChatStyle({ textSize: 14.3 }).textSize, 14.5);
    assert.equal(parseChatStyle({ textSize: 0 }).textSize, 0);
    assert.equal(parseChatStyle({ textSize: Number.NaN }).textSize, 0);
    assert.equal(parseChatStyle({ codeSize: CODE_SIZE.min - 1 }).codeSize, 0);
  });

  it("caps a font name's length", () => {
    assert.equal(parseChatStyle({ textFont: "x".repeat(500) }).textFont.length, 200);
  });
});

describe("parsePrefs", () => {
  it("validates the chat style inside the appearance prefs", () => {
    assert.deepEqual(parsePrefs({}).chat, DEFAULT_CHAT_STYLE);
    const prefs = parsePrefs({ theme: "light", chat: { width: "wide", tools: "nope" } });
    assert.equal(prefs.theme, "light");
    assert.deepEqual(prefs.chat, { ...DEFAULT_CHAT_STYLE, width: "wide" });
  });

  it("defaults include the chat defaults", () => {
    assert.deepEqual(DEFAULT_PREFS.chat, DEFAULT_CHAT_STYLE);
  });
});

describe("sizeFromInput", () => {
  it("reads blank as the default", () => {
    assert.equal(sizeFromInput("", TEXT_SIZE), 0);
    assert.equal(sizeFromInput("  ", TEXT_SIZE), 0);
  });

  it("accepts in-range numbers, to the half pixel", () => {
    assert.equal(sizeFromInput("14", TEXT_SIZE), 14);
    assert.equal(sizeFromInput("15.4", TEXT_SIZE), 15.5);
  });

  it("holds back values that aren't usable yet", () => {
    assert.equal(sizeFromInput("1", TEXT_SIZE), null);
    assert.equal(sizeFromInput("99", TEXT_SIZE), null);
    assert.equal(sizeFromInput("abc", TEXT_SIZE), null);
  });
});

describe("chatStyleVars", () => {
  it("leaves the default sizes and fonts to the CSS fallbacks", () => {
    const vars = chatStyleVars(DEFAULT_CHAT_STYLE);
    assert.equal(vars["--chat-size"], "");
    assert.equal(vars["--chat-code-size"], "");
    assert.equal(vars["--chat-font"], "");
    assert.equal(vars["--chat-code-font"], "");
    // Today's look: 1.6 lines, 8px paragraphs, the 820px column.
    assert.equal(vars["--chat-line-height"], "1.6");
    assert.equal(vars["--chat-gap"], "8px");
    assert.equal(vars["--chat-col"], "820px");
  });

  it("turns choices into CSS values", () => {
    const vars = chatStyleVars({
      ...DEFAULT_CHAT_STYLE,
      textFont: "Inter",
      textSize: 16,
      codeSize: 13,
      width: "full",
      headings: "large",
    });
    assert.equal(vars["--chat-font"], '"Inter", var(--font-sans)');
    assert.equal(vars["--chat-size"], "16px");
    assert.equal(vars["--chat-code-size"], "13px");
    assert.equal(vars["--chat-col"], "none");
    assert.equal(vars["--chat-h1"], "1.5");
  });
});
