interface SpinnerProps {
  /** Diameter in px; matches the icon it stands in for (13 in a .btn). */
  size?: number;
}

/**
 * A neutral busy ring in the text colour, for "Saving…"-style buttons. Not agent
 * state: an agent that's working is `StatusLight`'s blue spinner, and a Refresh
 * icon only spins while it's refreshing.
 */
export function Spinner({ size = 13 }: SpinnerProps) {
  return <span className="spinner" style={{ width: size, height: size }} role="presentation" />;
}
