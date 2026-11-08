import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPage } from "../../ipc/browser.ts";
import { browserTabVisible, hostOf, pageLabel, suggestions, typedUrl } from "./model.ts";

const page = (id: string, history: string[], updatedAt: number, title = ""): BrowserPage => ({
  id,
  title,
  url: history[history.length - 1],
  history,
  openedBy: "agent",
  updatedAt,
});

describe("Browser tab visibility", () => {
  it("shows only with a page, or while opened empty from the pane menu", () => {
    assert.equal(browserTabVisible(0, false), false);
    assert.equal(browserTabVisible(1, false), true);
    assert.equal(browserTabVisible(0, true), true);
    assert.equal(browserTabVisible(3, true), true);
  });
});

describe("typedUrl", () => {
  it("reads ports and local hosts as http", () => {
    assert.equal(typedUrl("5173"), "http://localhost:5173");
    assert.equal(typedUrl(":5173/x"), "http://localhost:5173/x");
    assert.equal(typedUrl("localhost:3000"), "http://localhost:3000");
    assert.equal(typedUrl("localhost"), "http://localhost");
    assert.equal(typedUrl("127.0.0.1:8080/a?b"), "http://127.0.0.1:8080/a?b");
    assert.equal(typedUrl("[::1]:4000"), "http://[::1]:4000");
  });

  it("reads bare domains as https and keeps full URLs", () => {
    assert.equal(typedUrl("example.com"), "https://example.com");
    assert.equal(typedUrl("example.com:8443/x"), "https://example.com:8443/x");
    assert.equal(typedUrl("docs.rs/tauri/latest"), "https://docs.rs/tauri/latest");
    assert.equal(typedUrl("  http://example.com  "), "http://example.com");
    assert.equal(typedUrl("https://localhost:5173"), "https://localhost:5173");
  });

  it("passes other schemes through for the backend to refuse", () => {
    assert.equal(typedUrl("javascript:alert(1)"), "javascript:alert(1)");
    assert.equal(typedUrl("file:///C:/x"), "file:///C:/x");
    assert.equal(typedUrl("data:text/html,hi"), "data:text/html,hi");
  });

  it("isn't an address", () => {
    assert.equal(typedUrl(""), null);
    assert.equal(typedUrl("   "), null);
    assert.equal(typedUrl("how do I"), null);
    assert.equal(typedUrl("readme"), null);
  });
});

describe("labels and suggestions", () => {
  it("names a page by its title, the document's, or its host", () => {
    const p = page("a", ["http://localhost:5173/"], 1);
    assert.equal(pageLabel(p), "localhost:5173");
    assert.equal(pageLabel(p, "Vite App"), "Vite App");
    assert.equal(pageLabel({ ...p, title: "Docs" }, "Vite App"), "Docs");
    assert.equal(hostOf("not a url"), "not a url");
  });

  it("suggests every page's history, newest first, once each", () => {
    const pages = [
      page("a", ["http://localhost/1", "http://localhost/2"], 1),
      page("b", ["https://example.com/", "http://localhost/1"], 2),
    ];
    assert.deepEqual(suggestions(pages), [
      "http://localhost/1",
      "https://example.com/",
      "http://localhost/2",
    ]);
  });
});
