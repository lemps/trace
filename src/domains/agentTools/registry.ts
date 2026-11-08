import type Anthropic from "@anthropic-ai/sdk";
import { buildBoardContext } from "@/domains/orchestrator/context";
import { runWriteTool, WRITE_TOOL_NAMES, WRITE_TOOLS } from "@/domains/orchestrator/mutations";
import { READ_TOOLS, runReadTool } from "@/domains/orchestrator/tools";
import type { McpTool } from "@/ipc/agentTools";
import { isMoreTool, MORE_TOOLS, runMoreTool } from "./moreTools";
import { PUBLISH_DOCUMENT, runPublishDocument } from "./publishTool";
import { runScheduleTool, SCHEDULE_TOOLS } from "./scheduleTools";
import { isSessionTool, runSessionTool, SESSION_TOOLS } from "./sessionTools";
import { runUpdateUser, UPDATE_USER } from "./updateTool";

// The tools trace offers its own agents over MCP: the board, scheduled prompts,
// standalone sessions (`sessionTools`), and publishing a document to the Plan tab. The board ones are the
// orchestrator's — same definitions, same store, same effects as the in-app
// assistant — so an agent on an epic can move its tickets and start agents on
// them without spawning sub-agents. Unlike the assistant, there's no confirm
// card: agents act on their own (except add_repo / clone_repo, `moreTools`).

const GET_BOARD: Anthropic.Tool = {
  name: "get_board",
  description:
    "Read the trace board as it's shown now: sprint, columns, every ticket in scope (key, status, type, epic, assignee, agent and PR state) and recent activity. Start here before moving tickets or starting agents.",
  input_schema: { type: "object", properties: {}, required: [] },
};

const SCHEDULE_TOOL_NAMES = new Set(SCHEDULE_TOOLS.map((t) => t.name));

const TOOLS: Anthropic.Tool[] = [
  GET_BOARD,
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...SCHEDULE_TOOLS,
  ...SESSION_TOOLS,
  UPDATE_USER,
  ...MORE_TOOLS,
  PUBLISH_DOCUMENT,
];

/** The tool definitions in MCP's shape. */
export function mcpTools(): McpTool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.input_schema,
  }));
}

/** Run one tool for the agent `caller` (its workspace id). Returns the text for the model. */
export async function runAgentTool(name: string, input: unknown, caller: string): Promise<string> {
  if (name === GET_BOARD.name) return buildBoardContext();
  if (name === UPDATE_USER.name) return runUpdateUser(input, caller);
  if (name === PUBLISH_DOCUMENT.name) return runPublishDocument(input, caller);
  if (WRITE_TOOL_NAMES.has(name)) return runWriteTool(name, input, "agent");
  if (SCHEDULE_TOOL_NAMES.has(name)) return runScheduleTool(name, input);
  if (isSessionTool(name)) return runSessionTool(name, input, caller);
  if (isMoreTool(name)) return runMoreTool(name, input, caller);
  return runReadTool(name, input);
}
