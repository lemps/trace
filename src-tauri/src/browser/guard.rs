//! Only trace's own webview may call trace. Tauri lets any webview in a window run
//! the app's commands when its page counts as local, and a Browser page could be
//! pointed at a local-looking address, so every command is checked here first: one
//! from any webview but `main` is refused before it reaches a handler. (Plugin
//! commands are kept from Browser pages by the capability, which names `main` as a
//! webview rather than a window.)

use tauri::ipc::Invoke;
use tauri::Runtime;

/// trace's own webview: its window's label and its webview's.
pub const APP_WEBVIEW: &str = "main";

/// Whether a webview with this label may call trace.
pub fn may_invoke(label: &str) -> bool {
    label == APP_WEBVIEW
}

/// `handler`, refusing every call that doesn't come from trace's own webview.
pub fn app_only<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke: Invoke<R>| {
        if !may_invoke(invoke.message.webview_ref().label()) {
            invoke.resolver.reject("Not allowed from this page.");
            return true;
        }
        handler(invoke)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_main_webview_may_invoke() {
        assert!(may_invoke("main"));
        assert!(!may_invoke("browser-abc-123"));
        assert!(!may_invoke("Main"));
        assert!(!may_invoke(""));
    }

    #[test]
    fn browser_labels_never_look_like_the_app() {
        let label = crate::browser::webview::label_for("main", "main");
        assert!(!may_invoke(&label));
        assert!(label.starts_with(crate::browser::webview::LABEL_PREFIX));
    }
}
