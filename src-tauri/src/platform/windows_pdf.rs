//! WebView2 writes the page to a PDF itself (`ICoreWebView2_7::PrintToPdf`), with
//! the print stylesheet applied, so the Plan tab's export needs no print dialog.

use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

use super::ports::PdfPrinter;
use super::Os;

/// Page margins, in inches.
const MARGIN: f64 = 0.6;

impl PdfPrinter for Os {
    fn prints_to_pdf() -> bool {
        true
    }

    fn print_to_pdf(webview: &tauri::Webview, path: &Path) -> Receiver<Result<(), String>> {
        let (tx, rx) = channel();
        let path = HSTRING::from(path.as_os_str());
        let failed = tx.clone();
        // WebView2 is called on the thread that owns it; `with_webview` runs there.
        let sent = webview.with_webview(move |platform| {
            if let Err(e) = start(&platform, &path, tx) {
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

fn start(
    platform: &tauri::webview::PlatformWebview,
    path: &HSTRING,
    tx: Sender<Result<(), String>>,
) -> windows::core::Result<()> {
    // SAFETY: COM calls on live interfaces the webview owns, on its own thread.
    unsafe {
        let core = platform.controller().CoreWebView2()?;
        let core7: ICoreWebView2_7 = core.cast()?;
        let env6: ICoreWebView2Environment6 = platform.environment().cast()?;
        let settings = env6.CreatePrintSettings()?;
        settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
        settings.SetShouldPrintBackgrounds(true)?;
        settings.SetShouldPrintHeaderAndFooter(false)?;
        settings.SetMarginTop(MARGIN)?;
        settings.SetMarginBottom(MARGIN)?;
        settings.SetMarginLeft(MARGIN)?;
        settings.SetMarginRight(MARGIN)?;
        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
            let outcome = match result {
                Err(e) => Err(format!("Couldn't print to PDF: {e}")),
                Ok(()) if !ok => Err("The PDF couldn't be written.".to_string()),
                Ok(()) => Ok(()),
            };
            let _ = tx.send(outcome);
            Ok(())
        }));
        core7.PrintToPdf(path, &settings, &handler)?;
    }
    Ok(())
}
