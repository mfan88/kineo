mod clerk_http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // One shared HTTP client for Clerk requests. It keeps no cookies.
        .manage(reqwest::Client::new())
        .invoke_handler(tauri::generate_handler![clerk_http::clerk_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
