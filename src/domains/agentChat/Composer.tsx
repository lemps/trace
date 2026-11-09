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
import { isShortcut } from "@/platform/shortcuts";
import { AgentOptionPickers } from "./AgentOptionPickers";
import { AttachmentChips } from "./AttachmentChips";
import { useChatActions } from "./actions";
import { useComposerFill } from "./composerFill";
import { useDrafts, useDraftText } from "./drafts";
import { useAttachments } from "./hooks/useAttachments";
import { useSlash } from "./hooks/useSlash";
import { QueueList } from "./QueueList";
import { SendSlot } from "./SendSlot";
import { SlashMenu } from "./SlashMenu";
import { keepExisting } from "./sendFiles";
import { expandSaved } from "./slash";
import { useAgentChatStore } from "./store";

interface ComposerProps {
  workspaceId: string;
  /** A turn is running: Enter queues. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it): there's something to interrupt. */
  working: boolean;
  onInterrupt: () => void;
  /** A subagent's tab is showing; messages still go to the main agent. */
  toMain: boolean;
  slashCommands: readonly string[];
  /** The agent is up: an option picked goes to it, not to its next start. */
  running: boolean;
  /** Set while the agent is stopped: sending starts it, and the message waits in the queue. */
  onStart?: () => void;
}

/** A drag carries files from the desktop (not a pane tab or a card). */
const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

// Where you talk to the agent (the main one; subagents are read-only). Enter
// sends (Shift+Enter is a new line); while a turn runs, Enter queues the message
// instead. The box grows to show the whole message. Files go with it from the
// paperclip, a paste (a screenshot) or a drop onto the box. Esc interrupts (the pane
// hears it, wherever focus is). Typing `/` lists the agent's slash commands and the
// user's saved prompts; `/name` + Enter puts a saved prompt's text in the box. What's
// typed and attached is the workspace's draft (`drafts.ts`): it waits, across closing
// the detail and restarts, until it's sent. Send, Queue and Stop share one slot
// (`SendSlot`). The keys are in the buttons' tooltips and the cheat sheet, not spelled
// out under the box.
export function Composer({
  workspaceId,
  busy,
  working,
  onInterrupt,
  toMain,
  slashCommands,
  running,
  onStart,
}: ComposerProps) {
  const actions = useChatActions();
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
  const slashHint = slash.entries.length > 0 ? ", / for commands" : "";

  const attached = files.paths;
  const hasDraft = text.trim() !== "" || attached.length > 0 || files.saving;
  const canSend = hasDraft && !files.saving;
  const deliver = (message: string, attachments: string[]) => {
    if (message === "" && attachments.length === 0) return;
    const { queues, sending, enqueue, setSending } = useAgentChatStore.getState();
    // Writing to a stopped agent means wanting it: start it, and the queue sends this once it's up.
    if (onStart) {
      enqueue(workspaceId, message, attachments);
      onStart();
      return;
    }
    if (busy || sending[workspaceId] || (queues[workspaceId]?.length ?? 0) > 0) {
      enqueue(workspaceId, message, attachments);
      return;
    }
    setSending(workspaceId, true);
    void actions.send(workspaceId, { text: message, attachments }).catch((e) => {
      setSending(workspaceId, false);
      // Back in the box to try again (whatever was typed since is replaced, as before).
      useDrafts.getState().setText(workspaceId, message);
      useDrafts.getState().setAttachments(workspaceId, attachments);
      toast.error(`Couldn't send: ${String(e)}`);
    });
  };
  const submit = () => {
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
      .then((kept) => deliver(message, kept))
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
    if (isShortcut("chatSend", e)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="ac-composer-wrap">
      <QueueList workspaceId={workspaceId} stopped={!running} />
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
              ? `Message the agent to start it${slashHint}`
              : busy
                ? `Queue a message for when this turn ends${slashHint}`
                : toMain
                  ? `Message the main agent${slashHint}`
                  : `Message the agent${slashHint}`
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
          <button
            type="button"
            className="btn icon ac-attach"
            onClick={files.pick}
            title="Attach files (or paste or drop them here)"
            aria-label="Attach files"
          >
            <I.Paperclip size={14} />
          </button>
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
