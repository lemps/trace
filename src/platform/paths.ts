// Paths reach the UI with either separator: Windows dialogs give `C:\repo`, git gives
// `C:/repo`. A backslash in a Unix file name is rare enough not to design around here,
// where paths are only ever shown.

/** The last component of a path, for display. */
export function basename(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}

/** `path` with forward slashes, for comparing paths that came from different places. */
export function forwardSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}
