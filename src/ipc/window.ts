import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Native window chrome that follows Appearance: the title bar's light/dark,
// and the webview's zoom (the "Interface size" setting). Both are cosmetic, so
// a failure (e.g. a platform without the API) is ignored rather than surfaced.

/**
 * Match the native title bar to the theme's scheme, or `null` to follow the OS.
 * The window theme also sets the webview's prefers-color-scheme, so the
 * "System" theme must pass null — pinning it would stop the OS reaching us.
 */
export function setWindowTheme(scheme: "dark" | "light" | null): void {
  void getCurrentWindow()
    .setTheme(scheme)
    .catch(() => {});
}

/** Zoom the whole interface; 1 = 100%. Resolves once the zoom is applied (or failed). */
export function setInterfaceZoom(factor: number): Promise<void> {
  return getCurrentWebview()
    .setZoom(factor)
    .catch(() => {});
}
