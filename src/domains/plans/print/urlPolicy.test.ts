import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cssUnescape,
  isSafeCssUrl,
  isSafeCssValue,
  isSafeLink,
  isSafeResource,
  keepsUrlAttribute,
} from "./urlPolicy.ts";

describe("links in the print copy", () => {
  it("keep in-document, web and mail links", () => {
    for (const u of ["#top", "https://example.com/a", "http://x.y", "mailto:a@b.c", " HTTPS://X"]) {
      assert.equal(isSafeLink(u), true, u);
    }
  });

  it("drop scripts, trace's schemes and relative paths", () => {
    for (const u of [
      "javascript:alert(1)",
      "java\tscript:alert(1)",
      " javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>x</script>",
      "vbscript:x",
      "trace-img://localhost/a.png",
      "asset://localhost/x",
      "ipc://localhost/plugin",
      "tauri://localhost/",
      "blob:https://x/1",
      "file:///etc/passwd",
      "/api/secret",
      "../x",
      "",
    ]) {
      assert.equal(isSafeLink(u), false, u);
    }
  });
});

describe("images in the print copy", () => {
  it("load from the web or inline", () => {
    for (const u of [
      "https://example.com/a.png",
      "data:image/png;base64,AAAA",
      "data:image/svg+xml,%3Csvg%3E",
      "data:image/jpeg;base64,AA",
    ]) {
      assert.equal(isSafeResource(u), true, u);
    }
  });

  it("never from trace, the disk, or as a page", () => {
    for (const u of [
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:application/pdf;base64,AA",
      "trace-img://localhost/x.png",
      "file:///Users/x/a.png",
      "javascript:alert(1)",
      "img/a.png",
      "#frag",
    ]) {
      assert.equal(isSafeResource(u), false, u);
    }
  });
});

describe("CSS in the print copy", () => {
  it("resolves escapes before it judges", () => {
    assert.equal(cssUnescape("u\\72 l(x)"), "url(x)");
    assert.equal(cssUnescape("\\75rl(x)"), "url(x)");
    assert.equal(cssUnescape("a\\:b"), "a:b");
  });

  it("allows in-document references and inline images", () => {
    assert.equal(isSafeCssUrl("#grad"), true);
    assert.equal(isSafeCssUrl("data:image/png;base64,AA"), true);
    assert.equal(isSafeCssUrl("https://fonts.example/a.woff2"), false);
    assert.equal(isSafeCssUrl("#"), false);
  });

  it("keeps values that fetch nothing from outside", () => {
    for (const v of [
      "red",
      "1px solid rgb(0, 0, 0)",
      'url("#g")',
      "url(#clip)",
      'url("data:image/png;base64,AA")',
      "linear-gradient(red, blue)",
      '"a string"',
      "var(--x)",
    ]) {
      assert.equal(isSafeCssValue(v), true, v);
    }
  });

  it("drops values that would fetch from the web, trace or script", () => {
    for (const v of [
      'url("https://evil.example/p.gif")',
      "url(https://evil.example/p.gif)",
      "url( 'http://x/y' )",
      "u\\72 l(https://evil.example/x)",
      'image-set("https://x/a.png" 1x)',
      '-webkit-image-set("https://x/a.png" 1x)',
      'cross-fade("https://x/a.png", red)',
      "src(var(--u))",
      'url("trace-img://localhost/a.png")',
      'url("javascript:alert(1)")',
      'url("/relative.png")',
      "linear-gradient(red, blue), url(https://x/y)",
    ]) {
      assert.equal(isSafeCssValue(v), false, v);
    }
  });
});

describe("URL attributes", () => {
  it("judge links, images and loaders separately", () => {
    assert.equal(keepsUrlAttribute("a", "href", "https://x"), true);
    assert.equal(keepsUrlAttribute("a", "href", "javascript:x"), false);
    assert.equal(keepsUrlAttribute("img", "src", "https://x/a.png"), true);
    assert.equal(keepsUrlAttribute("img", "src", "data:text/html,x"), false);
    assert.equal(keepsUrlAttribute("image", "href", "data:image/png;base64,AA"), true);
    assert.equal(keepsUrlAttribute("image", "xlink:href", "https://x/a.svg"), true);
    assert.equal(keepsUrlAttribute("a", "xlink:href", "javascript:x"), false);
    assert.equal(keepsUrlAttribute("lineargradient", "href", "#other"), true);
    assert.equal(keepsUrlAttribute("blockquote", "cite", "https://x"), true);
  });

  it("never keep attributes that load or submit", () => {
    for (const a of ["action", "formaction", "background", "poster", "srcset", "ping", "data"]) {
      assert.equal(keepsUrlAttribute("x", a, "https://x"), false, a);
    }
  });

  it("filter CSS in SVG presentation attributes", () => {
    assert.equal(keepsUrlAttribute("rect", "fill", "url(#g)"), true);
    assert.equal(keepsUrlAttribute("rect", "fill", "url(https://x/p.svg#g)"), false);
    assert.equal(keepsUrlAttribute("rect", "filter", "u\\72 l(https://x)"), false);
    assert.equal(keepsUrlAttribute("rect", "width", "100"), true);
  });
});

describe("URLs the browser reads differently", () => {
  it("aren't approved by stripping what the browser keeps", () => {
    const zwsp = String.fromCodePoint(0x200b);
    assert.equal(isSafeLink(`ht${zwsp}tps://x`), false);
    assert.equal(isSafeResource(`${zwsp}https://x/a.png`), false);
    assert.equal(isSafeLink("https\n://x"), true);
  });
});
