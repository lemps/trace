import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Native window chrome that follows Appearance: the title bar's light/dark,
// and the webview's zoom (the "Interface size" setting). Both are cosmetic, so
// a failure (e.g. a platform without the API) is ignored rather than surfaced.

/** Match the native title bar (and macOS vibrancy) to the theme's scheme. */
export function setWindowTheme(scheme: "dark" | "light"): void {
  void getCurrentWindow()
    .setTheme(scheme)
    .catch(() => {});
}

/** Zoom the whole interface; 1 = 100%. */
export function setInterfaceZoom(factor: number): void {
  void getCurrentWebview()
    .setZoom(factor)
    .catch(() => {});
}
