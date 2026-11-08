import tailscaleLogo from "./logos/tailscale.svg";

// Tailscale on the Integrations page. Like Vercel it isn't an issue tracker: it's
// how trace on one of your computers reaches trace on another, over your tailnet.
// Tailscale's own app connects it; trace reads its state.
export const TAILSCALE = {
  name: "Tailscale",
  logo: tailscaleLogo,
  description: "Reach trace on your other computers over your tailnet, to run sessions there.",
};
