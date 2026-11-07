import { openUrl } from "@tauri-apps/plugin-opener";
import { type MouseEvent, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileLink } from "@/domains/transcript/FileLink";
import { resolvePath, useChatView } from "./chatContext";

// An agent's Markdown, as the shared `<Markdown>` renders it (react-markdown +
// GFM, no raw HTML), plus file links: an inline code span or a link that names
// a file (`src/a.ts`, `src/a.ts:42`) becomes the transcript's FileLink, which
// opens it in an editor or copies its path.

/** A path with a directory and an extension, optionally `:line` or `:line:col`. */
const FILE_REF = /^(?:[a-zA-Z]:)?[\w.@~-]*[\\/][\w./\\@~ -]*\.[\w]{1,8}(?::\d+(?:[:-]\d+)?)?$/;

/** The path part of a file reference, or null when `text` isn't one. */
export function fileRef(text: string): string | null {
  const t = text.trim();
  if (!FILE_REF.test(t) || /^https?:/.test(t)) return null;
  return t.replace(/:\d+(?:[:-]\d+)?$/, "");
}

function textOf(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

function InlineFile({ text }: { text: string }) {
  const { workspaceId, root } = useChatView();
  const path = fileRef(text);
  if (!path) return <code>{text}</code>;
  return <FileLink workspaceId={workspaceId} path={resolvePath(path, root)} root={root} />;
}

const components: Components = {
  // A file link's menu is a block element, which a <p> can't hold.
  p: ({ children }) => <div className="ac-p">{children}</div>,
  a: ({ href, children }) => {
    const target = href && !/^[a-z]+:/i.test(href) ? fileRef(href) : null;
    if (target) return <InlineFile text={href ?? ""} />;
    return (
      <a
        href={href}
        className="md-link"
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          if (href && /^https?:\/\//.test(href)) void openUrl(href);
        }}
      >
        {children}
      </a>
    );
  },
  code: ({ className, children }) => {
    const text = textOf(children);
    // Fenced blocks carry a language class or span lines; only inline spans link.
    if (className || text.includes("\n")) return <code className={className}>{children}</code>;
    return <InlineFile text={text} />;
  },
};

const remarkPlugins = [remarkGfm];

/** Parsing is the costly part of a render; text that hasn't changed isn't re-parsed. */
export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="md ac-md">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
