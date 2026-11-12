//! Sends the app's requests to Clerk from Rust instead of the webview.
//!
//! Clerk's token mode (its "Native API") refuses requests that carry both an
//! `Origin` and an `Authorization` header, and a webview always adds `Origin`.
//! Requests sent from here carry exactly the headers the page passes, minus
//! `Origin` and `Cookie`, and only ever go to Clerk.

use serde::{Deserialize, Serialize};

/// Hosts this command will talk to: Clerk's development Frontend API domains.
/// The production Clerk domain is added here when it exists.
const ALLOWED_HOST_SUFFIXES: &[&str] = &[".clerk.accounts.dev"];

/// Headers never forwarded, whatever the page passes.
const BLOCKED_HEADERS: &[&str] = &["origin", "cookie", "host", "content-length"];

#[derive(Debug, Deserialize)]
pub struct ClerkRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClerkResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

/// Checks the URL is HTTPS on an allowed Clerk host.
pub fn check_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Not a valid URL.".to_string())?;
    let host = url.host_str().unwrap_or_default();
    let allowed = ALLOWED_HOST_SUFFIXES
        .iter()
        .any(|suffix| host.ends_with(suffix) && host.len() > suffix.len());
    if url.scheme() != "https" || !allowed || url.port().is_some() || !url.username().is_empty() {
        return Err("Only Clerk's own API can be called.".to_string());
    }
    Ok(url)
}

/// The headers to send: everything the page passed except the blocked ones.
pub fn forwarded_headers(headers: &[(String, String)]) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(name, _)| !BLOCKED_HEADERS.contains(&name.to_ascii_lowercase().as_str()))
        .cloned()
        .collect()
}

pub async fn send(
    client: &reqwest::Client,
    request: ClerkRequest,
) -> Result<ClerkResponse, String> {
    let url = check_url(&request.url)?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "Not a valid HTTP method.".to_string())?;
    let mut builder = client.request(method, url);
    for (name, value) in forwarded_headers(&request.headers) {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    // No request details in errors: they can include tokens.
    let response = builder
        .send()
        .await
        .map_err(|_| "Couldn't reach Clerk.".to_string())?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_string())))
        .collect();
    let body = response
        .text()
        .await
        .map_err(|_| "Couldn't read Clerk's answer.".to_string())?;
    Ok(ClerkResponse {
        status,
        headers,
        body,
    })
}

#[tauri::command]
pub async fn clerk_request(
    client: tauri::State<'_, reqwest::Client>,
    request: ClerkRequest,
) -> Result<ClerkResponse, String> {
    send(&client, request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_clerk_development_hosts() {
        assert!(
            check_url("https://above-pup-6996.clerk.accounts.dev/v1/client?_is_native=1").is_ok()
        );
    }

    #[test]
    fn refuses_other_hosts_and_tricks() {
        for url in [
            "https://example.com/v1/client",
            "http://above-pup-6996.clerk.accounts.dev/v1/client",
            "https://clerk.accounts.dev/v1/client",
            "https://above-pup-6996.clerk.accounts.dev.evil.com/v1/client",
            "https://evilclerk.accounts.dev.example.com/",
            "https://above-pup-6996.clerk.accounts.dev:8443/v1/client",
            "https://user@above-pup-6996.clerk.accounts.dev/v1/client",
            "not a url",
        ] {
            assert!(check_url(url).is_err(), "{url} should be refused");
        }
    }

    #[test]
    fn never_forwards_origin_or_cookies() {
        let headers = vec![
            ("Origin".to_string(), "tauri://localhost".to_string()),
            ("cookie".to_string(), "a=b".to_string()),
            ("Authorization".to_string(), "token".to_string()),
            (
                "Content-Type".to_string(),
                "application/x-www-form-urlencoded".to_string(),
            ),
        ];
        let names: Vec<String> = forwarded_headers(&headers)
            .into_iter()
            .map(|(n, _)| n)
            .collect();
        assert_eq!(names, ["Authorization", "Content-Type"]);
    }

    #[test]
    fn refuses_before_sending() {
        let request = ClerkRequest {
            method: "GET".into(),
            url: "https://example.com/".into(),
            headers: vec![],
            body: None,
        };
        assert!(tauri::async_runtime::block_on(send(&reqwest::Client::new(), request)).is_err());
    }
}
