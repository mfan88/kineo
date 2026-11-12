use tauri::Manager;

mod clerk_http;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![clerk_http::clerk_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
