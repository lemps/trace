import { createContext, useContext } from "react";
import {
  answerChatPrompt,
  interruptChatAgent,
  loadJournal,
  sendChatMessage,
  startChatAgent,
  stopChatAgent,
} from "@/ipc/agentChat";
import type { Answer, JournalRow, UserMessage } from "./types";

// What the chat view asks of its agent, behind one seam: the real backend by
// default, a stand-in on the dev fixture page (so the UI runs with no backend).

export interface ChatActions {
  load: (workspaceId: string) => Promise<JournalRow[]>;
  start: (workspaceId: string) => Promise<void>;
  send: (workspaceId: string, message: UserMessage) => Promise<void>;
  answer: (workspaceId: string, requestId: string, answer: Answer) => Promise<void>;
  interrupt: (workspaceId: string) => Promise<void>;
  stop: (workspaceId: string) => Promise<void>;
}

export const ipcChatActions: ChatActions = {
  load: loadJournal,
  start: startChatAgent,
  send: sendChatMessage,
  answer: answerChatPrompt,
  interrupt: interruptChatAgent,
  stop: stopChatAgent,
};

export const ChatActionsContext = createContext<ChatActions>(ipcChatActions);

export function useChatActions(): ChatActions {
  return useContext(ChatActionsContext);
}
