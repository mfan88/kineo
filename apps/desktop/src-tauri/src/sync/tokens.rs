//! Clerk tokens for sync, fetched by the page. Clerk lives in the page, but the
//! PowerSync connector runs in Rust, so when Rust needs a token it emits a
//! `kineo://token-request` event and the page answers with `sync_token_reply`.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::oneshot;

/// Which Clerk token: `powersync` (the JWT template PowerSync checks) or `session`
/// (the session token PostgREST and Storage check).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenKind {
    Powersync,
    Session,
}

#[async_trait]
pub trait TokenSource: Send + Sync {
    async fn token(&self, kind: TokenKind) -> Result<String, String>;
}

#[derive(Clone, Debug, Serialize)]
pub struct TokenRequest {
    pub id: u64,
    pub kind: TokenKind,
}

type Emit = Box<dyn Fn(TokenRequest) -> Result<(), String> + Send + Sync>;

pub struct TokenBroker {
    emit: Emit,
    timeout: Duration,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<String, String>>>>,
}

impl TokenBroker {
    pub fn new(
        timeout: Duration,
        emit: impl Fn(TokenRequest) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            emit: Box::new(emit),
            timeout,
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// The page's answer to request `id`. Answers to unknown or expired requests are ignored.
    pub fn reply(&self, id: u64, answer: Result<String, String>) {
        let waiting = self.pending.lock().unwrap().remove(&id);
        if let Some(sender) = waiting {
            let _ = sender.send(answer);
        }
    }
}

#[async_trait]
impl TokenSource for TokenBroker {
    async fn token(&self, kind: TokenKind) -> Result<String, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, sender);

        if let Err(error) = (self.emit)(TokenRequest { id, kind }) {
            self.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        let answer = tokio::time::timeout(self.timeout, receiver).await;
        self.pending.lock().unwrap().remove(&id);
        match answer {
            Ok(Ok(Ok(token))) if !token.is_empty() => Ok(token),
            Ok(Ok(Ok(_))) => Err("Not signed in.".to_string()),
            Ok(Ok(Err(error))) => Err(error),
            Ok(Err(_)) | Err(_) => {
                Err("The app didn't provide a sign-in token in time.".to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn broker(timeout_ms: u64) -> (Arc<TokenBroker>, Arc<Mutex<Vec<TokenRequest>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        let broker = TokenBroker::new(Duration::from_millis(timeout_ms), move |request| {
            log.lock().unwrap().push(request);
            Ok(())
        });
        (Arc::new(broker), seen)
    }

    /// Answers the first request the page was sent.
    async fn answer(
        broker: Arc<TokenBroker>,
        seen: Arc<Mutex<Vec<TokenRequest>>>,
        reply: Result<String, String>,
    ) {
        loop {
            let request = seen.lock().unwrap().first().cloned();
            if let Some(request) = request {
                broker.reply(request.id, reply);
                return;
            }
            tokio::task::yield_now().await;
        }
    }

    #[tokio::test]
    async fn asks_the_page_and_returns_its_token() {
        let (broker, seen) = broker(1000);
        let pending = broker.token(TokenKind::Powersync);
        let (token, ()) = tokio::join!(
            pending,
            answer(broker.clone(), seen.clone(), Ok("jwt".into()))
        );
        assert_eq!(token, Ok("jwt".to_string()));
        assert_eq!(seen.lock().unwrap()[0].kind, TokenKind::Powersync);
        assert!(broker.pending.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn passes_on_the_page_s_error_and_treats_no_token_as_signed_out() {
        let (broker, seen) = broker(1000);
        let (result, ()) = tokio::join!(
            broker.token(TokenKind::Session),
            answer(broker.clone(), seen.clone(), Err("Clerk failed".into()))
        );
        assert_eq!(result, Err("Clerk failed".to_string()));

        let (broker, seen) = self::broker(1000);
        let (result, ()) = tokio::join!(
            broker.token(TokenKind::Session),
            answer(broker.clone(), seen, Ok(String::new()))
        );
        assert_eq!(result, Err("Not signed in.".to_string()));
    }

    #[tokio::test]
    async fn gives_up_when_the_page_doesn_t_answer() {
        let (broker, _) = broker(20);
        assert!(broker.token(TokenKind::Powersync).await.is_err());
        assert!(broker.pending.lock().unwrap().is_empty());
        // A late answer is ignored.
        broker.reply(1, Ok("late".into()));
    }

    #[tokio::test]
    async fn fails_straight_away_if_the_page_can_t_be_asked() {
        let broker = TokenBroker::new(Duration::from_secs(5), |_| Err("no window".to_string()));
        assert_eq!(
            broker.token(TokenKind::Powersync).await,
            Err("no window".to_string())
        );
        assert!(broker.pending.lock().unwrap().is_empty());
    }
}
