import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_ICON_SIZE, strokeFor } from "./iconScale";

// The stroked 24-unit frame every icon in `I` is drawn in.

export interface IconProps {
  /** Pixels. Use the scale (`ICON_SIZE`): 12 in xs controls, 14 in `.btn`/sm, 16 in rail/nav/empty states. */
  size?: number;
  /** Frame stroke. Leave unset: it's compensated per size so every icon draws ~1.1px. */
  stroke?: number;
  style?: CSSProperties;
}

interface BaseProps extends IconProps {
  children: ReactNode;
}

export function Base({ size = DEFAULT_ICON_SIZE, stroke, children, style }: BaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke ?? strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
