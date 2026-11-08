//! Save as PDF on macOS. WKWebView ignores `window.print()` (the host has to print it),
//! so the export runs the webview's own print operation, with the print stylesheet
//! applied, set to save to the file the user picked: no print panel, no progress
//! panel. It runs as a sheet on trace's window, whose delegate hears when the file
//! is written; until then the renderer keeps the document in its print layout.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, NSObject};
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob};
use objc2_foundation::{NSString, NSURL};
use objc2_web_kit::WKWebView;

use super::ports::PdfPrinter;
use super::Os;

/// Page margins, in points (0.6in, as on Windows).
const MARGIN: f64 = 43.2;

type Done = Sender<Result<(), String>>;

struct Ivars {
    done: Mutex<Option<Done>>,
}

define_class!(
    // The print operation's delegate: says how it went, once.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "TracePdfPrintDone"]
    #[ivars = Ivars]
    struct PrintDone;

    impl PrintDone {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _op: &NSPrintOperation, success: Bool, _context: *mut c_void) {
            let done = self.ivars().done.lock().ok().and_then(|mut d| d.take());
            if let Some(done) = done {
                let _ = done.send(if success.as_bool() {
                    Ok(())
                } else {
                    Err("The PDF wasn't saved.".to_string())
                });
            }
        }
    }
);

thread_local! {
    /// The latest export's delegate. A print operation doesn't retain its delegate,
    /// so it's kept here (on the main thread) until the next export replaces it.
    static DELEGATE: RefCell<Option<Retained<PrintDone>>> = const { RefCell::new(None) };
}

impl PdfPrinter for Os {
    fn prints_to_pdf() -> bool {
        true
    }

    fn print_to_pdf(webview: &tauri::Webview, path: &Path) -> Receiver<Result<(), String>> {
        let (tx, rx) = channel();
        let failed = tx.clone();
        let path = path.to_string_lossy().into_owned();
        // AppKit and the webview are the main thread's; `with_webview` runs there.
        let sent = webview.with_webview(move |platform| {
            if let Err(e) = start(platform.inner(), &path, tx) {
                let _ = failed.send(Err(format!("Couldn't print to PDF: {e}")));
            }
        });
        if let Err(e) = sent {
            let (tx, rx) = channel();
            let _ = tx.send(Err(format!("Couldn't reach the webview: {e}")));
            return rx;
        }
        rx
    }
}

/// Start the print operation of the WKWebView at `view`, saving to `path`.
fn start(view: *mut c_void, path: &str, done: Done) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
    if view.is_null() {
        return Err("no webview".into());
    }
    // SAFETY: on macOS `PlatformWebview::inner` is the page's WKWebView, alive for
    // this call, which runs on the main thread.
    let webview: &WKWebView = unsafe { &*view.cast::<WKWebView>() };
    let window = webview.window().ok_or("the page has no window")?;

    // SAFETY: plain AppKit calls on the main thread; the statics are AppKit's
    // constant keys.
    unsafe {
        let shared = NSPrintInfo::sharedPrintInfo();
        let info: Retained<NSPrintInfo> = msg_send![&*shared, copy];
        info.setTopMargin(MARGIN);
        info.setBottomMargin(MARGIN);
        info.setLeftMargin(MARGIN);
        info.setRightMargin(MARGIN);
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let dict = info.dictionary();
        let _: () = msg_send![&*dict, setObject: &*url, forKey: NSPrintJobSavingURL];

        let op = webview.printOperationWithPrintInfo(&info);
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);
        // A WKWebView's print view starts at zero size, which prints blank pages.
        if let Some(print_view) = op.view() {
            print_view.setFrame(webview.bounds());
        }

        let delegate = PrintDone::alloc(mtm).set_ivars(Ivars {
            done: Mutex::new(Some(done)),
        });
        let delegate: Retained<PrintDone> = msg_send![super(delegate), init];
        let target: &AnyObject = &delegate;
        op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &window,
            Some(target),
            Some(sel!(printOperationDidRun:success:contextInfo:)),
            std::ptr::null_mut(),
        );
        DELEGATE.with(|d| *d.borrow_mut() = Some(delegate));
    }
    Ok(())
}
