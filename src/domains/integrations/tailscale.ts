import tailscaleLogo from "./logos/tailscale.svg";

// Tailscale on the Integrations page. Like Vercel it isn't an issue tracker: it's
// how trace on one of your computers reaches trace on another, over your tailnet.
// Tailscale's own app connects it; trace reads its state. A preview: it shows
// status only, so its words mustn't promise that sessions run there.
export const TAILSCALE = {
  name: "Tailscale",
  logo: tailscaleLogo,
  description: "See this computer's tailnet and which of your other computers are online.",
  preview: true,
};
