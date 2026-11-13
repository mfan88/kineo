//! Download PDF. On macOS this shows the Save panel and has the web view write the
//! page straight to a PDF there, skipping the print dialog. The page has already
//! put a print copy of the invoice in place (src/invoice/printInvoice.ts), so only
//! the invoice is in the file, on letter pages. Elsewhere the page prints instead.

use serde::Serialize;
use tauri::{Runtime, Webview};

/// What became of a Download PDF.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveOutcome {
    Saved,
    /// The Save panel was closed without saving.
    Cancelled,
    /// Not on macOS: the page opens the print dialog instead.
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Unsupported,
}

/// The file name the Save panel suggests, from a title like "Invoice INV-0004":
/// characters a Mac file name can't hold become dashes.
pub fn pdf_file_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if matches!(c, '/' | ':' | '\\') || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').trim();
    let base = if trimmed.is_empty() {
        "Invoice"
    } else {
        trimmed
    };
    format!("{base}.pdf")
}

#[tauri::command]
pub async fn save_pdf<R: Runtime>(
    webview: Webview<R>,
    title: String,
) -> Result<SaveOutcome, String> {
    #[cfg(target_os = "macos")]
    {
        macos::save(webview, pdf_file_name(&title)).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (webview, title);
        Ok(SaveOutcome::Unsupported)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::SaveOutcome;
    use objc2::rc::Retained;
    use objc2::runtime::NSObject;
    use objc2::{DefinedClass, MainThreadOnly, define_class, msg_send, sel};
    use objc2_app_kit::{
        NSModalResponseOK, NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob,
        NSSavePanel, NSWindow,
    };
    use objc2_foundation::{MainThreadMarker, NSArray, NSCopying, NSSize, NSString};
    use objc2_web_kit::WKWebView;
    use std::cell::RefCell;
    use std::ffi::c_void;
    use tauri::Runtime;
    use tokio::sync::oneshot;

    const FAILED: &str = "The PDF couldn't be saved.";

    /// Letter, in points: what invoices are laid out for (`@page { size: letter }`).
    const LETTER: NSSize = NSSize::new(612.0, 792.0);

    type Reply = oneshot::Sender<Result<SaveOutcome, String>>;

    define_class!(
        /// Hears when the print operation has written the file, and replies to the page.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "KineoPdfSaveDelegate"]
        #[ivars = RefCell<Option<Reply>>]
        struct SaveDelegate;

        impl SaveDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _operation: &NSPrintOperation, success: bool, _context: *mut c_void) {
                if let Some(reply) = self.ivars().borrow_mut().take() {
                    let _ = reply.send(if success {
                        Ok(SaveOutcome::Saved)
                    } else {
                        Err(FAILED.to_string())
                    });
                }
                // AppKit doesn't keep the delegate; it was kept here until now.
                PENDING.with(|pending| pending.borrow_mut().take());
            }
        }
    );

    impl SaveDelegate {
        fn new(main_thread: MainThreadMarker, reply: Reply) -> Retained<Self> {
            let this = Self::alloc(main_thread).set_ivars(RefCell::new(Some(reply)));
            // Safety: NSObject's init, on a freshly allocated instance.
            unsafe { msg_send![super(this), init] }
        }
    }

    thread_local! {
        /// The delegate of the save in progress (one at a time: the panel is modal).
        static PENDING: RefCell<Option<Retained<SaveDelegate>>> = const { RefCell::new(None) };
    }

    pub async fn save<R: Runtime>(
        webview: tauri::Webview<R>,
        file_name: String,
    ) -> Result<SaveOutcome, String> {
        let (reply, answer) = oneshot::channel();
        webview
            .with_webview(move |platform| {
                // Tauri runs this on the main thread, where AppKit must be used.
                let Some(main_thread) = MainThreadMarker::new() else {
                    let _ = reply.send(Err(FAILED.to_string()));
                    return;
                };
                // Safety: on macOS these are the page's WKWebView and its NSWindow,
                // both alive for as long as the webview is.
                let web_view: &WKWebView = unsafe { &*platform.inner().cast() };
                let window: &NSWindow = unsafe { &*platform.ns_window().cast() };
                start(main_thread, web_view, window, &file_name, reply);
            })
            .map_err(|_| FAILED.to_string())?;
        answer.await.map_err(|_| FAILED.to_string())?
    }

    fn start(
        main_thread: MainThreadMarker,
        web_view: &WKWebView,
        window: &NSWindow,
        file_name: &str,
        reply: Reply,
    ) {
        let panel = NSSavePanel::savePanel(main_thread);
        panel.setNameFieldStringValue(&NSString::from_str(file_name));
        panel.setCanCreateDirectories(true);
        // allowedContentTypes needs UTType, from a crate the app doesn't have; this
        // older setter does the same job.
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&NSArray::from_retained_slice(&[NSString::from_str(
            "pdf",
        )])));
        if panel.runModal() != NSModalResponseOK {
            let _ = reply.send(Ok(SaveOutcome::Cancelled));
            return;
        }
        let Some(url) = panel.URL() else {
            let _ = reply.send(Ok(SaveOutcome::Cancelled));
            return;
        };

        // A copy, so the print dialog's own settings stay as they were.
        let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
        info.setPaperSize(LETTER);
        // The invoice's own `@page` margins apply.
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        // Safety: AppKit's own constants; the saving URL's value is an NSURL.
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            info.dictionary().insert(NSPrintJobSavingURL, &*url);
        }

        // Safety: WebKit's print operation for this web view, with the settings above.
        let operation = unsafe { web_view.printOperationWithPrintInfo(&info) };
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        operation.setCanSpawnSeparateThread(true);

        let delegate = SaveDelegate::new(main_thread, reply);
        // WebKit only lays the page out for printing in a run that's modal for its
        // window (a plain `runOperation` gives blank pages); the delegate hears when
        // the file is written.
        unsafe {
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                std::ptr::null_mut(),
            );
        }
        PENDING.with(|pending| *pending.borrow_mut() = Some(delegate));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_file_after_the_invoice() {
        assert_eq!(pdf_file_name("Invoice INV-0004"), "Invoice INV-0004.pdf");
        assert_eq!(pdf_file_name("Invoice 0012"), "Invoice 0012.pdf");
    }

    #[test]
    fn keeps_the_name_safe_for_a_file() {
        // A prefix from Settings could hold anything.
        assert_eq!(pdf_file_name("Invoice A/B:0004"), "Invoice A-B-0004.pdf");
        assert_eq!(pdf_file_name("Invoice\nX"), "Invoice-X.pdf");
        assert_eq!(pdf_file_name("..hidden"), "hidden.pdf");
        assert_eq!(pdf_file_name("   "), "Invoice.pdf");
    }

    #[test]
    fn tells_the_page_what_happened() {
        assert_eq!(
            serde_json::to_string(&SaveOutcome::Cancelled).unwrap(),
            "\"cancelled\""
        );
        assert_eq!(
            serde_json::to_string(&SaveOutcome::Unsupported).unwrap(),
            "\"unsupported\""
        );
    }
}
