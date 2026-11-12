//! Opens Kineō's web pages (Terms, Privacy) in the default browser and brings it
//! to the front. macOS 14+ uses cooperative activation: another app only comes to
//! the front if the active app hands over first. So on macOS this finds the default
//! browser, yields activation to it, then opens the page with "activates" on (the
//! opener plugin's `/usr/bin/open` runs as a separate process and can't hand over).

use tauri::{AppHandle, Runtime};

/// Only Kineō's own website; the page can't open anything else this way.
const ALLOWED_PREFIX: &str = "https://getkineo.work/";

pub fn check_url(url: &str) -> Result<(), String> {
    let path = url
        .strip_prefix(ALLOWED_PREFIX)
        .ok_or_else(|| "That isn't a Kineō page.".to_string())?;
    let safe = path
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b"-_/".contains(&b));
    if safe {
        Ok(())
    } else {
        Err("That isn't a Kineō page.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn open_in_front(url: &str) -> Result<(), String> {
    use objc2_app_kit::{NSApplication, NSWorkspace, NSWorkspaceOpenConfiguration};
    use objc2_foundation::{
        MainThreadMarker, NSBundle, NSOperatingSystemVersion, NSProcessInfo, NSString, NSURL,
    };

    let main_thread =
        MainThreadMarker::new().ok_or_else(|| "Not on the main thread.".to_string())?;
    let url = NSURL::URLWithString(&NSString::from_str(url))
        .ok_or_else(|| "That isn't a valid link.".to_string())?;
    let workspace = NSWorkspace::sharedWorkspace();

    // macOS 14+: hand activation to the browser that will open the page.
    let cooperative =
        NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
            majorVersion: 14,
            minorVersion: 0,
            patchVersion: 0,
        });
    if cooperative {
        let browser = workspace
            .URLForApplicationToOpenURL(&url)
            .and_then(|app| NSBundle::bundleWithURL(&app))
            .and_then(|bundle| bundle.bundleIdentifier());
        if let Some(bundle_id) = browser {
            NSApplication::sharedApplication(main_thread)
                .yieldActivationToApplicationWithBundleIdentifier(&bundle_id);
        }
    }

    let configuration = NSWorkspaceOpenConfiguration::new();
    configuration.setActivates(true);
    workspace.openURL_configuration_completionHandler(&url, &configuration, None);
    Ok(())
}

#[tauri::command]
pub fn open_in_browser<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    check_url(&url)?;
    open(&app, url)
}

#[cfg(target_os = "macos")]
fn open<R: Runtime>(app: &AppHandle<R>, url: String) -> Result<(), String> {
    // AppKit calls belong on the main thread.
    app.run_on_main_thread(move || {
        let _ = open_in_front(&url);
    })
    .map_err(|_| "Couldn't open the page.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn open<R: Runtime>(app: &AppHandle<R>, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Couldn't open the page.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_kineo_pages() {
        assert!(check_url("https://getkineo.work/terms/").is_ok());
        assert!(check_url("https://getkineo.work/privacy/").is_ok());
        for bad in [
            "http://getkineo.work/terms/",
            "https://getkineo.work.evil.com/terms/",
            "https://evil.com/https://getkineo.work/",
            "https://getkineo.work/terms/?next=https://evil.com",
            "https://getkineo.work/../etc",
            "file:///etc/passwd",
            "",
        ] {
            assert!(check_url(bad).is_err(), "{bad:?} should be refused");
        }
    }
}
