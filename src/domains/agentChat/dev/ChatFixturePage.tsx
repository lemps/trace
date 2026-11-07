import { useEffect, useState } from "react";
import { applyChatStyle } from "@/domains/appearance/apply";
import { useAppearance } from "@/domains/appearance/store";
import { ChatActionsContext } from "../actions";
import { ChatAgentPane } from "../ChatAgentPane";
import { FIXTURE_WS, fixtureActions, seedFixture } from "./fixtureActions";
import { playSubagents } from "./fixturePlay";
import "./dev.css";

// Dev only (`npm run dev`, then /#/dev/chat): the chat view over the fixture
// journal, with a pretend agent, so the UI can be built and screenshot without
// a backend. `?theme=light` and `?expand=1` in the hash set the toolbar's
// choices for scripted screenshots; `?play=1` plays a two-subagent turn live
// (also the toolbar's "Play subagents"), `?step=<ms>` paces it. The Chat & transcript settings apply as in
// the app (from this webview's storage, as Settings left them). main.tsx only
// imports this behind `import.meta.env.DEV`, so production builds leave it
// (and the fixture) out.

type Theme = "dark" | "light" | "midnight" | "paper";

function hashParams(): URLSearchParams {
  const q = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(q);
}

export function ChatFixturePage() {
  const params = hashParams();
  const [theme, setTheme] = useState<Theme>((params.get("theme") as Theme | null) ?? "dark");
  const [expandAll, setExpandAll] = useState(params.get("expand") === "1");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    applyChatStyle();
    return useAppearance.subscribe(applyChatStyle);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on Reset
  useEffect(() => {
    seedFixture();
    if (params.get("play") === "1" && generation === 0) {
      void playSubagents(Number(params.get("step") ?? 700));
    }
  }, [generation]);

  return (
    <ChatActionsContext.Provider value={fixtureActions}>
      <div className="ac-dev">
        <div className="ac-dev-bar">
          <strong>Chat fixture</strong>
          <span className="ac-dev-note">dev only · a pretend agent answers</span>
          <fieldset className="seg">
            {(["dark", "light", "midnight", "paper"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={t === theme ? "on" : ""}
                onClick={() => setTheme(t)}
              >
                {t}
              </button>
            ))}
          </fieldset>
          <button type="button" className="btn" onClick={() => setExpandAll((v) => !v)}>
            {expandAll ? "Fold cards" : "Expand all"}
          </button>
          <button type="button" className="btn" onClick={() => void playSubagents()}>
            Play subagents
          </button>
          <button type="button" className="btn" onClick={() => setGeneration((g) => g + 1)}>
            Reset
          </button>
        </div>
        <ChatAgentPane
          key={`${generation}:${expandAll}`}
          workspaceId={FIXTURE_WS}
          expandAll={expandAll}
        />
      </div>
    </ChatActionsContext.Provider>
  );
}
