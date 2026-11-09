//! Frame capture for the recorder: snapshots of trace's own webview at a steady
//! rate, written as numbered PNGs. The driver turns the returned list into the
//! `frames.json` that `site/scripts/lib/encode.mjs` reads.
//!
//! A snapshot is asked for on a timer thread; the webview renders it on the main
//! thread and the PNG is encoded on its own thread. When the webview falls behind,
//! ticks are skipped rather than queued, so timestamps stay true to the screen.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::platform::{
    ports::{Area, PageSnapshot},
    Os,
};

/// Snapshots allowed in flight at once (asked for, not yet written).
const MAX_IN_FLIGHT: usize = 4;

/// One written frame: its file name in the capture dir, and when it was taken
/// (seconds since the Unix epoch, as the encoder expects).
#[derive(Clone, Serialize)]
pub struct Frame {
    pub name: String,
    pub t: f64,
}

/// A frame asked for; `ok` is set once it's written (or failed).
struct Pending {
    frame: Frame,
    ok: Option<bool>,
}

struct Running {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
    frames: Arc<Mutex<Vec<Pending>>>,
    in_flight: Arc<AtomicUsize>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or_default()
}

/// Start capturing `area` of `webview` (all of it when `None`) into `dir` at `fps`.
/// Replaces a capture already running.
pub fn start(webview: tauri::Webview, dir: PathBuf, fps: u32, area: Option<Area>) {
    let _ = stop();
    let stop_flag = Arc::new(AtomicBool::new(false));
    let frames = Arc::new(Mutex::new(Vec::<Pending>::new()));
    let in_flight = Arc::new(AtomicUsize::new(0));
    let period = Duration::from_secs_f64(1.0 / f64::from(fps.clamp(1, 60)));
    let thread = {
        let (stop_flag, frames, in_flight) = (stop_flag.clone(), frames.clone(), in_flight.clone());
        std::thread::spawn(move || {
            let mut next = Instant::now();
            let mut n = 0usize;
            while !stop_flag.load(Ordering::SeqCst) {
                if in_flight.load(Ordering::SeqCst) < MAX_IN_FLIGHT {
                    shoot(&webview, &dir, n, area, &frames, &in_flight);
                    n += 1;
                }
                next += period;
                let now = Instant::now();
                if next > now {
                    std::thread::sleep(next - now);
                } else {
                    next = now;
                }
            }
        })
    };
    if let Ok(mut running) = RUNNING.lock() {
        *running = Some(Running {
            stop: stop_flag,
            thread,
            frames,
            in_flight,
        });
    }
}

/// Ask for frame `n`; its entry is marked when the PNG is written.
fn shoot(
    webview: &tauri::Webview,
    dir: &Path,
    n: usize,
    area: Option<Area>,
    frames: &Arc<Mutex<Vec<Pending>>>,
    in_flight: &Arc<AtomicUsize>,
) {
    let name = format!("f{n:05}.png");
    let path = dir.join(&name);
    let frame = Frame {
        name: name.clone(),
        t: now(),
    };
    if let Ok(mut list) = frames.lock() {
        list.push(Pending { frame, ok: None });
    }
    in_flight.fetch_add(1, Ordering::SeqCst);
    let (frames, in_flight) = (frames.clone(), in_flight.clone());
    let done = Box::new(move |result: Result<(), String>| {
        if let Ok(mut list) = frames.lock() {
            if let Some(p) = list.iter_mut().find(|p| p.frame.name == name) {
                p.ok = Some(result.is_ok());
            }
        }
        in_flight.fetch_sub(1, Ordering::SeqCst);
    });
    Os::snapshot_png(webview, path, area, done);
}

/// Stop the capture, wait for the frames still being written, and return the
/// written ones in order. Errors when no capture is running.
pub fn stop() -> Result<Vec<Frame>, String> {
    let running = RUNNING
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("No capture is running.")?;
    running.stop.store(true, Ordering::SeqCst);
    let _ = running.thread.join();
    let deadline = Instant::now() + Duration::from_secs(10);
    while running.in_flight.load(Ordering::SeqCst) > 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    let list = running.frames.lock().map_err(|e| e.to_string())?;
    Ok(list
        .iter()
        .filter(|p| p.ok == Some(true))
        .map(|p| p.frame.clone())
        .collect())
}

/// One snapshot of `area` of `webview` (all of it when `None`) to `path`, waiting
/// for it to be written.
pub fn snapshot(webview: &tauri::Webview, path: PathBuf, area: Option<Area>) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    Os::snapshot_png(
        webview,
        path,
        area,
        Box::new(move |r| {
            let _ = tx.send(r);
        }),
    );
    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "The snapshot timed out.".to_string())?
}
