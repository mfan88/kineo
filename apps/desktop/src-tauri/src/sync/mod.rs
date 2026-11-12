//! The PowerSync connector (PowerSync's Tauri SDK only connects from Rust): Clerk
//! tokens come from the page, local changes go to PostgREST. See "Desktop local
//! database" in docs/tech-stack.md.

pub mod tokens;
pub mod upload;

use async_trait::async_trait;
use powersync::error::PowerSyncError;
use powersync::{BackendConnector, PowerSyncCredentials, PowerSyncDatabase, SyncOptions};
use std::collections::HashMap;
use std::sync::Arc;
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

/// Sets up the token bridge. Called once at startup.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
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
    Ok(())
}
