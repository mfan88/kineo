use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

mod browser;
mod clerk_http;
mod focus;
mod logos;
mod pdf;
mod session_store;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // kineo:// links: "Continue with Google" comes back to the app through one.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_powersync::init())
        // One shared HTTP client for Clerk requests. It keeps no cookies.
        .manage(reqwest::Client::new())
        // The local database lives in the app's data folder, which Tauri doesn't create.
        .setup(|app| {
            std::fs::create_dir_all(app.path().app_data_dir()?)?;
            sync::init(app.handle());
            // A kineo:// link brings the window to the front; the page's own listener
            // does the sign-in. The link holds a one-time code, so it isn't logged.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let links: Vec<String> = event.urls().iter().map(|url| url.to_string()).collect();
                if focus::should_focus(&links) {
                    focus::bring_to_front(&handle);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clerk_http::clerk_request,
            session_store::session_token_load,
            session_store::session_token_save,
            session_store::session_token_clear,
            sync::sync_token_reply,
            sync::sync_connect,
            logos::logo_upload,
            logos::logo_read,
            logos::logo_delete,
            logos::logo_clear_cache,
            browser::open_in_browser,
            browser::open_sign_in_page,
            pdf::save_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
