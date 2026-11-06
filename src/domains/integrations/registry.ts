import type { ProviderKind, ProviderSession } from "@/domains/issues/types";
import jiraLogo from "./logos/jira.svg";
import pylonLogo from "./logos/pylon.png";

export interface Integration {
  kind: ProviderKind;
  name: string;
  /** Bundled, so the page never loads anything remote and works offline. */
  logo: string;
  /** Shown on its card and at the top of its dialog. */
  description: string;
  /** The connected account, for the dialog. */
  account: (session: ProviderSession) => string;
}

// What the Integrations page offers. Each one adds its own page to the rail (`app/nav.ts`).
export const INTEGRATIONS: Integration[] = [
  {
    kind: "jira",
    name: "Jira",
    logo: jiraLogo,
    description: "Your Jira boards, with an agent one click from any ticket.",
    account: (session) => [session.site, session.email].filter(Boolean).join(" · "),
  },
  {
    kind: "pylon",
    name: "Pylon",
    logo: pylonLogo,
    description: "Your open Pylon issues on their own board, ready for an agent.",
    account: () => "api.usepylon.com",
  },
];
