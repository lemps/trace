import { useCallback, useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { type McpServerStatus, mcpServers } from "@/ipc/mcp";

/** The MCP servers list, read on mount; `set` takes the list an action returns. */
export function useMcpServers(): {
  servers: McpServerStatus[] | null;
  set: (list: McpServerStatus[]) => void;
  reload: () => void;
} {
  const [servers, set] = useState<McpServerStatus[] | null>(null);
  const reload = useCallback(() => {
    mcpServers()
      .then(set)
      .catch((e) => toast.error(`Couldn't list MCP servers: ${String(e)}`));
  }, []);
  useEffect(reload, [reload]);
  return { servers, set, reload };
}
