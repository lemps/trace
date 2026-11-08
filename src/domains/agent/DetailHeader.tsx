import { openUrl } from "@tauri-apps/plugin-opener";
import { BackButton } from "@/components/BackButton";
import { I } from "@/components/Icon";
import type { MenuItem } from "@/components/PopMenu";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { StatusLight } from "@/components/StatusLight";
import { StatusPill } from "@/components/StatusPill";
import type { Issue, PullRequest } from "@/domains/issues/types";
import { jiraBrowseUrl } from "@/domains/issues/url";
import type { AgentLight } from "@/domains/live/types";
import { prStateLabel } from "@/domains/prs/prState";
import type { AgentCli, AgentProvider, Transport } from "@/ipc/agent";
import { editorItems } from "./editorItems";
import { agentLabel } from "./providerLabel";
import { RestartChip } from "./RestartChip";
import { StartSplitButton } from "./StartSplitButton";

interface DetailHeaderProps {
  issue: Issue;
  /** Jira site, for the key's browse link (providers with `browseUrl` don't need it). */
  site: string | null;
  /** The agent's light, and what it's asking for when it needs you. */
  light: AgentLight;
  askLabel?: string;
  running: boolean;
  /** The agent ended by itself: offer a restart in place of Start. */
  exited: boolean;
  cli: AgentCli;
  /** Model provider behind the Claude harness (third-party Anthropic-compatible endpoint). */
  provider: AgentProvider;
  openPr: PullRequest | null;
  busy: "raise" | "merge" | null;
  onBack: () => void;
  /** The page Back returns to ("Inbox", "Board", …). */
  backLabel: string;
  onRaisePr: () => void;
  onMergePr: () => void;
  onStart: () => void;
  onStop: () => void;
  onChooseCli: (cli: AgentCli) => void;
  onChooseProvider: (provider: AgentProvider) => void;
  /** Chat or terminal for the next start; undefined = Settings' default. */
  transport: Transport | undefined;
  onChooseTransport: (transport: Transport) => void;
  /** Restart, Open in terminal / as chat (`agentChat/agentMenu`). */
  agentItems: MenuItem[];
  /** The pane layout's own (Reset layout). */
  layoutItems: MenuItem[];
}

const isLive = (state: string) => state === "open" || state === "draft";

interface PrActionProps {
  openPr: PullRequest | null;
  busy: "raise" | "merge" | null;
  onRaisePr: () => void;
  onMergePr: () => void;
}

// The header's PR button follows the PR's real state: merge an open one, view a
// finished one, and only offer "Raise PR" when the workspace has none at all.
function PrAction({ openPr, busy, onRaisePr, onMergePr }: PrActionProps) {
  if (openPr && isLive(openPr.state)) {
    return (
      <button type="button" className="btn success" onClick={onMergePr} disabled={busy === "merge"}>
        <I.Check size={13} /> {busy === "merge" ? "Merging…" : `Merge #${openPr.number}`}
      </button>
    );
  }
  if (openPr) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => void openUrl(openPr.url)}
        title={openPr.title || "Open on GitHub"}
      >
        <I.GitPR size={13} /> #{openPr.number} {prStateLabel(openPr.state)}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn"
      onClick={onRaisePr}
      disabled={busy === "raise"}
      title="Push branch and open a pull request via gh"
    >
      <I.GitPR size={13} /> {busy === "raise" ? "Raising…" : "Raise PR"}
    </button>
  );
}

// The agent workspace top bar: issue identity, live agent status, and the
// PR / session / rail actions. Purely presentational — all state lives in
// AgentDetail.
export function DetailHeader({
  issue,
  site,
  light,
  askLabel,
  running,
  exited,
  cli,
  provider,
  openPr,
  busy,
  onBack,
  backLabel,
  onRaisePr,
  onMergePr,
  onStart,
  onStop,
  onChooseCli,
  onChooseProvider,
  transport,
  onChooseTransport,
  agentItems,
  layoutItems,
}: DetailHeaderProps) {
  const issueUrl = issue.browseUrl ?? jiraBrowseUrl(site, issue.key);
  return (
    <div className="detail-top">
      <BackButton label={backLabel} onBack={onBack} />
      <div>
        <div className="detail-meta">
          {issueUrl ? (
            <button
              type="button"
              className="id id-link"
              onClick={() => void openUrl(issueUrl)}
              title={`Open ${issue.key} in the browser`}
            >
              {issue.key}
            </button>
          ) : (
            <span className="id">{issue.key}</span>
          )}
          <span className="sep">·</span>
          <StatusPill name={issue.statusName} category={issue.statusCategory} quiet />
        </div>
        <div className="ttl">{issue.summary}</div>
      </div>
      <div className="right">
        {running && <StatusLight light={light} label={askLabel} variant="pill" size="lg" />}
        <PrAction openPr={openPr} busy={busy} onRaisePr={onRaisePr} onMergePr={onMergePr} />
        {running ? (
          <button type="button" className="btn" onClick={onStop}>
            <I.X size={13} /> Stop agent
          </button>
        ) : exited ? (
          <RestartChip agentName={agentLabel(cli, provider)} onRestart={onStart} />
        ) : (
          <StartSplitButton
            cli={cli}
            provider={provider}
            onStart={onStart}
            onChoose={(nextCli, nextProvider) => {
              onChooseCli(nextCli);
              onChooseProvider(nextProvider);
            }}
            transport={transport}
            onChooseTransport={onChooseTransport}
          />
        )}
        <PopMenu
          trigger={({ toggle }) => <MoreTrigger toggle={toggle} label="More actions" />}
          sections={[
            { title: "Worktree", items: editorItems(issue.key) },
            { title: "Agent", items: agentItems },
            { title: "Layout", items: layoutItems },
          ]}
        />
      </div>
    </div>
  );
}
