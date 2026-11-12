//! Sends local changes to PostgREST, one request per change.

use powersync::{CrudEntry, UpdateType};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// The eight server tables. Nothing else is ever uploaded.
pub const TABLES: [&str; 8] = [
    "profiles",
    "practice_settings",
    "invoice_styles",
    "patients",
    "price_items",
    "invoices",
    "visits",
    "invoice_lines",
];

/// A change the server refused. Sent to the page; never includes row data.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Rejection {
    pub table: String,
    /// `PUT`, `PATCH` or `DELETE`.
    pub operation: String,
    /// HTTP status, or 0 when it was refused before sending.
    pub status: u16,
    /// Postgres error code from PostgREST, e.g. `23514` (a check, such as a locked invoice).
    pub code: Option<String>,
    /// The database's own message (our triggers write readable ones).
    pub message: Option<String>,
}

/// Try again later: the session expired, or the server or network had a problem.
#[derive(Debug, PartialEq)]
pub struct Retry(pub String);

impl std::fmt::Display for Retry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Retry {}

pub struct Uploader {
    client: reqwest::Client,
    api_url: String,
    booleans: HashMap<String, HashSet<String>>,
}

fn operation(update: &UpdateType) -> &'static str {
    match update {
        UpdateType::Put => "PUT",
        UpdateType::Patch => "PATCH",
        UpdateType::Delete => "DELETE",
    }
}

/// Row IDs are UUIDs; anything else is refused rather than put in a URL.
fn is_uuid(id: &str) -> bool {
    id.len() == 36
        && id.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

impl Uploader {
    /// `api_url` is PostgREST's base, e.g. `https://api.getkineo.work/rest/v1`.
    /// `booleans` lists each table's boolean columns (0/1 locally).
    pub fn new(
        client: reqwest::Client,
        api_url: impl Into<String>,
        booleans: HashMap<String, Vec<String>>,
    ) -> Self {
        Self {
            client,
            api_url: api_url.into().trim_end_matches('/').to_string(),
            booleans: booleans
                .into_iter()
                .map(|(table, columns)| (table, columns.into_iter().collect()))
                .collect(),
        }
    }

    /// The JSON the server expects: 0/1 back to false/true in boolean columns.
    fn body(&self, table: &str, data: &Map<String, Value>) -> Map<String, Value> {
        let booleans = self.booleans.get(table);
        data.iter()
            .map(|(column, value)| {
                let is_boolean = booleans.is_some_and(|set| set.contains(column));
                let value = match value {
                    Value::Number(n) if is_boolean => Value::Bool(n.as_i64() != Some(0)),
                    other => other.clone(),
                };
                (column.clone(), value)
            })
            .collect()
    }

    fn refused(entry: &CrudEntry, message: &str) -> Rejection {
        Rejection {
            table: entry.table.clone(),
            operation: operation(&entry.update_type).to_string(),
            status: 0,
            code: None,
            message: Some(message.to_string()),
        }
    }

    /// Uploads one transaction's changes in order. `Ok(None)`: all saved.
    /// `Ok(Some(..))`: the server refused one; later changes in the transaction aren't sent.
    pub async fn upload(
        &self,
        session_token: &str,
        entries: &[CrudEntry],
    ) -> Result<Option<Rejection>, Retry> {
        for entry in entries {
            if !TABLES.contains(&entry.table.as_str()) {
                return Ok(Some(Self::refused(entry, "Not a table Kineō syncs.")));
            }
            if !is_uuid(&entry.id) {
                return Ok(Some(Self::refused(entry, "The row's ID isn't valid.")));
            }
            let url = format!("{}/{}", self.api_url, entry.table);
            let data = entry.data.clone().unwrap_or_default();
            let request = match entry.update_type {
                UpdateType::Put => {
                    let mut row = self.body(&entry.table, &data);
                    row.insert("id".to_string(), Value::String(entry.id.clone()));
                    self.client
                        .post(&url)
                        .header("Prefer", "resolution=merge-duplicates,return=minimal")
                        .header("Content-Type", "application/json")
                        .body(Value::Object(row).to_string())
                }
                UpdateType::Patch => {
                    if data.is_empty() {
                        continue;
                    }
                    self.client
                        .patch(&url)
                        .query(&[("id", format!("eq.{}", entry.id))])
                        .header("Prefer", "return=minimal")
                        .header("Content-Type", "application/json")
                        .body(Value::Object(self.body(&entry.table, &data)).to_string())
                }
                UpdateType::Delete => self
                    .client
                    .delete(&url)
                    .query(&[("id", format!("eq.{}", entry.id))])
                    .header("Prefer", "return=minimal"),
            };

            // Errors never include the URL or token.
            let response = request
                .bearer_auth(session_token)
                .send()
                .await
                .map_err(|_| Retry("Couldn't reach the server.".to_string()))?;
            let status = response.status();
            if status.is_success() {
                continue;
            }
            let code = status.as_u16();
            if code == 401 || code == 408 || code == 429 || status.is_server_error() {
                return Err(Retry(format!("The server answered {code}.")));
            }
            // Any other refusal won't succeed on retry: report it and move on.
            let error: Value = response.json_text().await;
            return Ok(Some(Rejection {
                table: entry.table.clone(),
                operation: operation(&entry.update_type).to_string(),
                status: code,
                code: error
                    .get("code")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                message: error
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            }));
        }
        Ok(None)
    }
}

/// Reads a JSON error body, or `null` if there isn't one.
trait JsonText {
    async fn json_text(self) -> Value;
}

impl JsonText for reqwest::Response {
    async fn json_text(self) -> Value {
        let text = self.text().await.unwrap_or_default();
        serde_json::from_str(&text).unwrap_or(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{body_json, header, headers, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const ID: &str = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const ID2: &str = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

    fn entry(update_type: UpdateType, table: &str, id: &str, data: Value) -> CrudEntry {
        CrudEntry {
            client_id: 1,
            transaction_id: 1,
            update_type,
            table: table.to_string(),
            id: id.to_string(),
            metadata: None,
            data: data.as_object().cloned(),
            previous_values: None,
        }
    }

    fn uploader(server: &MockServer) -> Uploader {
        let booleans = HashMap::from([("invoices".to_string(), vec!["tax_enabled".to_string()])]);
        Uploader::new(
            reqwest::Client::new(),
            format!("{}/rest/v1/", server.uri()),
            booleans,
        )
    }

    #[tokio::test]
    async fn put_upserts_the_whole_row_with_booleans_restored() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/invoices"))
            .and(header("authorization", "Bearer session-jwt"))
            // wiremock splits header values on commas.
            .and(headers(
                "prefer",
                vec!["resolution=merge-duplicates", "return=minimal"],
            ))
            .and(body_json(
                json!({ "id": ID, "number": 3, "tax_enabled": true, "status": "draft" }),
            ))
            .respond_with(ResponseTemplate::new(201))
            .expect(1)
            .mount(&server)
            .await;
        let change = entry(
            UpdateType::Put,
            "invoices",
            ID,
            json!({ "number": 3, "tax_enabled": 1, "status": "draft" }),
        );
        assert_eq!(
            uploader(&server).upload("session-jwt", &[change]).await,
            Ok(None)
        );
    }

    #[tokio::test]
    async fn patch_updates_only_the_changed_columns() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/rest/v1/invoices"))
            .and(query_param("id", format!("eq.{ID}")))
            .and(body_json(json!({ "tax_enabled": false })))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let change = entry(
            UpdateType::Patch,
            "invoices",
            ID,
            json!({ "tax_enabled": 0 }),
        );
        assert_eq!(uploader(&server).upload("t", &[change]).await, Ok(None));
    }

    #[tokio::test]
    async fn delete_removes_the_row_and_leaves_other_tables_numbers_alone() {
        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path("/rest/v1/visits"))
            .and(query_param("id", format!("eq.{ID}")))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/price_items"))
            .and(body_json(
                json!({ "id": ID2, "unit_price_cents": 0, "name": "Assessment" }),
            ))
            .respond_with(ResponseTemplate::new(201))
            .expect(1)
            .mount(&server)
            .await;
        let changes = [
            entry(UpdateType::Delete, "visits", ID, Value::Null),
            entry(
                UpdateType::Put,
                "price_items",
                ID2,
                json!({ "unit_price_cents": 0, "name": "Assessment" }),
            ),
        ];
        assert_eq!(uploader(&server).upload("t", &changes).await, Ok(None));
    }

    #[tokio::test]
    async fn a_refusal_is_reported_and_stops_the_rest_of_the_transaction() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/rest/v1/visits"))
            .respond_with(ResponseTemplate::new(400).set_body_json(json!({
                "code": "23514",
                "message": "Visits can't be added once an invoice is sent.",
                "details": "Failing row contains (made-up row data)",
            })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(201))
            .expect(0)
            .mount(&server)
            .await;

        let changes = [
            entry(
                UpdateType::Patch,
                "visits",
                ID,
                json!({ "invoice_id": ID2 }),
            ),
            entry(
                UpdateType::Put,
                "patients",
                ID2,
                json!({ "full_name": "Sky Example" }),
            ),
        ];
        let rejection = uploader(&server)
            .upload("t", &changes)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            rejection,
            Rejection {
                table: "visits".into(),
                operation: "PATCH".into(),
                status: 400,
                code: Some("23514".into()),
                message: Some("Visits can't be added once an invoice is sent.".into()),
            }
        );
    }

    #[tokio::test]
    async fn refusals_without_a_json_body_are_still_reported() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;
        let change = entry(
            UpdateType::Put,
            "patients",
            ID,
            json!({ "full_name": "Sky Example" }),
        );
        let rejection = uploader(&server)
            .upload("t", &[change])
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (rejection.status, rejection.code, rejection.message),
            (403, None, None)
        );
    }

    #[tokio::test]
    async fn expired_sessions_and_server_trouble_are_retried() {
        for status in [401, 408, 429, 500, 503] {
            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .respond_with(ResponseTemplate::new(status))
                .mount(&server)
                .await;
            let change = entry(
                UpdateType::Put,
                "patients",
                ID,
                json!({ "full_name": "Sky Example" }),
            );
            assert!(
                uploader(&server).upload("t", &[change]).await.is_err(),
                "{status} should be retried"
            );
        }
    }

    #[tokio::test]
    async fn an_unreachable_server_is_retried() {
        let uploader = Uploader::new(
            reqwest::Client::new(),
            "http://127.0.0.1:9/rest/v1",
            HashMap::new(),
        );
        let change = entry(UpdateType::Delete, "patients", ID, Value::Null);
        assert_eq!(
            uploader.upload("t", &[change]).await,
            Err(Retry("Couldn't reach the server.".into()))
        );
    }

    #[tokio::test]
    async fn unknown_tables_and_bad_ids_are_refused_without_sending() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(201))
            .expect(0)
            .mount(&server)
            .await;
        let up = uploader(&server);
        let not_synced = up
            .upload("t", &[entry(UpdateType::Put, "spike_rows", ID, json!({}))])
            .await;
        assert_eq!(not_synced.unwrap().unwrap().status, 0);
        for bad_id in [
            "1",
            "x&owner_id=neq.0",
            "0f8fad5b-d9cb-469f-a165-70867728950",
            "0f8fad5bxd9cb-469f-a165-70867728950e",
        ] {
            let refused = up
                .upload(
                    "t",
                    &[entry(UpdateType::Delete, "visits", bad_id, Value::Null)],
                )
                .await;
            assert_eq!(
                refused.unwrap().unwrap().message.as_deref(),
                Some("The row's ID isn't valid.")
            );
        }
    }

    #[tokio::test]
    async fn an_empty_patch_sends_nothing() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(204))
            .expect(0)
            .mount(&server)
            .await;
        let change = entry(UpdateType::Patch, "patients", ID, json!({}));
        assert_eq!(uploader(&server).upload("t", &[change]).await, Ok(None));
    }
}
