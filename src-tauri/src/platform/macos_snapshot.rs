//! Snapshots of trace's webviews for the homepage clip recorder (`recording` builds
//! only). WKWebView renders its own content to an image, so this needs no Screen
//! Recording permission. Each webview is snapshotted on its own: the Browser tab's
//! pages are separate native webviews, which a still composites over the page
//! using `frame_in_window`.
//!
//! The snapshot arrives on the main thread as an `NSImage`; its bitmap is copied
//! out there and the PNG encoded and written on a thread of its own, so the page
//! keeps painting while frames are saved.

use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::autoreleasepool;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{NSData, NSDictionary, NSError, NSPoint, NSRect, NSSize};
use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};

use super::ports::{Area, PageSnapshot, SnapshotDone};
use super::Os;

/// `done`, shared by the paths that may finish a snapshot; whichever runs first
/// calls it.
type Shared = Arc<Mutex<Option<SnapshotDone>>>;

fn finish(done: &Shared, result: Result<(), String>) {
    if let Some(done) = done.lock().ok().and_then(|mut d| d.take()) {
        done(result);
    }
}

/// The WKWebView behind `view`.
///
/// # Safety
/// `view` must be `PlatformWebview::inner` on macOS, used on the main thread
/// during the `with_webview` call that gave it.
unsafe fn wk<'a>(view: *mut c_void) -> Result<&'a WKWebView, String> {
    if view.is_null() {
        return Err("no webview".into());
    }
    Ok(&*view.cast::<WKWebView>())
}

impl PageSnapshot for Os {
    fn snapshot_png(
        webview: &tauri::Webview,
        path: PathBuf,
        area: Option<Area>,
        done: SnapshotDone,
    ) {
        let done: Shared = Arc::new(Mutex::new(Some(done)));
        let failed = done.clone();
        // The webview is the main thread's; `with_webview` runs there.
        let sent = webview.with_webview(move |platform| {
            if let Err(e) = start(platform.inner(), path, area, done.clone()) {
                finish(&done, Err(e));
            }
        });
        if let Err(e) = sent {
            finish(&failed, Err(format!("Couldn't reach the webview: {e}")));
        }
    }

    fn frame_in_window(webview: &tauri::Webview) -> Option<Area> {
        let (tx, rx) = channel();
        let sent = webview.with_webview(move |platform| {
            // SAFETY: the main thread, during `with_webview`.
            let frame = unsafe { wk(platform.inner()) }.ok().and_then(|view| {
                if view.isHiddenOrHasHiddenAncestor() {
                    return None;
                }
                let content = view.window()?.contentView()?;
                let r = view.convertRect_toView(view.bounds(), Some(&content));
                let y = if content.isFlipped() {
                    r.origin.y
                } else {
                    content.bounds().size.height - r.origin.y - r.size.height
                };
                Some(Area {
                    x: r.origin.x,
                    y,
                    width: r.size.width,
                    height: r.size.height,
                })
            });
            let _ = tx.send(frame);
        });
        sent.ok()?;
        rx.recv_timeout(Duration::from_secs(5)).ok().flatten()
    }
}

/// Ask the WKWebView at `view` for a snapshot of `area` as it shows now.
fn start(view: *mut c_void, path: PathBuf, area: Option<Area>, done: Shared) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
    // SAFETY: called from `with_webview`, on the main thread.
    let webview = unsafe { wk(view) }?;
    // SAFETY: plain WebKit calls on the main thread.
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };
    unsafe {
        // What's on screen now, not after the next layout: a clip wants steady ticks.
        config.setAfterScreenUpdates(false);
        if let Some(a) = area {
            config.setRect(NSRect::new(
                NSPoint::new(a.x, a.y),
                NSSize::new(a.width, a.height),
            ));
        }
    }
    let handler = RcBlock::new(move |image: *mut NSImage, _error: *mut NSError| {
        // SAFETY: WebKit passes the snapshot, or null with an error, for the
        // duration of this call (on the main thread).
        let bitmap = unsafe { image.as_ref() }
            .and_then(|i| i.TIFFRepresentation())
            .map(|d| d.to_vec());
        let (path, done) = (path.clone(), done.clone());
        match bitmap {
            Some(bytes) => {
                std::thread::spawn(move || finish(&done, write_png(bytes, &path)));
            }
            None => finish(&done, Err("WebKit returned no snapshot.".into())),
        }
    });
    // SAFETY: the handler is copied by WebKit and called once, on the main thread.
    unsafe { webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler) };
    Ok(())
}

/// Encode a snapshot's TIFF bytes as PNG at `path`. Runs off the main thread:
/// `NSBitmapImageRep` is safe to use on the thread that made it.
fn write_png(tiff: Vec<u8>, path: &Path) -> Result<(), String> {
    autoreleasepool(|_| {
        let data = NSData::from_vec(tiff);
        let rep = NSBitmapImageRep::imageRepWithData(&data).ok_or("Unreadable snapshot.")?;
        // SAFETY: an empty properties dictionary is always valid.
        let png = unsafe {
            rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
        }
        .ok_or("Couldn't encode the snapshot.")?;
        std::fs::write(path, png.to_vec()).map_err(|e| format!("Couldn't save a frame: {e}"))
    })
}
