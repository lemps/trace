// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUSHES_AS_DETAIL, repoRowMenu } from "./repoRowMenu.ts";

const noop = () => {};
const glyph = () => null;
const base = {
  exists: true,
  remote: { host: "github.com", owner: "noble1911", name: "trace" },
  account: null,
  logins: ["ron"],
  icons: { Pencil: glyph, External: glyph },
  onEdit: noop,
  onSuggest: noop,
  onAccount: noop,
  onOpenRemote: noop,
  onReveal: noop,
  onCopyPath: noop,
  onRemove: noop,
} as unknown as Parameters<typeof repoRowMenu>[0];

const ids = (args: Parameters<typeof repoRowMenu>[0]) =>
  repoRowMenu(args).map((s) => s.items.map((i) => i.id));

describe("repoRowMenu", () => {
  it("offers setup, the remote, the folder and removal", () => {
    assert.deepEqual(ids(base), [
      ["edit", "suggest"],
      [],
      ["remote", "reveal", "copy"],
      ["remove"],
    ]);
  });

  it("puts only Edit setup in the hover bar", () => {
    const bar = repoRowMenu(base)
      .flatMap((s) => s.items)
      .filter((i) => "inBar" in i && i.inBar);
    assert.deepEqual(
      bar.map((i) => i.id),
      ["edit"]
    );
  });

  it("drops Open on GitHub without a remote, and names another host", () => {
    assert.deepEqual(ids({ ...base, remote: null })[2], ["reveal", "copy"]);
    const gitlab = repoRowMenu({ ...base, remote: { host: "gitlab.com", owner: "o", name: "n" } });
    assert.equal(gitlab[2]?.items[0]?.label, "Open on gitlab.com");
  });

  it("reduces a missing folder to Copy path and Remove", () => {
    assert.deepEqual(ids({ ...base, exists: false, logins: ["a", "b"] }), [["copy"], ["remove"]]);
  });

  it("lists Pushes as only with two accounts and loaded details", () => {
    const two = repoRowMenu({ ...base, logins: ["ron", "noble"], account: "noble" });
    const pushes = two[1];
    assert.equal(pushes?.title, "Pushes as");
    assert.deepEqual(
      pushes?.items.map((i) => [i.label, i.checked]),
      [
        ["Automatic", false],
        ["ron", false],
        ["noble", true],
      ]
    );
    assert.equal(pushes?.items[0]?.detail, PUSHES_AS_DETAIL);
    assert.deepEqual(ids({ ...base, logins: ["a", "b"], account: undefined })[1], []);
  });

  it("holds setup back until the details load", () => {
    const [setup] = repoRowMenu({ ...base, account: undefined });
    assert.deepEqual(
      setup?.items.map((i) => i.disabled),
      [true, true]
    );
  });

  it("keeps a signed-out account that's still set", () => {
    const menu = repoRowMenu({ ...base, logins: ["ron", "noble"], account: "old" });
    assert.deepEqual(
      menu[1]?.items.map((i) => i.label),
      ["Automatic", "ron", "noble", "old (signed out)"]
    );
  });
});
