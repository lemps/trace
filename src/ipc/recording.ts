import { invoke } from "@tauri-apps/api/core";

// Typed wrappers around `commands/recording.rs`: the homepage clip recorder's
// commands, which exist only in a `recording` build. Imported only by
// `recording/bridge.ts`, so other builds leave this module out.

/** Where the recorder's driver listens, and the token it expects. */
export interface RecordingBridge {
  port: number;
  token: string;
}

/** One frame written by a capture: its file name, and when (Unix seconds). */
export interface RecordingFrame {
  name: string;
  t: number;
}

/** The driver to connect to, or null when trace wasn't launched by the recorder. */
export function recordingBridge(): Promise<RecordingBridge | null> {
  return invoke<RecordingBridge | null>("recording_bridge");
}

/** Size the window so the page is `width` × `height` CSS pixels. */
export function recordingViewport(width: number, height: number): Promise<void> {
  return invoke("recording_viewport", { width, height });
}

/** A rectangle on the page, in CSS pixels. */
export interface RecordingArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A still: the child webviews' snapshots, and where each sits on the page. */
export interface RecordingStill {
  layers: { file: string; area: RecordingArea }[];
}

/**
 * Save one PNG of the page (`width` × `height`) to the absolute `path`; with
 * `children`, each visible child webview (a Browser-tab page) beside it.
 */
export function recordingSnapshot(
  path: string,
  width: number,
  height: number,
  children: boolean
): Promise<RecordingStill> {
  return invoke<RecordingStill>("recording_snapshot", { path, width, height, children });
}

/** Start writing frames of the `width` × `height` page into the absolute `dir`. */
export function recordingCaptureStart(
  dir: string,
  fps: number,
  width: number,
  height: number
): Promise<void> {
  return invoke("recording_capture_start", { dir, fps, width, height });
}

/** Stop the capture; the frames written, in order. */
export function recordingCaptureStop(): Promise<RecordingFrame[]> {
  return invoke<RecordingFrame[]>("recording_capture_stop");
}
