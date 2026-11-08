// Applying Conductor's defaults to trace's own settings, which live in local
// storage (`agent/defaults.ts`, Quick Open's editor), so the renderer does it.

import { agentArgsRaw, agentModelRaw, setAgentArgs, setAgentModel } from "@/domains/agent/defaults";
import { EDITORS } from "@/domains/agent/editorItems";
import { setPreferredEditor } from "@/domains/quickOpen/editorPref";
import type { ConductorDefaults, ConductorReportItem } from "@/ipc/conductorImport";
import {
  type CurrentDefaults,
  type DefaultKey,
  hasPermissionMode,
  withPermissionMode,
} from "./conductorSelection";

/** trace's current values, for what the preview starts ticked. */
export function currentDefaults(): CurrentDefaults {
  return { model: agentModelRaw().trim(), hasPermissionMode: hasPermissionMode(agentArgsRaw()) };
}

/** Apply the ticked defaults, and say what each became. */
export function applyDefaults(
  defaults: ConductorDefaults,
  ticked: Set<DefaultKey>
): ConductorReportItem[] {
  const done: ConductorReportItem[] = [];
  if (ticked.has("model") && defaults.model) {
    setAgentModel(defaults.model);
    done.push({ item: "Default model", detail: `Agents now start with ${defaults.model}.` });
  }
  if (ticked.has("permissionMode") && defaults.permissionMode) {
    setAgentArgs(withPermissionMode(agentArgsRaw(), defaults.permissionMode));
    done.push({
      item: "Permission mode",
      detail: `Agents now start with --permission-mode ${defaults.permissionMode}.`,
    });
  }
  const editor = EDITORS.find((e) => e.id === defaults.editor);
  if (ticked.has("editor") && editor) {
    setPreferredEditor(editor.id);
    done.push({ item: "Editor", detail: `Quick Open opens files in ${editor.label}.` });
  }
  return done;
}

/** The label for a default's row in the preview. */
export function defaultLabel(key: DefaultKey, defaults: ConductorDefaults): string | null {
  switch (key) {
    case "model":
      return defaults.model && `Model: ${defaults.model}`;
    case "permissionMode":
      return defaults.permissionMode && `Permission mode: ${defaults.permissionMode}`;
    case "editor": {
      const editor = EDITORS.find((e) => e.id === defaults.editor);
      return editor ? `Editor: ${editor.label}` : null;
    }
  }
}
