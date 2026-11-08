import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import { summarizeTool, type ToolCategory } from "./toolSummary";

// The one icon per kind of tool call, the same on a chat tool card and a
// transcript tool row: an edit is the pencil in both, a read the file.

type Glyph = (p: { size?: number }) => ReactNode;

const GLYPHS: Record<ToolCategory, Glyph> = {
  run: I.Terminal,
  read: I.File,
  edit: I.Pencil,
  search: I.Search,
  web: I.Globe,
  agent: I.Sparkles,
  plan: I.List,
  other: I.Code,
};

/** The glyph for a call to `name`: an MCP tool's is the plug, others by category. */
export function toolGlyph(name: string, category?: ToolCategory): Glyph {
  if (name.startsWith("mcp__")) return I.Plug;
  return GLYPHS[category ?? summarizeTool(name, undefined).category];
}
