import { createContext, useContext } from "react";
import {
  answerChatPrompt,
  interruptChatAgent,
  loadJournal,
  sendChatMessage,
} from "@/ipc/agentChat";
import type { Answer, JournalRow, UserMessage } from "./types";

// What the chat view asks of its agent, behind one seam: the real backend by
// default, a stand-in on the dev fixture page (so the UI runs with no backend).
// Starting and stopping aren't here: they go through the same paths as a
// terminal agent (the view's own Start / Stop), which pick the transport.

export interface ChatActions {
  load: (workspaceId: string) => Promise<JournalRow[]>;
  send: (workspaceId: string, message: UserMessage) => Promise<void>;
  answer: (workspaceId: string, requestId: string, answer: Answer) => Promise<void>;
  interrupt: (workspaceId: string) => Promise<void>;
}

export const ipcChatActions: ChatActions = {
  load: loadJournal,
  send: sendChatMessage,
  answer: answerChatPrompt,
  interrupt: interruptChatAgent,
};

export const ChatActionsContext = createContext<ChatActions>(ipcChatActions);

export function useChatActions(): ChatActions {
  return useContext(ChatActionsContext);
}
