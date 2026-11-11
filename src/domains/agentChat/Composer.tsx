import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { isShortcut } from "@/platform/shortcuts";
import { AgentOptionPickers } from "./AgentOptionPickers";
import { AttachmentChips } from "./AttachmentChips";
import { useComposerFill } from "./composerFill";
import { useDrafts, useDraftText } from "./drafts";
import { useAttachments } from "./hooks/useAttachments";
import { type DeliverHow, useDeliver } from "./hooks/useDeliver";
import { useSlash } from "./hooks/useSlash";
import { QueueList } from "./QueueList";
import { SendSlot } from "./SendSlot";
import { SlashMenu } from "./SlashMenu";
import { keepExisting } from "./sendFiles";
import { expandSaved } from "./slash";

interface ComposerProps {
  workspaceId: string;
  /** A turn is running: Enter queues. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it): there's something to interrupt. */
  working: boolean;
  /** A question or approval above waits on you: the box asks for the answer. */
  waiting?: boolean;
  onInterrupt: () => void;
  slashCommands: readonly string[];
  /** The agent is up: an option picked goes to it, not to its next start. */
  running: boolean;
  /** Set while the agent is stopped: sending starts it, and the message waits in the queue. */
  onStart?: () => void;
}

/** A drag carries files from the desktop (not a pane tab or a card). */
const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

// Where you talk to the agent (on its own tab; its subagents' tabs are read-only). Enter
// sends (Shift+Enter is a new line). While a turn runs, Enter steers it: the
// agent reads the message after its current step. ⌥Enter queues it for when the
// turn ends instead, and ⌘Enter interrupts the turn and sends it (`useDeliver`).
// The box grows to show the whole message. Files go with it from the paperclip, a
// paste (a screenshot) or a drop onto the box. Esc interrupts (the pane hears it,
// wherever focus is). Typing `/` lists the agent's slash commands and the user's
// saved prompts; `/name` + Enter puts a saved prompt's text in the box. What's typed
// and attached is the workspace's draft (`drafts.ts`): it waits, across closing the
// detail and restarts, until it's sent. Send and Stop share one slot (`SendSlot`),
// which gains a caret for the other ways to send while the agent works: what each
// does is in that menu, and the keys in the buttons' tooltips and the cheat sheet,
// not spelled out in the box or under it.
export function Composer({
  workspaceId,
  busy,
  working,
  waiting = false,
  onInterrupt,
  slashCommands,
  running,
  onStart,
}: ComposerProps) {
  const text = useDraftText(workspaceId);
  const setText = (next: string) => useDrafts.getState().setText(workspaceId, next);
  const [dropping, setDropping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Sends wait their turn while one checks its files, so they go in the order typed. */
  const sendChain = useRef(Promise.resolve());
  const files = useAttachments(workspaceId);
  const slash = useSlash(text, setText, slashCommands);
  // Fit the box to its text: all of it shows, however long (no inner scroll).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  // Text put here from elsewhere (the Plan tab), to edit and send yourself.
  const pending = useComposerFill((s) => s.pending[workspaceId]);
  useEffect(() => {
    if (pending === undefined) return;
    const text = useComposerFill.getState().take(workspaceId);
    if (!text) return;
    const was = useDrafts.getState().drafts[workspaceId]?.text ?? "";
    useDrafts.getState().setText(workspaceId, was.trim() ? `${was}\n\n${text}` : text);
    inputRef.current?.focus();
  }, [pending, workspaceId]);
  const matches = slash.matches;

  const attached = files.paths;
  const hasDraft = text.trim() !== "" || attached.length > 0 || files.saving;
  const canSend = hasDraft && !files.saving;
  const deliver = useDeliver({ workspaceId, busy, working, onInterrupt, onStart });
  const submit = (how: DeliverHow = "now") => {
    if (!canSend) return;
    // `/name` for a saved prompt fills the box with it, to edit before sending.
    const saved = expandSaved(text, slash.entries);
    if (saved !== null) {
      setText(saved);
      return;
    }
    const message = text.trim();
    useDrafts.getState().clear(workspaceId);
    // A draft can outlive its files (a restart, a swept paste): leave off the gone ones.
    sendChain.current = sendChain.current
      .then(() => keepExisting(attached))
      .then((kept) => deliver(message, kept, how))
      .catch((e) => {
        toast.error(`Couldn't send: ${String(e)}`);
      });
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = [...e.clipboardData.files];
    if (pasted.length === 0) return;
    e.preventDefault();
    files.addFiles(pasted);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!carriesFiles(e)) return;
    e.preventDefault();
    files.addFiles([...e.dataTransfer.files]);
    inputRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME is composing commits the candidate; it isn't a send.
    if (e.nativeEvent.isComposing) return;
    if (slash.onKey(e)) return;
    const how: DeliverHow | null = isShortcut("chatSend", e)
      ? "now"
      : isShortcut("chatQueue", e)
        ? "queue"
        : isShortcut("chatInterruptSend", e)
          ? "interrupt"
          : null;
    if (how === null) return;
    e.preventDefault();
    submit(how);
  };

  return (
    <div className="ac-composer-wrap">
      <QueueList workspaceId={workspaceId} stopped={!running} busy={busy} deliver={deliver} />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping files is a shortcut; the Attach button is the keyboard path */}
      <div
        className={`ac-composer${dropping ? " dropping" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        {matches && <SlashMenu matches={matches} active={slash.active} onPick={slash.pick} />}
        <AttachmentChips paths={attached} saving={files.saving} onRemove={files.remove} />
        <textarea
          ref={inputRef}
          className="ac-input"
          aria-label="Message the agent"
          placeholder={
            onStart
              ? "Message the agent to start it"
              : waiting
                ? "Answer above, or message the agent"
                : busy
                  ? "Steer the agent"
                  : "Message the agent"
          }
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            slash.reset();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <div className="ac-composer-bar">
          <IconButton
            className="ac-attach"
            label="Attach files"
            title="Attach files, or paste or drop them here"
            onClick={files.pick}
          >
            <I.Paperclip size={14} />
          </IconButton>
          <IconButton
            className="ac-commands"
            label="Slash commands"
            title={
              text.trim() && !text.startsWith("/")
                ? "Clear the box to pick a command, or type / at its start"
                : undefined
            }
            disabled={Boolean(text.trim()) && !text.startsWith("/")}
            onClick={() => {
              if (!text.startsWith("/")) setText("/");
              slash.reset();
              inputRef.current?.focus();
            }}
          >
            <I.Slash size={14} />
          </IconButton>
          <AgentOptionPickers workspaceId={workspaceId} running={running} />
          <SendSlot
            busy={busy}
            working={working}
            hasDraft={hasDraft}
            canSend={canSend}
            starts={onStart !== undefined}
            onSend={submit}
            onStop={onInterrupt}
          />
        </div>
      </div>
    </div>
  );
}
