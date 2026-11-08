import { useEffect } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Markdown } from "@/components/Markdown";
import type { Issue, IssueComment } from "@/domains/issues/types";
import { fullTime, shortTime } from "@/domains/plans/time";
import { useCommentsStore, useTicketComments } from "./commentsStore";

/** A tracker timestamp as ms. Jira writes `+0000`, which WebKit's parser refuses. */
function parseTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isNaN(ms) ? null : ms;
}

function Comment({ comment }: { comment: IssueComment }) {
  const at = parseTime(comment.created);
  const author = {
    accountId: "",
    displayName: comment.author,
    initial: comment.author.trim().charAt(0).toUpperCase() || "?",
  };
  return (
    <li className="tk-comment">
      <AgentAvatar assignee={author} />
      <div className="tk-comment-main">
        <div className="tk-comment-head">
          <span className="tk-comment-author">{comment.author}</span>
          {comment.isInternal && <span className="tk-chip">Internal</span>}
          {at !== null && (
            <time
              className="tk-comment-time"
              dateTime={comment.created ?? undefined}
              title={fullTime(at)}
            >
              {shortTime(at)}
            </time>
          )}
        </div>
        <Markdown text={comment.body} className="tk-comment-body" />
      </div>
    </li>
  );
}

/** The ticket's discussion, oldest first, reloaded each time the tab opens. */
export function TicketComments({ issue }: { issue: Issue }) {
  const { comments, loading, error } = useTicketComments(issue.key);
  const load = useCommentsStore((s) => s.load);
  const reload = () => void load(issue.key, issue.id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per ticket shown
  useEffect(reload, [issue.key, issue.id]);

  const count = comments?.length ?? 0;
  return (
    <section className="tk-section" aria-label="Comments">
      <h2 className="tk-label">
        Comments
        {count > 0 && <span className="tk-count">{count}</span>}
      </h2>
      {error ? (
        <div className="tk-empty">
          Couldn't load the comments: {error}
          <button type="button" className="btn" onClick={reload}>
            Try again
          </button>
        </div>
      ) : comments === null ? (
        <div className="tk-empty">{loading ? "Loading comments…" : "No comments yet."}</div>
      ) : count === 0 ? (
        <div className="tk-empty">No comments yet.</div>
      ) : (
        <ol className="tk-comments">
          {comments.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a thread's comments are positional
            <Comment key={i} comment={c} />
          ))}
        </ol>
      )}
    </section>
  );
}
