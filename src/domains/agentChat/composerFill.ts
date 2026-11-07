import { create } from "zustand";

// Text waiting to go into a chat agent's composer, unsent: from outside the chat
// (the Plan tab's "Send to agent as context"). Kept until the composer is on
// screen to take it, since the chat may be in a tab that isn't shown.

interface ComposerFill {
  pending: Record<string, string>;
  /** Add `text` to what the workspace's composer will get. */
  fill: (workspaceId: string, text: string) => void;
  /** Hand over and forget what's waiting. */
  take: (workspaceId: string) => string | null;
}

export const useComposerFill = create<ComposerFill>((set, get) => ({
  pending: {},
  fill(workspaceId, text) {
    set((s) => {
      const was = s.pending[workspaceId];
      return { pending: { ...s.pending, [workspaceId]: was ? `${was}\n\n${text}` : text } };
    });
  },
  take(workspaceId) {
    const text = get().pending[workspaceId] ?? null;
    if (text !== null) {
      set((s) => {
        const { [workspaceId]: _, ...rest } = s.pending;
        return { pending: rest };
      });
    }
    return text;
  },
}));
