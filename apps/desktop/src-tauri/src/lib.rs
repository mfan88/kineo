use tauri::Manager;

mod browser;
mod clerk_http;
mod logos;
mod session_store;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_powersync::init())
        // One shared HTTP client for Clerk requests. It keeps no cookies.
        .manage(reqwest::Client::new())
        // The local database lives in the app's data folder, which Tauri doesn't create.
        .setup(|app| {
            std::fs::create_dir_all(app.path().app_data_dir()?)?;
            sync::init(app.handle());
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
            browser::open_in_browser
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
