import { memo } from "react";
import { ApprovalCard } from "./ApprovalCard";
import { DiffCard } from "./DiffCard";
import { MessageRow } from "./MessageRow";
import { PlanCard } from "./PlanCard";
import type { ChatItem } from "./projection";
import { QuestionCard } from "./QuestionCard";
import { ToolCard } from "./ToolCard";
import { StatusRow } from "./TurnBits";

function ItemSwitch({ item }: { item: ChatItem }) {
  switch (item.type) {
    case "message":
      return <MessageRow message={item.message} />;
    case "tool":
      return <ToolCard item={item} />;
    case "diff":
      return <DiffCard diff={item.diff} />;
    case "plan":
      return <PlanCard plan={item.plan} />;
    case "approval":
      return <ApprovalCard approval={item.approval} />;
    case "question":
      return <QuestionCard questions={item.questions} />;
    case "status":
      return <StatusRow status={item.status} />;
  }
}

/**
 * One item of a turn. Items are rebuilt on every journal change, but their
 * `version` only grows when they (or what's attached to them) change, so the
 * rest skip rendering while one message streams.
 */
export const ItemView = memo(
  ItemSwitch,
  (a, b) => a.item.row.id === b.item.row.id && a.item.version === b.item.version
);
