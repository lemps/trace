import { invoke } from "@tauri-apps/api/core";

// Tailscale (`commands/tailscale.rs`): whether this computer is on a tailnet, and
// which other devices are. Read from the local Tailscale app; no key involved.

export type TailnetState = "notInstalled" | "stopped" | "needsLogin" | "running";

export interface TailnetDevice {
  name: string;
  /** MagicDNS name, e.g. "mac-mini.tail1234.ts.net". */
  dnsName: string | null;
  /** IPv4 tailnet address. */
  ip: string | null;
  os: string | null;
  online: boolean;
}

export interface TailscaleStatus {
  state: TailnetState;
  /** The tailnet's name; a personal one is named after its owner's login. */
  tailnet: string | null;
  /** This computer. */
  device: TailnetDevice | null;
  /** Every other device, online ones first. */
  peers: TailnetDevice[];
}

export function tailscaleStatus(): Promise<TailscaleStatus> {
  return invoke("tailscale_status");
}
