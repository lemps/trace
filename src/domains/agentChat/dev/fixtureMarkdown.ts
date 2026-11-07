import type { JournalRow } from "../types.ts";
import { row, say, user } from "./fixtureRows.ts";

// A turn whose reply uses most of GFM — headings, a table, a task list, a
// quote, a link, fenced code in two languages — so the Markdown rendering and
// the Chat & transcript settings can be seen (and screenshot) in one place.

const REPLY = `## Options

There are two ways to stop the re-sort; **copying first** is the smaller change.

| Option | Lines | Risk |
| --- | ---: | --- |
| Copy before sorting | 1 | none |
| Sort in the store | 14 | touches \`useBoardStore\` |

### Next steps

- [x] Reproduce the flicker
- [ ] Copy before sorting
- [ ] Add a regression test

> Sorting in place is also why the *Fleet* order jumped last week.

\`\`\`bash
npm test -- --test-name-pattern ranks
\`\`\`

See the [Array.prototype.toSorted docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted) for the non-mutating form.`;

export function markdownTurn(): JournalRow[] {
  return [
    user("um", "tm", "Compare the two fixes as a table, and list what's left.\nKeep it short."),
    say("am", "tm", REPLY),
    row("turnm", "tm", { kind: "turn", turnId: "tm", state: "completed", durationMs: 9_000 }),
  ];
}
