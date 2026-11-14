//! Brings Kineō's window to the front when a `kineo://` link arrives (the browser
//! hands "Continue with Google" back through one). The JS side finishes the sign-in;
//! this only handles focus. The link holds a one-time sign-in code, so it is never logged.

use tauri::{AppHandle, Manager, Runtime};

/// The window's label: Tauri's default for the single window in `tauri.conf.json`.
const MAIN_WINDOW: &str = "main";

/// Only Kineō's own links bring the window forward.
pub fn is_kineo_link(link: &str) -> bool {
    link.starts_with("kineo://")
}

/// True when any of the opened links is a Kineō link.
pub fn should_focus<S: AsRef<str>>(links: &[S]) -> bool {
    links.iter().any(|link| is_kineo_link(link.as_ref()))
}

#[cfg(target_os = "macos")]
fn activate_app() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::{MainThreadMarker, NSOperatingSystemVersion, NSProcessInfo};

    let Some(main_thread) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(main_thread);
    let cooperative =
        NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
            majorVersion: 14,
            minorVersion: 0,
            patchVersion: 0,
        });
    if cooperative {
        // macOS 14+: LaunchServices hands activation to the app it opens for a URL.
        app.activate();
    } else {
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);
    }
}

fn bring_window_forward<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        eprintln!("focus: main window not found");
        return;
    };
    if let Err(error) = window.unminimize() {
        eprintln!("focus: unminimize failed: {error}");
    }
    if let Err(error) = window.show() {
        eprintln!("focus: show failed: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("focus: set_focus failed: {error}");
    }
    #[cfg(target_os = "macos")]
    activate_app();
}

/// Shows and focuses the main window (and activates the app on macOS), on the main thread.
pub fn bring_to_front<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || bring_window_forward(&handle)) {
        eprintln!("focus: couldn't reach the main thread: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focuses_for_kineo_links_only() {
        assert!(is_kineo_link("kineo://sso-callback?rotating_token_nonce=x"));
        assert!(is_kineo_link("kineo://anything"));
        assert!(!is_kineo_link("https://getkineo.work/signed-in/"));
        assert!(!is_kineo_link("xkineo://sso-callback"));
        assert!(!is_kineo_link(""));
    }

    #[test]
    fn focuses_when_any_link_is_kineo() {
        assert!(should_focus(&[
            "https://example.com",
            "kineo://sso-callback"
        ]));
        assert!(!should_focus(&["https://example.com"]));
        assert!(!should_focus::<&str>(&[]));
    }
}
