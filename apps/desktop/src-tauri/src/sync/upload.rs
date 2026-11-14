//! Sends local changes to PostgREST, one request per change, except a new invoice:
//! it and the visits put on it in the same transaction go as one `create_invoice`
//! call (supabase/migrations/…_create_invoice.sql), which saves them together or
//! not at all and replaces a number another device already used.

use powersync::{CrudEntry, UpdateType};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// The eleven server tables. Nothing else is ever uploaded.
pub const TABLES: [&str; 11] = [
    "profiles",
    "practice_settings",
    "invoice_styles",
    "patients",
    "price_items",
    "invoices",
    "visits",
    "invoice_lines",
    "funding_types",
    "patient_fundings",
    "visit_items",
];

/// The invoice's Bill to columns, sent to `create_invoice` as `p_billing`. jsonb
/// (`bill_to_details`) goes as the JSON text it's stored as; the server reads it.
const BILLING_COLUMNS: [&str; 6] = [
    "bill_to_kind",
    "bill_to_name",
    "bill_to_address",
    "bill_to_funding_name",
    "patient_funding_id",
    "bill_to_details",
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

    /// The `create_invoice` call for a new invoice, and which entries it covers
    /// (the visits the same transaction put on it).
    fn create_invoice_request(
        &self,
        invoice: &CrudEntry,
        entries: &[CrudEntry],
    ) -> Result<(reqwest::RequestBuilder, Vec<usize>), Rejection> {
        let data = invoice.data.clone().unwrap_or_default();
        let covered: Vec<usize> = entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| {
                entry.table == "visits"
                    && matches!(entry.update_type, UpdateType::Patch)
                    && entry
                        .data
                        .as_ref()
                        .and_then(|d| d.get("invoice_id"))
                        .and_then(Value::as_str)
                        == Some(invoice.id.as_str())
            })
            .map(|(index, _)| index)
            .collect();
        let mut visit_ids = Vec::new();
        for &index in &covered {
            let visit = &entries[index];
            if !is_uuid(&visit.id) {
                return Err(Self::refused(visit, "The row's ID isn't valid."));
            }
            visit_ids.push(Value::String(visit.id.clone()));
        }
        let billing: Map<String, Value> = BILLING_COLUMNS
            .iter()
            .map(|&column| {
                let value = data.get(column).cloned().unwrap_or(Value::Null);
                (column.to_string(), value)
            })
            .collect();
        let args = serde_json::json!({
            "p_id": invoice.id,
            "p_patient_id": data.get("patient_id"),
            "p_number": data.get("number"),
            "p_tax_rate_basis_points": data.get("tax_rate_basis_points"),
            "p_visit_ids": visit_ids,
            "p_created_at": data.get("created_at"),
            "p_billing": billing,
        });
        let request = self
            .client
            .post(format!("{}/rpc/create_invoice", self.api_url))
            .header("Content-Type", "application/json")
            .body(args.to_string());
        Ok((request, covered))
    }

    /// Uploads one transaction's changes in order. `Ok(None)`: all saved.
    /// `Ok(Some(..))`: the server refused one; later changes in the transaction aren't sent.
    pub async fn upload(
        &self,
        session_token: &str,
        entries: &[CrudEntry],
    ) -> Result<Option<Rejection>, Retry> {
        // Entries already sent as part of a create_invoice call.
        let mut handled: HashSet<usize> = HashSet::new();
        for (index, entry) in entries.iter().enumerate() {
            if handled.contains(&index) {
                continue;
            }
            if !TABLES.contains(&entry.table.as_str()) {
                return Ok(Some(Self::refused(entry, "Not a table Kineō syncs.")));
            }
            if !is_uuid(&entry.id) {
                return Ok(Some(Self::refused(entry, "The row's ID isn't valid.")));
            }
            let url = format!("{}/{}", self.api_url, entry.table);
            let data = entry.data.clone().unwrap_or_default();
            let request = match entry.update_type {
                // A new invoice: with its visits, as one all-or-nothing call.
                UpdateType::Put if entry.table == "invoices" => {
                    match self.create_invoice_request(entry, entries) {
                        Ok((request, covered)) => {
                            handled.extend(covered);
                            request
                        }
                        Err(rejection) => return Ok(Some(rejection)),
                    }
                }
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
    use wiremock::matchers::{
        body_json, body_partial_json, header, headers, method, path, query_param,
    };
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const ID: &str = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const ID2: &str = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const INVOICE: &str = "16fd2706-8baf-433b-82eb-8c7fada847da";
    const LINE: &str = "2b1f0c3e-6a4d-4c8e-9d57-3e8f1a2b4c60";
    const PATIENT: &str = "886313e1-3b8a-4372-9b90-0c9aee199e5d";

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
        let booleans = HashMap::from([
            ("invoices".to_string(), vec!["tax_enabled".to_string()]),
            (
                "profiles".to_string(),
                vec!["full_name_on_invoice".to_string()],
            ),
        ]);
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
            .and(path("/rest/v1/profiles"))
            .and(header("authorization", "Bearer session-jwt"))
            // wiremock splits header values on commas.
            .and(headers(
                "prefer",
                vec!["resolution=merge-duplicates", "return=minimal"],
            ))
            .and(body_json(
                json!({ "id": ID, "full_name": "Alex Example", "full_name_on_invoice": true }),
            ))
            .respond_with(ResponseTemplate::new(201))
            .expect(1)
            .mount(&server)
            .await;
        let change = entry(
            UpdateType::Put,
            "profiles",
            ID,
            json!({ "full_name": "Alex Example", "full_name_on_invoice": 1 }),
        );
        assert_eq!(
            uploader(&server).upload("session-jwt", &[change]).await,
            Ok(None)
        );
    }

    /// The transaction PracticeWriter.createInvoice makes: the invoice, then each visit.
    fn new_invoice_transaction() -> Vec<CrudEntry> {
        vec![
            entry(
                UpdateType::Put,
                "invoices",
                INVOICE,
                json!({
                    "owner_id": "user_test",
                    "patient_id": PATIENT,
                    "number": 5,
                    "status": "draft",
                    "tax_enabled": 0,
                    "tax_rate_basis_points": 500,
                    "created_at": "2026-11-13T10:00:00.000Z",
                    "updated_at": "2026-11-13T10:00:00.000Z",
                }),
            ),
            entry(
                UpdateType::Patch,
                "visits",
                ID,
                json!({ "invoice_id": INVOICE, "updated_at": "2026-11-13T10:00:00.000Z" }),
            ),
            entry(
                UpdateType::Patch,
                "visits",
                ID2,
                json!({ "invoice_id": INVOICE, "updated_at": "2026-11-13T10:00:00.000Z" }),
            ),
        ]
    }

    #[tokio::test]
    async fn a_new_invoice_and_its_visits_go_as_one_create_invoice_call() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/rpc/create_invoice"))
            .and(header("authorization", "Bearer session-jwt"))
            .and(body_json(json!({
                "p_id": INVOICE,
                "p_patient_id": PATIENT,
                "p_number": 5,
                "p_tax_rate_basis_points": 500,
                "p_visit_ids": [ID, ID2],
                "p_created_at": "2026-11-13T10:00:00.000Z",
                "p_billing": {
                    "bill_to_kind": null,
                    "bill_to_name": null,
                    "bill_to_address": null,
                    "bill_to_funding_name": null,
                    "patient_funding_id": null,
                    "bill_to_details": null,
                },
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!(5)))
            .expect(1)
            .mount(&server)
            .await;
        // The visits aren't sent on their own as well.
        Mock::given(method("PATCH"))
            .respond_with(ResponseTemplate::new(204))
            .expect(0)
            .mount(&server)
            .await;
        assert_eq!(
            uploader(&server)
                .upload("session-jwt", &new_invoice_transaction())
                .await,
            Ok(None)
        );
    }

    #[tokio::test]
    async fn a_new_invoice_sends_its_bill_to_as_p_billing() {
        let server = MockServer::start().await;
        let details =
            json!([{ "id": ID2, "label": "Billing number", "value": "4821" }]).to_string();
        Mock::given(method("POST"))
            .and(path("/rest/v1/rpc/create_invoice"))
            .and(body_partial_json(json!({
                "p_billing": {
                    "bill_to_kind": "funding",
                    "bill_to_name": "Test Funding Branch",
                    "bill_to_address": "PO Box 1\nTestville BC V0V 0V0",
                    "bill_to_funding_name": "Test Funding",
                    "patient_funding_id": ID,
                    "bill_to_details": details,
                },
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!(5)))
            .expect(1)
            .mount(&server)
            .await;
        let mut changes = new_invoice_transaction();
        let data = changes[0].data.get_or_insert_with(Map::new);
        for (column, value) in [
            ("bill_to_kind", json!("funding")),
            ("bill_to_name", json!("Test Funding Branch")),
            ("bill_to_address", json!("PO Box 1\nTestville BC V0V 0V0")),
            ("bill_to_funding_name", json!("Test Funding")),
            ("patient_funding_id", json!(ID)),
            ("bill_to_details", json!(details)),
        ] {
            data.insert(column.to_string(), value);
        }
        assert_eq!(uploader(&server).upload("t", &changes).await, Ok(None));
    }

    #[tokio::test]
    async fn funding_types_upsert_like_any_other_table() {
        let server = MockServer::start().await;
        let details = json!([{
            "id": ID2,
            "label": "Billing number",
            "kind": "text",
            "show_on_invoice": true,
        }])
        .to_string();
        Mock::given(method("POST"))
            .and(path("/rest/v1/funding_types"))
            .and(headers(
                "prefer",
                vec!["resolution=merge-duplicates", "return=minimal"],
            ))
            .and(body_json(
                json!({ "id": ID, "name": "Test Funding", "details": details }),
            ))
            .respond_with(ResponseTemplate::new(201))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .and(path("/rest/v1/patient_fundings"))
            .and(query_param("id", format!("eq.{ID2}")))
            .and(body_json(json!({ "ended_on": "2026-11-13" })))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let changes = [
            entry(
                UpdateType::Put,
                "funding_types",
                ID,
                json!({ "name": "Test Funding", "details": details }),
            ),
            entry(
                UpdateType::Patch,
                "patient_fundings",
                ID2,
                json!({ "ended_on": "2026-11-13" }),
            ),
        ];
        assert_eq!(uploader(&server).upload("t", &changes).await, Ok(None));
    }

    #[tokio::test]
    async fn visit_items_upsert_like_any_other_table() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/visit_items"))
            .and(headers(
                "prefer",
                vec!["resolution=merge-duplicates", "return=minimal"],
            ))
            .and(body_json(
                json!({ "id": ID, "visit_id": ID2, "name": "Test item", "quantity": 2 }),
            ))
            .respond_with(ResponseTemplate::new(201))
            .expect(1)
            .mount(&server)
            .await;
        let change = entry(
            UpdateType::Put,
            "visit_items",
            ID,
            json!({ "visit_id": ID2, "name": "Test item", "quantity": 2 }),
        );
        assert_eq!(uploader(&server).upload("t", &[change]).await, Ok(None));
    }

    #[tokio::test]
    async fn invoice_lines_follow_create_invoice_as_upserts() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!(5)))
            .mount(&server)
            .await;
        let mut changes = new_invoice_transaction();
        changes.push(entry(
            UpdateType::Put,
            "invoice_lines",
            LINE,
            json!({ "invoice_id": INVOICE, "name": "Test item", "quantity": 1 }),
        ));
        assert_eq!(uploader(&server).upload("t", &changes).await, Ok(None));
        let requests = server.received_requests().await.unwrap();
        let sent: Vec<(String, String)> = requests
            .iter()
            .map(|r| (r.method.to_string(), r.url.path().to_string()))
            .collect();
        assert_eq!(
            sent,
            vec![
                (
                    "POST".to_string(),
                    "/rest/v1/rpc/create_invoice".to_string()
                ),
                ("POST".to_string(), "/rest/v1/invoice_lines".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn other_changes_in_the_transaction_are_still_sent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/rpc/create_invoice"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!(5)))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .and(path("/rest/v1/patients"))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let mut changes = new_invoice_transaction();
        changes.push(entry(
            UpdateType::Patch,
            "patients",
            PATIENT,
            json!({ "updated_at": "2026-11-13T10:00:00.000Z" }),
        ));
        assert_eq!(uploader(&server).upload("t", &changes).await, Ok(None));
    }

    #[tokio::test]
    async fn a_refused_invoice_is_reported_once_and_nothing_else_is_sent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/rest/v1/rpc/create_invoice"))
            .respond_with(ResponseTemplate::new(400).set_body_json(json!({
                "code": "23514",
                "message": "One of these visits is already on another invoice, or no longer exists.",
            })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .respond_with(ResponseTemplate::new(204))
            .expect(0)
            .mount(&server)
            .await;
        let rejection = uploader(&server)
            .upload("t", &new_invoice_transaction())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (
                rejection.table.as_str(),
                rejection.operation.as_str(),
                rejection.code.as_deref()
            ),
            ("invoices", "PUT", Some("23514"))
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
