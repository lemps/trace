// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETTINGS_TABS, settingsTabFor } from "./tabIds.ts";

describe("settings tab ids", () => {
  it("opens today's tabs as they are", () => {
    for (const t of SETTINGS_TABS) assert.equal(settingsTabFor(t.id), t.id);
  });

  it("sends the old ids to the tabs that took them in", () => {
    assert.equal(settingsTabFor("sidebar"), "layout");
    assert.equal(settingsTabFor("tabs"), "layout");
    assert.equal(settingsTabFor("updates"), "about");
  });
});
