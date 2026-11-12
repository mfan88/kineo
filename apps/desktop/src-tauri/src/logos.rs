//! Invoice logos in Supabase Storage's private `logos` bucket, sent from Rust (the
//! webview can't call Storage directly), with a copy of each logo kept in the app's
//! data folder so invoices show it offline. Storage's row-level security keeps each
//! practitioner to their own folder (supabase/migrations/…_logo_storage.sql).

use crate::sync::tokens::{TokenBroker, TokenKind, TokenSource};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Runtime, State};

/// Fixed here, not passed by the page, so tokens only ever go to Kineō's server.
pub const STORAGE_URL: &str = "https://api.getkineo.work/storage/v1";
const BUCKET: &str = "logos";
/// The same limit as the bucket and @kineo/shared's MAX_LOGO_BYTES.
pub const MAX_LOGO_BYTES: usize = 1024 * 1024;

/// A logo's content type, from its file extension.
fn content_type(path: &str) -> Option<&'static str> {
    match path.rsplit_once('.')?.1 {
        "png" => Some("image/png"),
        "jpg" => Some("image/jpeg"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// Logo paths look like `user_abc123/logo-<uuid>.png`: the owner's Clerk ID as the
/// folder, then a new file name per upload. Anything else is refused before any
/// request or file access.
pub fn check_path(path: &str) -> Result<&'static str, String> {
    let refused = || "That isn't a logo path.".to_string();
    let (folder, file) = path.split_once('/').ok_or_else(refused)?;
    let owner_ok = folder.len() > 5
        && folder.starts_with("user_")
        && folder.bytes().skip(5).all(|b| b.is_ascii_alphanumeric());
    let (stem, _) = file.rsplit_once('.').ok_or_else(refused)?;
    let uuid = stem.strip_prefix("logo-").unwrap_or_default();
    let uuid_ok = uuid.len() == 36
        && uuid.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit() && !c.is_ascii_uppercase(),
        });
    if !owner_ok || !uuid_ok {
        return Err(refused());
    }
    content_type(path).ok_or_else(refused)
}

/// Where the local copy of a logo lives, inside `cache_dir`.
fn cached_file(cache_dir: &Path, path: &str) -> PathBuf {
    // check_path guarantees exactly one '/', no '..', and safe characters.
    let (folder, file) = path.split_once('/').unwrap_or(("", path));
    cache_dir.join(folder).join(file)
}

fn save_copy(cache_dir: &Path, path: &str, bytes: &[u8]) {
    let file = cached_file(cache_dir, path);
    if let Some(parent) = file.parent() {
        // A failed copy only means the logo is fetched again next time.
        let _ = std::fs::create_dir_all(parent).and_then(|()| std::fs::write(&file, bytes));
    }
}

fn status_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 => "Your session has expired. Sign in again, then try again.".to_string(),
        403 => "Kineō couldn't save the logo to your account.".to_string(),
        413 => "Choose an image of 1 MB or less.".to_string(),
        415 | 422 => "Choose a PNG, JPEG or SVG image.".to_string(),
        code => format!("The server couldn't take the logo ({code}). Try again."),
    }
}

/// Uploads a new logo and keeps a local copy.
pub async fn upload(
    client: &reqwest::Client,
    storage_url: &str,
    token: &str,
    cache_dir: &Path,
    path: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let content_type = check_path(path)?;
    if bytes.is_empty() {
        return Err("That file is empty. Choose another image.".to_string());
    }
    if bytes.len() > MAX_LOGO_BYTES {
        return Err("Choose an image of 1 MB or less.".to_string());
    }
    let response = client
        .post(format!("{storage_url}/object/{BUCKET}/{path}"))
        .bearer_auth(token)
        .header("Content-Type", content_type)
        .body(bytes.clone())
        .send()
        .await
        .map_err(|_| {
            "Couldn't reach the server. Check your internet connection and try again.".to_string()
        })?;
    if !response.status().is_success() {
        return Err(status_error(response.status()));
    }
    save_copy(cache_dir, path, &bytes);
    Ok(())
}

/// The logo's bytes: the local copy if there is one, otherwise downloaded (and kept).
pub async fn read(
    client: &reqwest::Client,
    storage_url: &str,
    token: impl std::future::Future<Output = Result<String, String>>,
    cache_dir: &Path,
    path: &str,
) -> Result<Vec<u8>, String> {
    check_path(path)?;
    if let Ok(bytes) = std::fs::read(cached_file(cache_dir, path)) {
        return Ok(bytes);
    }
    let response = client
        .get(format!(
            "{storage_url}/object/authenticated/{BUCKET}/{path}"
        ))
        .bearer_auth(token.await?)
        .send()
        .await
        .map_err(|_| "Couldn't load the logo. Check your internet connection.".to_string())?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            400 | 404 => {
                "The logo couldn't be found. Choose it again in Invoice style.".to_string()
            }
            _ => "Couldn't load the logo. Try again.".to_string(),
        });
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Couldn't load the logo. Try again.".to_string())?
        .to_vec();
    save_copy(cache_dir, path, &bytes);
    Ok(bytes)
}

/// Deletes a logo that's no longer used, and its local copy. Already gone counts as done.
pub async fn delete(
    client: &reqwest::Client,
    storage_url: &str,
    token: &str,
    cache_dir: &Path,
    path: &str,
) -> Result<(), String> {
    check_path(path)?;
    let _ = std::fs::remove_file(cached_file(cache_dir, path));
    let response = client
        .delete(format!("{storage_url}/object/{BUCKET}/{path}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Couldn't reach the server.".to_string())?;
    let status = response.status();
    if status.is_success() || status.as_u16() == 404 || status.as_u16() == 400 {
        Ok(())
    } else {
        Err(status_error(status))
    }
}

fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("logos"))
        .map_err(|_| "Couldn't find the app's data folder.".to_string())
}

/// Upload: the page sends the image's bytes as the body and its path in the
/// `kineo-logo-path` header.
#[tauri::command]
pub async fn logo_upload<R: Runtime>(
    app: AppHandle<R>,
    broker: State<'_, Arc<TokenBroker>>,
    client: State<'_, reqwest::Client>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Send the image's bytes.".to_string());
    };
    let path = request
        .headers()
        .get("kineo-logo-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "That isn't a logo path.".to_string())?
        .to_string();
    let bytes = bytes.clone();
    let token = broker.token(TokenKind::Session).await?;
    upload(
        &client,
        STORAGE_URL,
        &token,
        &cache_dir(&app)?,
        &path,
        bytes,
    )
    .await
}

/// The logo's bytes, for showing on invoices.
#[tauri::command]
pub async fn logo_read<R: Runtime>(
    app: AppHandle<R>,
    broker: State<'_, Arc<TokenBroker>>,
    client: State<'_, reqwest::Client>,
    path: String,
) -> Result<Response, String> {
    let token = broker.token(TokenKind::Session);
    let bytes = read(&client, STORAGE_URL, token, &cache_dir(&app)?, &path).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn logo_delete<R: Runtime>(
    app: AppHandle<R>,
    broker: State<'_, Arc<TokenBroker>>,
    client: State<'_, reqwest::Client>,
    path: String,
) -> Result<(), String> {
    check_path(&path)?;
    let token = broker.token(TokenKind::Session).await?;
    delete(&client, STORAGE_URL, &token, &cache_dir(&app)?, &path).await
}

/// Removes every cached logo (on Sign out, with the rest of the local data).
#[tauri::command]
pub fn logo_clear_cache<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    match std::fs::remove_dir_all(cache_dir(&app)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Couldn't remove saved logos.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_bytes, header, method, path as url_path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const PATH: &str = "user_abc123/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png";

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kineo-logos-test-{}", uuid_like()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn uuid_like() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("{nanos}-{:?}", std::thread::current().id())
            .replace(|c: char| !c.is_ascii_alphanumeric(), "")
    }

    #[test]
    fn accepts_only_logo_paths() {
        assert_eq!(check_path(PATH), Ok("image/png"));
        assert_eq!(
            check_path("user_x/logo-0f8fad5b-d9cb-469f-a165-70867728950e.jpg"),
            Ok("image/jpeg")
        );
        assert_eq!(
            check_path("user_x/logo-0f8fad5b-d9cb-469f-a165-70867728950e.svg"),
            Ok("image/svg+xml")
        );
        for bad in [
            "",
            "logo.png",
            "user_abc/logo.png",
            "user_/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
            "user_abc/../logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
            "user_abc/sub/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
            "../user_abc/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
            "user_abc/logo-0F8FAD5B-D9CB-469F-A165-70867728950E.png",
            "user_abc/logo-0f8fad5b-d9cb-469f-a165-70867728950e.gif",
            "user_abc/logo-0f8fad5b-d9cb-469f-a165-70867728950e",
            "other_abc/logo-0f8fad5b-d9cb-469f-a165-70867728950e.png",
        ] {
            assert!(check_path(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[tokio::test]
    async fn uploads_the_bytes_and_keeps_a_copy() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(url_path(format!("/storage/v1/object/logos/{PATH}")))
            .and(header("authorization", "Bearer session-jwt"))
            .and(header("content-type", "image/png"))
            .and(body_bytes(vec![1, 2, 3]))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;
        let cache = temp_dir();
        let base = format!("{}/storage/v1", server.uri());
        upload(
            &reqwest::Client::new(),
            &base,
            "session-jwt",
            &cache,
            PATH,
            vec![1, 2, 3],
        )
        .await
        .unwrap();
        assert_eq!(
            std::fs::read(cached_file(&cache, PATH)).unwrap(),
            vec![1, 2, 3]
        );
    }

    #[tokio::test]
    async fn refuses_empty_or_large_files_without_sending() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;
        let (cache, base, client) = (
            temp_dir(),
            format!("{}/storage/v1", server.uri()),
            reqwest::Client::new(),
        );
        assert!(
            upload(&client, &base, "t", &cache, PATH, vec![])
                .await
                .is_err()
        );
        assert_eq!(
            upload(
                &client,
                &base,
                "t",
                &cache,
                PATH,
                vec![0; MAX_LOGO_BYTES + 1]
            )
            .await,
            Err("Choose an image of 1 MB or less.".to_string())
        );
        assert!(
            upload(&client, &base, "t", &cache, "user_a/evil.png", vec![1])
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn explains_a_refused_upload_and_keeps_no_copy() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;
        let cache = temp_dir();
        let result = upload(
            &reqwest::Client::new(),
            &format!("{}/storage/v1", server.uri()),
            "t",
            &cache,
            PATH,
            vec![1],
        )
        .await;
        assert_eq!(
            result,
            Err("Kineō couldn't save the logo to your account.".to_string())
        );
        assert!(!cached_file(&cache, PATH).exists());
    }

    #[tokio::test]
    async fn reads_from_the_server_once_then_from_the_copy() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(url_path(format!(
                "/storage/v1/object/authenticated/logos/{PATH}"
            )))
            .and(header("authorization", "Bearer session-jwt"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![9, 8, 7]))
            .expect(1)
            .mount(&server)
            .await;
        let (cache, base, client) = (
            temp_dir(),
            format!("{}/storage/v1", server.uri()),
            reqwest::Client::new(),
        );
        let first = read(
            &client,
            &base,
            async { Ok("session-jwt".to_string()) },
            &cache,
            PATH,
        )
        .await;
        assert_eq!(first, Ok(vec![9, 8, 7]));
        // Offline from here: no token needed, no request made.
        let second = read(
            &client,
            &base,
            async { Err("offline".to_string()) },
            &cache,
            PATH,
        )
        .await;
        assert_eq!(second, Ok(vec![9, 8, 7]));
    }

    #[tokio::test]
    async fn says_when_a_logo_is_missing() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;
        let result = read(
            &reqwest::Client::new(),
            &format!("{}/storage/v1", server.uri()),
            async { Ok("t".to_string()) },
            &temp_dir(),
            PATH,
        )
        .await;
        assert_eq!(
            result,
            Err("The logo couldn't be found. Choose it again in Invoice style.".to_string())
        );
    }

    #[tokio::test]
    async fn deletes_the_file_and_its_copy_and_treats_gone_as_done() {
        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(url_path(format!("/storage/v1/object/logos/{PATH}")))
            .respond_with(ResponseTemplate::new(404))
            .expect(1)
            .mount(&server)
            .await;
        let cache = temp_dir();
        save_copy(&cache, PATH, &[1]);
        delete(
            &reqwest::Client::new(),
            &format!("{}/storage/v1", server.uri()),
            "t",
            &cache,
            PATH,
        )
        .await
        .unwrap();
        assert!(!cached_file(&cache, PATH).exists());
    }
}
