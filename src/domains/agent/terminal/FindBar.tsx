import type { Terminal } from "@xterm/xterm";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { isTerminalFind } from "@/platform/shortcuts";
import { clearFind, type FindFlags, findInTerminal, onFindResults } from "./search";

interface FindBarProps {
  term: Terminal;
  /** Bumped each time find is asked for again, to refocus the box. */
  request: number;
  onClose: () => void;
}

/** "3 of 12", or what's wrong. */
function countLabel(query: string, index: number, count: number, isFound: boolean): string {
  if (query === "") return "";
  if (!isFound || count === 0) return "No matches";
  // Over the highlight limit the addon stops counting where the active one is.
  return index < 0 ? `${count}+ matches` : `${index + 1} of ${count}`;
}

// Find in a terminal's scrollback: matches highlight as you type, Enter and
// Shift+Enter step through them, Escape closes and hands the keys back to the terminal.
export function FindBar({ term, request, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // A short one-line selection is what you're looking for, as in an editor.
  const [query, setQuery] = useState(() => {
    const picked = term.getSelection();
    return picked.length <= 200 && !picked.includes("\n") ? picked : "";
  });
  const [flags, setFlags] = useState<FindFlags>({ caseSensitive: false, regex: false });
  const [result, setResult] = useState({ index: -1, count: 0 });
  const [isFound, setIsFound] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `request` is the refocus signal
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [request]);

  useEffect(() => onFindResults(term, (index, count) => setResult({ index, count })), [term]);
  useEffect(() => () => clearFind(term), [term]);

  // Typing searches from where the current match is, so it doesn't jump ahead.
  useEffect(() => {
    if (query === "") {
      clearFind(term);
      setResult({ index: -1, count: 0 });
      setIsFound(true);
      return;
    }
    setIsFound(findInTerminal(term, query, flags, "next", true));
  }, [term, query, flags]);

  const step = (dir: "next" | "prev") => {
    if (query !== "") setIsFound(findInTerminal(term, query, flags, dir));
  };
  const close = () => {
    onClose();
    term.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? "prev" : "next");
    } else if (e.key === "Escape") {
      // Don't let Escape also close the detail view around the terminal.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (isTerminalFind(e.nativeEvent)) {
      e.preventDefault();
      inputRef.current?.select();
    }
  };

  const toggle = (flag: keyof FindFlags) => setFlags((f) => ({ ...f, [flag]: !f[flag] }));
  const label = countLabel(query, result.index, result.count, isFound);

  return (
    <search className="term-find" aria-label="Find in terminal">
      <I.Search size={13} />
      <input
        ref={inputRef}
        className="term-find-input"
        value={query}
        placeholder="Find in scrollback"
        aria-label="Find in scrollback"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className={`term-find-count${isFound ? "" : " none"}`} aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className={`term-find-btn${flags.caseSensitive ? " on" : ""}`}
        aria-pressed={flags.caseSensitive}
        aria-label="Match case"
        title="Match case"
        onClick={() => toggle("caseSensitive")}
      >
        Aa
      </button>
      <button
        type="button"
        className={`term-find-btn${flags.regex ? " on" : ""}`}
        aria-pressed={flags.regex}
        aria-label="Regular expression"
        title="Regular expression"
        onClick={() => toggle("regex")}
      >
        .*
      </button>
      <IconButton
        size="xs"
        className="ghost term-find-up"
        label="Previous match"
        disabled={query === ""}
        onClick={() => step("prev")}
      >
        <I.Chevron size={12} />
      </IconButton>
      <IconButton
        size="xs"
        className="ghost term-find-down"
        label="Next match"
        disabled={query === ""}
        onClick={() => step("next")}
      >
        <I.Chevron size={12} />
      </IconButton>
      <IconButton size="xs" className="ghost" label="Close find" onClick={close}>
        <I.X size={12} />
      </IconButton>
    </search>
  );
}
