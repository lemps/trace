import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GallerySet, Listing } from "../../ipc/gallery.ts";
import {
  formatSize,
  galleryTabVisible,
  listingKey,
  listingNotes,
  stepIndex,
  whereLabel,
} from "./model.ts";

const listing = (paths: string[], extra: Partial<Listing> = {}): Listing => ({
  images: paths.map((p) => ({ path: p, name: p, rel: p, size: 10, modified: 1 })),
  tooLarge: 0,
  truncated: false,
  missing: [],
  ...extra,
});

describe("Gallery tab visibility", () => {
  it("shows only with a set, or while opened empty from the pane menu", () => {
    assert.equal(galleryTabVisible(0, false), false);
    assert.equal(galleryTabVisible(2, false), true);
    assert.equal(galleryTabVisible(0, true), true);
  });
});

describe("Gallery model", () => {
  it("formats sizes", () => {
    assert.equal(formatSize(812), "812 B");
    assert.equal(formatSize(14540), "14 KB");
    assert.equal(formatSize(2048), "2.0 KB");
    assert.equal(formatSize(3.1 * 1024 * 1024), "3.1 MB");
  });

  it("names where a set is", () => {
    const set: GallerySet = {
      id: "s",
      title: "t",
      roots: ["C:/shots"],
      recursive: false,
      glob: null,
      createdAt: 0,
    };
    assert.equal(whereLabel(set), "C:/shots");
    assert.equal(whereLabel({ ...set, roots: ["a", "b", "c"] }), "3 places");
  });

  it("notices added, removed and changed files", () => {
    const a = listing(["a.png", "b.png"]);
    assert.equal(listingKey(a), listingKey(listing(["a.png", "b.png"])));
    assert.notEqual(listingKey(a), listingKey(listing(["a.png"])));
    assert.notEqual(listingKey(a), listingKey(listing(["a.png", "b.png", "c.png"])));
    const touched = listing(["a.png", "b.png"]);
    touched.images[1].modified = 2;
    assert.notEqual(listingKey(a), listingKey(touched));
  });

  it("steps through images, wrapping", () => {
    assert.equal(stepIndex(0, 1, 3), 1);
    assert.equal(stepIndex(2, 1, 3), 0);
    assert.equal(stepIndex(0, -1, 3), 2);
    assert.equal(stepIndex(0, 1, 0), -1);
  });

  it("says what a listing left out", () => {
    assert.deepEqual(listingNotes(listing(["a"])), []);
    const notes = listingNotes(listing(["a"], { truncated: true, tooLarge: 2, missing: ["D:/x"] }));
    assert.equal(notes.length, 3);
    assert.match(notes[0], /first 1 images/);
  });
});
