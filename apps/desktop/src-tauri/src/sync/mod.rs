//! The PowerSync connector (PowerSync's Tauri SDK only connects from Rust): Clerk
//! tokens come from the page, local changes go to PostgREST. See "Desktop local
//! database" in docs/tech-stack.md.

pub mod tokens;
pub mod upload;

use async_trait::async_trait;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase, SyncOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_powersync::PowerSyncExt;
use tokens::{TokenBroker, TokenKind, TokenSource};
use upload::{Rejection, Retry, TABLES, Uploader};

/// Fixed here, not passed by the page, so tokens only ever go to Kineō's servers.
pub const SYNC_URL: &str = "https://sync.getkineo.work";
pub const API_URL: &str = "https://api.getkineo.work/rest/v1";

/// How long to wait for the page to answer a token request.
const TOKEN_TIMEOUT: Duration = Duration::from_secs(30);

/// Tells the page a change was refused (it shows an error; PowerSync then restores
/// the server's copy).
pub trait RejectionSink: Send + Sync {
    fn rejected(&self, rejection: Rejection);
}

pub struct Connector<T: TokenSource, S: RejectionSink> {
    db: PowerSyncDatabase,
    tokens: Arc<T>,
    sink: S,
    uploader: Uploader,
    sync_url: String,
}

#[async_trait]
impl<T: TokenSource + 'static, S: RejectionSink + 'static> BackendConnector for Connector<T, S> {
    async fn fetch_credentials(&self) -> Result<PowerSyncCredentials, PowerSyncError> {
        let token = self
            .tokens
            .token(TokenKind::Powersync)
            .await
            .map_err(|e| PowerSyncError::upload_error(Retry(e)))?;
        Ok(PowerSyncCredentials {
            endpoint: self.sync_url.clone(),
            token,
        })
    }

    async fn upload_data(&self) -> Result<(), PowerSyncError> {
        while let Some(transaction) = self.db.next_crud_transaction().await? {
            let token = self
                .tokens
                .token(TokenKind::Session)
                .await
                .map_err(|e| PowerSyncError::upload_error(Retry(e)))?;
            // Retry leaves the transaction queued; PowerSync calls upload_data again later.
            let outcome = self
                .uploader
                .upload(&token, &transaction.crud)
                .await
                .map_err(PowerSyncError::upload_error)?;
            if let Some(rejection) = outcome {
                // Retrying can't succeed (e.g. a sent invoice is locked), so drop the
                // change instead of blocking every later one.
                self.sink.rejected(rejection);
            }
            transaction.complete().await?;
        }
        Ok(())
    }
}

struct EventSink<R: Runtime>(AppHandle<R>);

impl<R: Runtime> RejectionSink for EventSink<R> {
    fn rejected(&self, rejection: Rejection) {
        let _ = self.0.emit("kineo://upload-rejected", rejection);
    }
}

/// How often the sync status is read. A status only changes when the connection
/// changes or a sync finishes, so once a second is plenty for a status screen.
const STATUS_INTERVAL: Duration = Duration::from_secs(1);

/// What the page needs to know about syncing: whether the first full sync has ever
/// finished on this device (it stays true across restarts), and whether the server
/// is reachable right now. Sent as `kineo://sync-status`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusReport {
    pub has_synced: bool,
    pub connected: bool,
}

/// Calls `emit` with the status when it is first read and each time it changes,
/// checking every `interval`. Never returns; abort the task to stop it.
async fn report_status_changes(
    read: impl Fn() -> SyncStatusReport,
    emit: impl Fn(SyncStatusReport),
    interval: Duration,
) {
    let mut last: Option<SyncStatusReport> = None;
    loop {
        let now = read();
        if last != Some(now) {
            last = Some(now);
            emit(now);
        }
        tokio::time::sleep(interval).await;
    }
}

/// The task that reports sync status to the page, so a new connection (signing in
/// again) replaces the old one's.
#[derive(Default)]
pub struct StatusWatcher(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

impl StatusWatcher {
    fn replace(&self, task: tauri::async_runtime::JoinHandle<()>) {
        if let Some(old) = self.0.lock().unwrap().replace(task) {
            old.abort();
        }
    }
}

/// Sets up the token bridge. Called once at startup.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    app.manage(StatusWatcher::default());
    let handle = app.clone();
    let broker = TokenBroker::new(TOKEN_TIMEOUT, move |request| {
        handle
            .emit("kineo://token-request", request)
            .map_err(|_| "Couldn't ask the app for a token.".to_string())
    });
    app.manage(Arc::new(broker));
}

/// The page's answer to a `kineo://token-request`.
#[tauri::command]
pub fn sync_token_reply(
    broker: State<'_, Arc<TokenBroker>>,
    id: u64,
    token: Option<String>,
    error: Option<String>,
) {
    broker.reply(
        id,
        token.ok_or_else(|| error.unwrap_or_else(|| "No token.".to_string())),
    );
}

/// Connects the page's database (by its PowerSync handle) to the server.
/// `boolean_columns` comes from `@kineo/data`'s BOOLEAN_COLUMNS.
#[tauri::command]
pub async fn sync_connect<R: Runtime>(
    app: AppHandle<R>,
    broker: State<'_, Arc<TokenBroker>>,
    client: State<'_, reqwest::Client>,
    handle: usize,
    boolean_columns: HashMap<String, Vec<String>>,
) -> Result<(), String> {
    if boolean_columns
        .keys()
        .any(|table| !TABLES.contains(&table.as_str()))
    {
        return Err("Unknown table in the boolean column list.".to_string());
    }
    let db = app
        .powersync()
        .database_from_javascript_handle(handle)
        .map_err(|_| "Couldn't find the local database.".to_string())?;
    let connector = Connector {
        db: db.clone(),
        tokens: broker.inner().clone(),
        sink: EventSink(app.clone()),
        uploader: Uploader::new(client.inner().clone(), API_URL, boolean_columns),
        sync_url: SYNC_URL.to_string(),
    };
    db.connect(SyncOptions::new(connector)).await;

    let reader = db.clone();
    let events = app.clone();
    app.state::<StatusWatcher>()
        .replace(tauri::async_runtime::spawn(report_status_changes(
            move || {
                let status = reader.status();
                SyncStatusReport {
                    has_synced: status.has_synced(),
                    connected: status.is_connected(),
                }
            },
            move |report| {
                let _ = events.emit("kineo://sync-status", report);
            },
            STATUS_INTERVAL,
        )));
    Ok(())
}

#[cfg(test)]
mod status_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn report(has_synced: bool, connected: bool) -> SyncStatusReport {
        SyncStatusReport {
            has_synced,
            connected,
        }
    }

    #[tokio::test]
    async fn reports_the_first_status_and_each_change_only_once() {
        let steps = [
            report(false, false),
            report(false, false),
            report(false, true),
            report(false, true),
            report(true, true),
        ];
        let reads = Arc::new(AtomicUsize::new(0));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let read_count = reads.clone();
        let sink = seen.clone();
        let task = tokio::spawn(report_status_changes(
            move || {
                steps[read_count
                    .fetch_add(1, Ordering::SeqCst)
                    .min(steps.len() - 1)]
            },
            move |r| sink.lock().unwrap().push(r),
            Duration::from_millis(5),
        ));
        tokio::time::sleep(Duration::from_millis(100)).await;
        task.abort();
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                report(false, false),
                report(false, true),
                report(true, true)
            ]
        );
    }

    #[test]
    fn serializes_for_the_page() {
        assert_eq!(
            serde_json::to_string(&report(true, false)).unwrap(),
            r#"{"hasSynced":true,"connected":false}"#
        );
    }
}
