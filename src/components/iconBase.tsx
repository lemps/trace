import type { CSSProperties, ReactNode } from "react";

// The stroked 24-unit frame every icon in `I` is drawn in.

export interface IconProps {
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

interface BaseProps extends IconProps {
  children: ReactNode;
}

export function Base({ size = 16, stroke = 1.6, children, style }: BaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
