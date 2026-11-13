# Kineō tasks: Phase 5, funding and invoices

Part of the shared checklist in [`tasks.md`](tasks.md). Same rules: work top to bottom, tick a task (`[x]`) only when it meets the definition of done in `CLAUDE.md`, and add follow-ups to **Discovered** in `tasks.md`.

**Sources:** [`funding-info.md`](funding-info.md) (rules and labels), the [kineō funding and invoices storyboard](https://claude.ai/artifact/Nc4KpNEafBd5fh4fEs4Jpv) (boards Main, DesktopFundingTypes, DesktopFundingEditor, DesktopPatientBilling, DesktopBillTo, DesktopInvoiceFunded, PhoneFunding, each in light and dark). Each ticket below already holds every string, size and rule it needs. Read the board it names only to check the layout. Where a ticket and the storyboard disagree, the ticket wins (the decisions below say why).

**Order:** server SQL (F1–F3) → local schema (F4) → `@kineo/shared` (F5–F7) → `@kineo/invoice-template` (F8) → `@kineo/data` (F9–F11, after shared because the writer and mappers use its types) → `@kineo/tokens` (F12) → phone (F13–F16) → desktop (F17–F22) → docs (F23). Each ticket leaves the repo building and passing.

**Every ticket's base checks**, plus the ones it lists:

```bash
pnpm check
```

```bash
pnpm format:check
```

Read every file right before you change it (the owner edits at the same time). No `git commit`; suggest a one-line commit message when done.

---

## Decisions (owner, 13 November 2026)

1. **Live until invoiced.** A patient funding stores only this patient's values, period and a link to its type. Recipient name, recipient address, detail labels, kinds and Show on invoice come live from the type. The **invoice** snapshots Bill to when it's created. While the invoice is a draft, saving the type or the funding refreshes the snapshot (F10). Once sent, it's locked. This replaces "a copy of the type's recipient and details" in `funding-info.md` §3 (F23 updates the doc).
2. **Service date per line.** `invoice_lines.service_date` (nullable date). On a funded invoice, every line needs a date that is one of the invoice's visit dates before it can be sent. Self-pay lines keep `null` and print as today.
3. **Tokens approved**, after a contrast check (WCAG 2.x). New `inputEdge` (#878791 light, #6B7684 dark). It is the input border, the light switch's off track, and the funding chip outline. Measured: #878791 is 3.56:1 on #FFFFFF, 3.24:1 on #F4F4F5 and 3.42:1 on #F7FBFF. #6B7684 is 3.72:1 on #151C24, 3.03:1 on #232D38 and 4.11:1 on #0B1117. A white knob on #878791 is 3.56:1, and #E6EDF3 on #6B7684 is 3.91:1. Correction to the storyboard: the light focus ring #0284C7 is 3.94:1 on the page #F7FBFF (4.10:1 is on white). It still passes 3:1.
4. **Pending items stay out:** one Show on invoice switch (shown means required); only the recipient is mandatory on a type; whole-number quantities; no registration number line; no rate warning; no Home deadline cue. Drop from the storyboard: "Authorized hourly rate can warn you when a line goes over." and "Registration no. [your number]". F23 lists them under Discovered.
5. **Gaps the storyboard doesn't cover, decided here** (so tickets don't guess):
   - Saving a funding type does **not** require a recipient. The list shows the problem, and sending is blocked. This lets a practitioner save the ICBC starting point, whose recipient is unverified.
   - Saving a patient funding **does** require every shown detail and valid dates.
   - Dates are typed as text and read by `parseDayInput` ("1 Apr 2026", "1 April 2026" or "2026-04-01"). No date picker dependency.
   - A new invoice bills the patient's most recently added active funding, or self-pay if there is none.
   - Several active fundings are allowed. "Change" picks one per invoice.
   - **End funding** sets `ended_on` to today and shows a "Funding ended" toast with Undo.
   - A funding type can be deleted only while no patient has an **active** funding of it. Ended fundings of a deleted type lose their link (`funding_type_id` set null) and are hidden. Invoices keep their snapshot.
   - Self-pay "Add address" saves to both the invoice and the patient (`patients.billing_address`), so the next invoice has it.
   - On a funded draft, "+ Add" from the price list adds one line per visit date (quantity 1 each). With exactly one visit, choosing a funding dates undated lines automatically. Taking a visit off clears the date on lines that used it.
   - Starting points open the editor pre-filled; nothing is saved until **Save funding type**.
   - The desktop patient screen keeps its current primary, **Create invoice (N visits)** (U7), not the board's "Invoice 2 visits".
   - The phone has no Settings row for funding types (desktop-only configuration).

---

## Shared contracts (reference for every ticket)

Database JSON shapes (`jsonb`; snake_case keys):

| Column                           | Shape                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `funding_types.details`          | `[{"id": uuid, "label": text, "kind": "text"\|"date", "show_on_invoice": bool}]` |
| `patient_fundings.detail_values` | `{"<detail uuid>": text}`                                                        |
| `invoices.bill_to_details`       | `[{"id": uuid, "label": text, "value": text}]` (shown details only)              |

The apps store jsonb locally as JSON text and upload it as a JSON **string**. Each table with jsonb has a `before insert or update` trigger that turns a string back into the value (as `cancelled_visit_dates` already does).

Shared models (`@kineo/shared`, camelCase, added in F5):

```ts
type FundingDetailKind = "text" | "date";
interface FundingDetail {
  id: string;
  label: string;
  kind: FundingDetailKind;
  showOnInvoice: boolean;
}
interface FundingType {
  id: string;
  ownerId: string;
  name: string;
  recipientName: string;
  recipientAddress: string; // may be "" (see decision 5)
  details: FundingDetail[]; // ≤ 20, labels unique ignoring case
  createdAt: string;
  updatedAt: string;
}
interface PatientFunding {
  id: string;
  ownerId: string;
  patientId: string;
  fundingTypeId: string | null; // null once its type is deleted (hidden)
  detailValues: Record<string, string>; // keyed by FundingDetail.id
  periodStart: string | null;
  periodEnd: string | null;
  endedOn: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}
interface BillToDetail {
  id: string;
  label: string;
  value: string;
}
type InvoiceBillTo =
  | { kind: "patient"; name: string; address: string }
  | {
      kind: "funding";
      patientFundingId: string | null;
      fundingName: string;
      name: string;
      address: string;
      details: BillToDetail[];
    };
// Added as optional fields so existing object literals still compile:
//   Invoice.billTo?: InvoiceBillTo   (undefined = self-pay, patient's name)
//   LineItem.serviceDate?: string | null
//   Patient.billingAddress?: string  (undefined = "")
```

Server and shared messages must match word for word. They are listed once in F2 and F6.

---

## Tickets

- [x] **F1. Funding tables, columns and row-level security**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** none
  **Board:** Main (model)

  **Schema.** Create `supabase/migrations/20261114090000_funding.sql`. Follow the style of `20261111221937_create_tables.sql`: comments on top, `set search_path = ''` on every function.

  1. Validation functions (`language sql immutable`, `set search_path = ''`):
     - `public.funding_details_valid(d jsonb) returns boolean`: true when `jsonb_typeof(d) = 'array'`, `jsonb_array_length(d) <= 20`, and every element is an object where `id` is a string matching `^[0-9a-f-]{36}$`, `label` is a string with `btrim(label) <> ''` and `char_length(label) <= 80`, `kind` is in (`'text'`, `'date'`), and `show_on_invoice` is a boolean (`jsonb_typeof = 'boolean'`). The `lower(btrim(label))` values must also be distinct.
     - `public.funding_values_valid(v jsonb) returns boolean`: `jsonb_typeof(v) = 'object'`, at most 20 keys, every value a string of at most 200 characters.
     - `public.bill_to_details_valid(d jsonb) returns boolean`: an array of at most 20 objects, each with string `id`, string `label` (non-blank, ≤ 80) and string `value` (≤ 200).
  2. `create table public.funding_types`: `id uuid primary key default gen_random_uuid()`, `owner_id text not null check (btrim(owner_id) <> '')`, `name text not null check (btrim(name) <> '' and char_length(name) <= 80)`, `recipient_name text not null default '' check (char_length(recipient_name) <= 200)`, `recipient_address text not null default '' check (char_length(recipient_address) <= 500)`, `details jsonb not null default '[]'::jsonb`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `unique (id, owner_id)`, `constraint funding_types_details_valid check (public.funding_details_valid(details))`. Index: `funding_types_owner_id_idx on (owner_id)`.
  3. `create table public.patient_fundings`: `id` and `owner_id` as above, `patient_id uuid not null`, `funding_type_id uuid`, `detail_values jsonb not null default '{}'::jsonb`, `period_start date`, `period_end date`, `ended_on date`, `created_at`, `updated_at`. Constraints:
     - `patient_fundings_patient_same_owner foreign key (patient_id, owner_id) references public.patients (id, owner_id)`
     - `patient_fundings_type_same_owner foreign key (funding_type_id, owner_id) references public.funding_types (id, owner_id) on delete set null (funding_type_id)`
     - `patient_fundings_values_valid check (public.funding_values_valid(detail_values))`
     - `patient_fundings_period_order check (period_start is null or period_end is null or period_end >= period_start)`
     - `unique (id, owner_id)`

     Indexes on `patient_id` and `funding_type_id`.

  4. `alter table public.patients add column billing_address text not null default '' check (char_length(billing_address) <= 500);`
  5. `alter table public.invoices` add:
     - `bill_to_kind text not null default 'patient' check (bill_to_kind in ('patient','funding'))`
     - `bill_to_name text not null default '' check (char_length(bill_to_name) <= 200)`
     - `bill_to_address text not null default '' check (char_length(bill_to_address) <= 500)`
     - `bill_to_funding_name text not null default '' check (char_length(bill_to_funding_name) <= 80)`
     - `patient_funding_id uuid`
     - `bill_to_details jsonb not null default '[]'::jsonb`

     Then add these constraints:
     - `invoices_patient_funding_same_owner foreign key (patient_funding_id, owner_id) references public.patient_fundings (id, owner_id) on delete set null (patient_funding_id)`
     - `invoices_bill_to_details_valid check (public.bill_to_details_valid(bill_to_details))`
     - `invoices_bill_to_kind_fields check ((bill_to_kind = 'patient' and bill_to_funding_name = '' and patient_funding_id is null and bill_to_details = '[]'::jsonb) or (bill_to_kind = 'funding' and btrim(bill_to_funding_name) <> ''))`

  6. `alter table public.invoice_lines add column service_date date;`
  7. Backfill: `update public.invoices i set bill_to_name = p.full_name from public.patients p where p.id = i.patient_id and i.bill_to_name = '';`
  8. jsonb-from-text triggers (`before insert or update`, plpgsql). Each one does: when `jsonb_typeof(new.<col>) = 'string'`, set `new.<col> := (new.<col> #>> '{}')::jsonb`. The three are `funding_types_details_from_text` (details), `patient_fundings_values_from_text` (detail_values) and `invoices_bill_to_details_from_text` (bill_to_details).
  9. Server guard on deleting a type: a `before delete` trigger `funding_types_delete_unused` that raises `'Move this type''s patients to another type before deleting it.'` (`errcode = 'check_violation'`) if any `patient_fundings` row has this `funding_type_id`, `ended_on is null`, and `(period_end is null or period_end >= current_date)`.
  10. Row-level security for both new tables, exactly like the loop in `20261111222421_row_level_security.sql`: enable RLS, set the owner_id default, revoke from anon, and add the four `_own` policies. Write the loop again here over `array['funding_types','patient_fundings']`.
  11. `alter publication powersync add table public.funding_types, public.patient_fundings;`

  **Sync.** In `infra/powersync/sync-config.yaml`, add `- SELECT * FROM funding_types WHERE owner_id = auth.user_id()` and the same for `patient_fundings`. Tell the owner that the PowerSync container must be restarted, and that the migration must be applied on the server machine.

  **Tests.** Create `supabase/tests/funding.test.sql` (pgTAP, one transaction rolled back, made-up data, UUID groups as in `locks.test.sql`). Cases, each its own assertion:
  - (a) A valid type inserts.
  - (b) Details with duplicate labels ("Billing number" and "billing number") are refused.
  - (c) `kind = 'number'` is refused.
  - (d) A details value sent as a JSON string (`'"[]"'::jsonb`) is stored as an array.
  - (e) `period_end < period_start` is refused.
  - (f) A funding with another owner's type is refused (foreign key).
  - (g) Deleting a type with an active funding raises the message.
  - (h) Deleting a type whose only funding is ended succeeds and sets that funding's `funding_type_id` to null.
  - (i) An invoice with `bill_to_kind = 'funding'` and an empty funding name is refused.
  - (j) The backfill: an existing invoice gets its patient's name.

  In `supabase/tests/rls.test.sql`, add both tables to its owner-isolation cases (user B can't select, update or delete user A's rows, and can't insert with user A's `owner_id`).

  **Files:** `supabase/migrations/20261114090000_funding.sql`, `infra/powersync/sync-config.yaml`, `supabase/tests/funding.test.sql`, `supabase/tests/rls.test.sql`.

  **Verification:** `pnpm test:db` (needs Docker) passes all old and new tests. `pnpm check` still passes. It will fail on `packages/data/tests/schema.test.ts` until F4, so F1 and F4 must land together; tell the owner to commit them as one.

- [ ] **F2. Server locks and send rules for Bill to and line dates**

  **Target model:** `[Opus Medium]`. Reason: it rewrites the shared status trigger and adds ordered send checks that must match the TypeScript messages exactly.
  **Depends on:** F1
  **Board:** DesktopBillTo (states 4–6)

  **Schema.** Create `supabase/migrations/20261114100000_funding_locks.sql`:

  1. A helper `public.sentence_label(label text) returns text` (immutable sql). If `char_length(label) >= 2` and `substr(label,2,1) <> upper(substr(label,2,1))`, it returns `lower(substr(label,1,1)) || substr(label,2)`; otherwise it returns `label` unchanged. Examples: "Billing number" → "billing number"; "ICBC claim number" → "ICBC claim number".
  2. `create or replace function public.invoices_status_and_tax()`: copy the current body from `20261113180000_cancel_invoice.sql` and keep every existing check. Add these, in this order, after the existing status-transition check:
     - **Lock:** if `old.status <> 'draft'` and any of `bill_to_kind`, `bill_to_name`, `bill_to_address`, `bill_to_funding_name` or `bill_to_details` is distinct from old, raise `'Bill to can''t be changed once an invoice is sent.'`. A change to `patient_funding_id` alone is allowed (foreign-key `set null` bookkeeping).
     - **Send checks**, only when `old.status = 'draft' and new.status = 'sent'`. Raise the first that fails:
       1. `new.bill_to_kind = 'funding'` and both name and address blank (btrim) → `format('%s has no recipient name or address. Add them in Settings, then send.', new.bill_to_funding_name)`.
       2. Funding and name blank → `format('%s has no recipient name. Add it in Settings, then send.', …)`.
       3. Funding and address blank → `format('%s has no recipient address. Add it in Settings, then send.', …)`.
       4. Funding and any element of `bill_to_details` with blank `value` → `format('Add the %s before sending.', public.sentence_label(<first such label>))`, taking elements in array order.
       5. Funding and any `invoice_lines` row of this invoice with `service_date is null`, or a `service_date` not among the `visit_date`s of visits with `invoice_id = new.id` → `'Pick a visit date for each line item before sending.'`.
       6. `new.bill_to_kind = 'patient'` and `btrim(new.bill_to_name) = ''` → `'Add the patient''s name before sending.'`.

     All use `errcode = 'check_violation'`.

  3. No change is needed for `invoice_lines.service_date`: `invoice_lines_only_on_draft` already locks every column once sent. Add a test that proves it.

  **Tests.** Create `supabase/tests/funding_locks.test.sql`. Each case below is one assertion:
  - (1)–(6): each send check, using `throws_ok` with the exact message.
  - A funded draft with everything filled sends.
  - Changing `bill_to_name` on a sent invoice is refused with the lock message.
  - Changing it on a draft succeeds.
  - Deleting the patient funding of a sent invoice nulls `patient_funding_id` without error.
  - Updating `service_date` on a sent invoice's line is refused with `'Line items can''t be changed once an invoice is sent.'`.
  - `sentence_label` on both examples.
  - The existing cancel and paid tests in `cancel_invoice.test.sql` and `locks.test.sql` still pass unchanged.

  **Files:** `supabase/migrations/20261114100000_funding_locks.sql`, `supabase/tests/funding_locks.test.sql`.

  **Verification:** `pnpm test:db`.

- [ ] **F3. `create_invoice` carries Bill to; both uploaders sync the new tables**

  **Target model:** `[Opus Medium]`. Reason: it keeps the TypeScript and Rust uploaders in parity with a new RPC argument and a JSON-string edge case.
  **Depends on:** F1
  **Board:** none

  **Schema.** Create `supabase/migrations/20261114110000_create_invoice_billing.sql`:

  1. `create function public.create_invoice(p_id uuid, p_patient_id uuid, p_number integer, p_tax_rate_basis_points integer, p_visit_ids uuid[], p_created_at timestamptz, p_billing jsonb)`. Its body is the same as the 6-argument version, except the insert also sets the bill-to columns from `p_billing`:
     - `bill_to_kind := coalesce(p_billing->>'bill_to_kind','patient')`
     - `bill_to_name := coalesce(p_billing->>'bill_to_name', (select full_name from public.patients where id = p_patient_id and owner_id = owner), '')`
     - `bill_to_address := coalesce(p_billing->>'bill_to_address','')`
     - `bill_to_funding_name := coalesce(p_billing->>'bill_to_funding_name','')`
     - `patient_funding_id := nullif(p_billing->>'patient_funding_id','')::uuid`
     - `bill_to_details`: if `jsonb_typeof(p_billing->'bill_to_details') = 'string'`, then `((p_billing->>'bill_to_details'))::jsonb`; otherwise `coalesce(p_billing->'bill_to_details','[]'::jsonb)`.

     `p_billing` may be null; then use the defaults.

  2. `create or replace` the 6-argument `create_invoice` so it returns `public.create_invoice(p_id, p_patient_id, p_number, p_tax_rate_basis_points, p_visit_ids, p_created_at, null)`. Older app builds keep working.
  3. Revoke from `public` and `anon`, and grant execute to `authenticated` on the 7-argument signature.

  **Uploaders.** Both must produce identical requests.
  - `apps/mobile/src/sync/upload.ts`: add `"funding_types"` and `"patient_fundings"` to `TABLES` (10 entries). In `createInvoice()`, add `p_billing` to `args`: an object with keys `bill_to_kind`, `bill_to_name`, `bill_to_address`, `bill_to_funding_name`, `patient_funding_id` and `bill_to_details`, each `data[key] ?? null`. `bill_to_details` is passed as it is in opData (a JSON string); the server parses it.
  - `apps/desktop/src-tauri/src/sync/upload.rs`: `pub const TABLES: [&str; 10]` with the same two names. In `create_invoice_request`, add `"p_billing": { "bill_to_kind": data.get("bill_to_kind"), … }` with the same six keys.

  **Tests.**
  - `supabase/tests/create_invoice.test.sql`: add (a) a 7-argument call with a funding billing object stores every column; (b) a `bill_to_details` given as a JSON string is stored as an array; (c) the 6-argument call stores `bill_to_kind = 'patient'` and the patient's name.
  - `apps/mobile/src/sync/upload.test.ts`: the existing create-invoice test expects `p_billing` with nulls; a new test with filled opData; a PUT to `funding_types` goes to `/funding_types` as a POST with merge-duplicates.
  - `upload.rs` tests: update `a_new_invoice_and_its_visits_go_as_one_create_invoice_call` to expect `p_billing`; add a `funding_types` PUT test.

  **Files:** the migration, `supabase/tests/create_invoice.test.sql`, `apps/mobile/src/sync/upload.ts`, `apps/mobile/src/sync/upload.test.ts`, `apps/desktop/src-tauri/src/sync/upload.rs`.

  **Verification:** `pnpm test:db`; `pnpm --filter @kineo/mobile test`; in `apps/desktop/src-tauri`: `cargo test` and `cargo clippy --all-targets` (no warnings).

- [x] **F4. Local schema for the funding tables and columns**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F1
  **Board:** none

  **Schema (local).** `packages/data/src/schema.ts`:
  - Add `funding_types: { columns: { owner_id, name, recipient_name, recipient_address, details, created_at, updated_at } }`. All are `"text"`; `details` gets a comment "JSON array (jsonb on the server)".
  - Add `patient_fundings: { columns: { owner_id, patient_id, funding_type_id, detail_values, period_start, period_end, ended_on, created_at, updated_at }, indexes: { patient: ["patient_id"], type: ["funding_type_id"] } }`, all `"text"`.
  - Add to `patients`: `billing_address: "text"`.
  - Add to `invoices`: `bill_to_kind`, `bill_to_name`, `bill_to_address`, `bill_to_funding_name`, `patient_funding_id`, `bill_to_details`, all `"text"`.
  - Add to `invoice_lines`: `service_date: "text"`.
  - Export `FundingTypeRow = Database["funding_types"]` and `PatientFundingRow = Database["patient_fundings"]`.
  - Update the header comment from "eight server tables" to "ten".

  Export the two row types from `packages/data/src/index.ts`.

  **Tests.** In `packages/data/tests/schema.test.ts`, change "has exactly the server's eight tables" to ten. The column-match tests then cover the new columns automatically. If `migrations.ts`'s `localType` refuses `date` or `jsonb`, extend it: both map to `"text"`.

  **Files:** `packages/data/src/schema.ts`, `packages/data/src/index.ts`, `packages/data/tests/schema.test.ts`, (if needed) `packages/data/tests/migrations.ts`.

  **Verification:** `pnpm --filter @kineo/data test`; `pnpm check`.

- [ ] **F5. Shared models: funding types, patient fundings, Bill to**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** none (can run in parallel with F1–F4)
  **Board:** Main

  **Shared.** In `packages/shared/src/schemas/models.ts`, add and export:

  ```ts
  export const fundingDetailKindSchema = z.enum(["text", "date"]);
  export const fundingDetailSchema = z.object({
    id,
    label: z.string().trim().min(1).max(80),
    kind: fundingDetailKindSchema,
    showOnInvoice: z.boolean(),
  });
  export const fundingTypeSchema = z
    .object({
      id,
      ownerId,
      name: z.string().trim().min(1).max(80),
      recipientName: z.string().trim().max(200),
      recipientAddress: z.string().trim().max(500),
      details: z.array(fundingDetailSchema).max(20),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .superRefine(
      /* labels unique ignoring case and outer spaces;
     issue path ["details", i, "label"], message "Two details can't have the same name." */
    );
  export const patientFundingSchema = z
    .object({
      id,
      ownerId,
      patientId: id,
      fundingTypeId: id.nullable(),
      detailValues: z.record(z.uuid(), z.string().trim().max(200)),
      periodStart: z.iso.date().nullable(),
      periodEnd: z.iso.date().nullable(),
      endedOn: z.iso.date().nullable(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .superRefine(
      /* periodEnd < periodStart → path ["periodEnd"], "The period can't end before it starts." */
    );
  export const billToDetailSchema = z.object({
    id,
    label: z.string().trim().min(1).max(80),
    value: z.string().trim().max(200),
  });
  export const invoiceBillToSchema = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("patient"),
      name: z.string().trim().max(200),
      address: z.string().trim().max(500),
    }),
    z.object({
      kind: z.literal("funding"),
      patientFundingId: id.nullable(),
      fundingName: z.string().trim().min(1).max(80),
      name: z.string().trim().max(200),
      address: z.string().trim().max(500),
      details: z.array(billToDetailSchema).max(20),
    }),
  ]);
  ```

  Add `billTo: invoiceBillToSchema.optional()` to the invoice object (before `.superRefine`), `serviceDate: z.iso.date().nullable().optional()` to `lineItemSchema`, and `billingAddress: z.string().trim().max(500).optional()` to `patientSchema`.

  In `packages/shared/src/types/models.ts`, add `FundingDetailKind`, `FundingDetail`, `FundingType`, `PatientFunding`, `BillToDetail` and `InvoiceBillTo` via `z.infer`. `index.ts` already re-exports both files.

  **Tests.** In `packages/shared/tests/models.test.ts`, add:
  - A valid type, funding and both Bill to kinds parse.
  - Duplicate labels ("Claim number" and " claim number ") are refused with the message.
  - 21 details are refused.
  - Kind `"number"` is refused.
  - A funding ending before it starts is refused with the message.
  - An existing invoice literal without `billTo` still parses.
  - A line with `serviceDate: "2026-11-04"` parses, and with `"4 Nov"` is refused.

  **Files:** `packages/shared/src/schemas/models.ts`, `packages/shared/src/types/models.ts`, `packages/shared/tests/models.test.ts`.

  **Verification:** `pnpm --filter @kineo/shared test`; `pnpm check` (nothing else should break, since the new fields are optional).

- [ ] **F6. Shared funding rules, starting points and date input**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F5
  **Board:** DesktopFundingTypes, DesktopFundingEditor, DesktopPatientBilling

  **Shared.**

  1. In `packages/shared/src/dates/display.ts`, add `formatDayMonthYear(date: string): string`. It turns `"2026-04-01"` into `"1 Apr 2026"` (en-GB, day numeric, month short, year numeric, UTC). Export it.
  2. Create `packages/shared/src/funding/dates.ts`:
     - `parseDayInput(text: string): { ok: true; value: string | null } | { ok: false; message: string }`. It trims. `""` gives `{ ok: true, value: null }`. It accepts `D Mon YYYY` and `D Month YYYY` with English month names in any case, `DD Mon YYYY`, and `YYYY-MM-DD`. Anything else, including impossible dates like 31 Feb, gives `{ ok: false, message: "Enter a date like 1 Apr 2026." }`. The value is `YYYY-MM-DD`.
     - `dayInputValue(date: string | null): string` returns `""` or `formatDayMonthYear(date)`. This is what an input shows.
  3. Create `packages/shared/src/funding/presets.ts`:

     ```ts
     export type FundingPresetKey = "autism-funding" | "cydb" | "icbc" | "blank";
     export interface FundingPreset {
       key: FundingPresetKey;
       chipLabel: string;
       name: string;
       recipientName: string;
       recipientAddress: string;
       details: readonly { label: string; kind: FundingDetailKind; showOnInvoice: boolean }[];
       notice: { text: string; until: string } | null;
     }
     export const FUNDING_PRESETS: readonly FundingPreset[];
     ```

     The four presets, in this order:

     | key              | chipLabel                             | name                                  | recipientName                                                      | recipientAddress                                 | details                           | notice                             |
     | ---------------- | ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------- | ---------------------------------- |
     | `autism-funding` | Autism Funding                        | Autism Funding                        | Autism Funding Branch, Ministry of Children and Family Development | `PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5` | Billing number, text, shown       | the text below, until `2027-03-31` |
     | `cydb`           | Children and Youth Disability Benefit | Children and Youth Disability Benefit | `""` (unverified)                                                  | `PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5` | Authorization number, text, shown | null                               |
     | `icbc`           | ICBC                                  | ICBC                                  | `""`                                                               | `""`                                             | Claim number, text, shown         | null                               |
     | `blank`          | Blank type                            | `""`                                  | `""`                                                               | `""`                                             | none                              | null                               |

     The Autism Funding notice text: "Autism Funding ends on 31 March 2027. When families move to the Children and Youth Disability Benefit, add that type, then move each patient across. Invoices already sent keep their old details."
     - `presetDraft(key: FundingPresetKey, newId: () => string): FundingTypeDraft` copies a preset and gives each detail a new id.

  4. Create `packages/shared/src/funding/rules.ts`:
     - `export interface FundingTypeDraft { name: string; recipientName: string; recipientAddress: string; details: FundingDetail[] }`
     - `export type FundingTypeError = { field: "name"; message: string } | { field: "detail"; detailId: string; message: string }`
     - `fundingTypeErrors(draft): FundingTypeError[]`, in this order:
       - blank name → "Add a name for this funding type.";
       - each blank detail label → "Name this detail, or remove it.";
       - each detail whose label repeats an earlier one (ignoring case and outer spaces) → "Two details can't have the same name.";
       - more than 20 details → on the 21st and later, "A funding type can have up to 20 details.".
     - `fundingTypeProblem(type: Pick<FundingType,"recipientName"|"recipientAddress">): string | null` → "Recipient name and address are empty" / "Recipient name is empty" / "Recipient address is empty" / null (each after a trim).
     - `sentenceLabel(label: string): string`, the same rule as the SQL `sentence_label` in F2.
     - `isFundingActive(f: PatientFunding, today: string): boolean` → `f.fundingTypeId !== null && f.endedOn === null && (f.periodEnd === null || f.periodEnd >= today)`.
     - `fundingEndedOn(f, today): string | null` → `f.endedOn ?? (f.periodEnd !== null && f.periodEnd < today ? f.periodEnd : null)`.
     - `activeFundingsFor(patientId, fundings, today): PatientFunding[]`: active ones for that patient, newest `createdAt` first.
     - `endedFundingsFor(patientId, fundings, today): PatientFunding[]`: not active, `fundingTypeId !== null`, newest first.
     - `fundingTypeUsage(typeId, fundings, today): number`: distinct patients with an active funding of that type.
     - `formatFundingPeriod(start, end): string | null` → "1 Apr 2026 – 31 Mar 2027" (spaces around an en dash, U+2013) / "From 1 Apr 2026" / "To 31 Mar 2027" / null.
     - `patientFundingErrors({ type, detailValues, periodStart, periodEnd }: { type: FundingType; detailValues: Record<string,string>; periodStart: string; periodEnd: string }): { field: string; message: string }[]`. The period arguments are the raw input text. In order:
       - each shown detail with a blank value → `{ field: detail.id, message: \`Add the ${sentenceLabel(label)}.\` }`;
       - each date-kind detail with text `parseDayInput` refuses → `{ field: detail.id, message: "Enter a date like 1 Apr 2026." }`;
       - `periodStart` / `periodEnd` that don't parse → `{ field: "periodStart" | "periodEnd", message: "Enter a date like 1 Apr 2026." }`;
       - end before start → `{ field: "periodEnd", message: "The period can't end before it starts." }`.
     - `fundingTypeRow(type, usage: number): { billTo: string | null; problem: string | null; counts: string }`. `billTo` is `Bill to ${recipientName}` when there is no problem, otherwise null. `problem` is from `fundingTypeProblem`. `counts` is `${n} detail(s) on invoices · ${m} patient(s)`, where n counts details with Show on invoice; use singular for 1, `"No details on invoices"` for n = 0 and `"no patients"` for m = 0 (e.g. "1 detail on invoices · no patients").
     - `fundingTypesSummary(types: FundingType[]): string`: "No funding types" / "1 type" / "N types". If k > 0 types have a problem, append " · 1 is missing a recipient" or " · k are missing a recipient".
     - `fundingNotice(types, today): string | null`: the first preset notice where some type's trimmed name equals the preset name ignoring case and `today <= notice.until`.
  5. Export all of these from `packages/shared/src/index.ts`, along with the types `FundingPreset`, `FundingPresetKey`, `FundingTypeDraft` and `FundingTypeError`.

  **Tests.** Create `packages/shared/tests/funding.test.ts`, covering every function and every message listed:
  - `parseDayInput` on "1 Apr 2026", "01 april 2026", "2026-04-01", "", "31 Feb 2026", "April 1" and "1/4/2026".
  - `sentenceLabel` on "Billing number", "ICBC claim number" and "A".
  - `isFundingActive` on the boundary day (`periodEnd === today` counts as active).
  - `formatFundingPeriod` for all four cases.
  - `fundingTypeRow` plurals.
  - `fundingNotice` before and after `2027-03-31`.
  - `presetDraft` giving fresh ids.

  Also add a `formatDayMonthYear` case to `src/dates/display.test.ts`.

  **Files:** `packages/shared/src/dates/display.ts`, `packages/shared/src/funding/dates.ts`, `packages/shared/src/funding/presets.ts`, `packages/shared/src/funding/rules.ts`, `packages/shared/src/index.ts`, `packages/shared/tests/funding.test.ts`. The `display.test.ts` case is a one-line addition, the seventh file, accepted.

  **Verification:** `pnpm --filter @kineo/shared test`; `pnpm check`.

- [ ] **F7. Shared Bill to rules: snapshot, choices, line dates and send blocks**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F6
  **Board:** DesktopBillTo (all six states), DesktopInvoiceFunded

  **Shared.** Create `packages/shared/src/funding/billTo.ts`:

  - `billToFor({ patient, funding, type }: { patient: Pick<Patient,"fullName"|"billingAddress">; funding: PatientFunding | null; type: FundingType | null }): InvoiceBillTo`. If `funding` or `type` is null, it returns `{ kind: "patient", name: patient.fullName, address: patient.billingAddress ?? "" }`. Otherwise it returns `{ kind: "funding", patientFundingId: funding.id, fundingName: type.name, name: type.recipientName, address: type.recipientAddress, details }`, where `details = type.details.filter(d => d.showOnInvoice).map(d => ({ id: d.id, label: d.label, value: funding.detailValues[d.id] ?? "" }))`.
  - `defaultBillTo({ patient, fundings, types, today })`: uses `activeFundingsFor(patient.id, …)[0]` and its type; with no active funding, self-pay.
  - `resolvedBillTo(invoice: Pick<Invoice,"billTo">, patient: Pick<Patient,"fullName"|"billingAddress"> | null): InvoiceBillTo`. It returns `invoice.billTo`, except when that is undefined or a patient kind with a blank name; then it returns the patient default (with name "Unknown patient" if `patient` is null).
  - `refreshDraftBillTo(current: InvoiceBillTo, type: FundingType, funding: PatientFunding): InvoiceBillTo`. This is the decision 1 refresh. Name, address and fundingName come from the type. Details are the type's shown details, each `value = (funding.detailValues[id] ?? "").trim() !== "" ? funding.detailValues[id] : (current.kind === "funding" ? current.details.find(x => x.id === id)?.value ?? "" : "")`.
  - `export interface BillToOption { key: string; title: string; detail: string; selected: boolean }`. Its `key` is the funding id, or `"patient"`.
  - `billToOptions({ patient, fundings, types, today, current }: …): BillToOption[]`: active fundings (newest first), then self-pay last. For a funding, `title` is the type name. `detail` is the first shown detail with a value, as `${label} ${value}`, plus ` · to ${formatDayMonthYear(periodEnd)}` when `periodEnd` is set (e.g. "Billing number 4821 · to 31 Mar 2027", "Claim number K1234567"); with neither it is `""`. For self-pay, `title` is "Self-pay" and `detail` is the patient's name. `selected` matches `current` (patient kind ↔ `"patient"`, funding ↔ its `patientFundingId`).
  - `billToSummary(billTo, patientName): string`. For a funding: `Client ${patientName}` plus, for each detail with a value, ` · ${label} ${value}` (e.g. "Client Maya Okafor · Billing number 4821"). For a patient: `""`.
  - `export type BillToTarget = { kind: "recipient" } | { kind: "detail"; detailId: string } | { kind: "lineDate"; lineId: string } | { kind: "patientName" }`.
  - `export interface BillToProblem { message: string; target: BillToTarget }`.
  - `billToProblems({ billTo, lines, visitDates }: { billTo: InvoiceBillTo; lines: readonly Pick<LineItem,"id"|"position"|"serviceDate">[]; visitDates: readonly string[] }): BillToProblem[]`. Same checks and order as F2's send checks, with the same messages, using `billTo.fundingName` for the type name. At most one recipient problem. One detail problem per blank detail, in order. A single line-date problem targeting the first undated or invalid line by `position`. Patient kind with a blank name → "Add the patient's name before sending." with target `patientName`.
  - `serviceDatesForNewLine(billTo, visitDates: readonly string[]): (string | null)[]`: for a funding with ≥ 1 visit date, the sorted unique dates; otherwise `[null]`.
  - `linesToAutoDate(lines, visitDates): string[]`: the ids of lines with no `serviceDate`, when `visitDates` has exactly one unique date; otherwise `[]`.
  - `linesLosingDate(lines, removedDate: string, remainingVisitDates: readonly string[]): string[]`: the ids of lines whose `serviceDate === removedDate` and that date isn't in `remainingVisitDates`.
  - `lineDateLabel(serviceDate: string | null | undefined): string` → "4 Nov" (`formatDayMonth`), or "Pick a date".

  In `packages/shared/src/invoices/sendProblems.ts`:
  - Add the optional parameter `billing?: { billTo: InvoiceBillTo; lines: readonly Pick<LineItem,"id"|"position"|"serviceDate">[]; visitDates: readonly string[] }`.
  - Add the optional `target?: BillToTarget` to `SendProblem`.
  - When `billing` is given, add `billToProblems(...)` as `{ message, inProfile: false, target }` right after the line-items problem and before the profile problem. Existing callers are unchanged.

  Export everything from `index.ts`.

  **Tests.** Create `packages/shared/tests/billTo.test.ts`, covering each function:
  - Every message in F2's list, word for word, as fixtures.
  - `refreshDraftBillTo` keeps an invoice-edited value when the funding's value is blank, and takes the funding's value when it's filled.
  - `billToOptions` order and `selected`.
  - `serviceDatesForNewLine` for self-pay, funded with 0 visits, and funded with 2 visits.

  In `src/invoices/sendProblems.test.ts`, add: without `billing`, the output is unchanged; with it, problems come in order and carry `target`.

  **Files:** `packages/shared/src/funding/billTo.ts`, `packages/shared/src/invoices/sendProblems.ts`, `packages/shared/src/index.ts`, `packages/shared/tests/billTo.test.ts`, `packages/shared/src/invoices/sendProblems.test.ts`.

  **Verification:** `pnpm --filter @kineo/shared test`; `pnpm check`.

- [ ] **F8. Invoice template: Bill to, client details and dated services**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F7
  **Board:** DesktopInvoiceFunded (Live preview), PhoneFunding step 4

  **Shared (template).** In `packages/invoice-template/src/index.ts`, `renderInvoiceHtml`:
  - `const billTo = resolvedBillTo(invoice, input.patient)`. Widen `InvoiceTemplateInput.patient` to `Pick<Patient,"fullName"|"billingAddress"> | null`, which is compatible with existing callers.
  - The bill-to section becomes a two-column grid (`grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px`):
    - Left: `<p class="label">Bill to</p><p class="name">{billTo.name}</p>`, then each address line split on `\n` as `<p>`. Names wrap and are never cut (`overflow-wrap: anywhere`).
    - Right, only for funding: `<p class="label">Client</p><p class="name">{patient full name}</p>`, then each detail as `<p class="label">{label}</p><p class="name id">{value}</p>`, with `.id { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }`.
    - For self-pay the right column is empty, and the existing "Visit on / Visits on …" line stays under the left column.
    - For funding, omit the visits line; dates are in the table.
  - Table for funding: header `Date | Service | Qty | Rate | Amount` (the last three `.num`). Rows are sorted by `serviceDate` (undated last), then `position`. The Date cell shows `4 Nov 2026` (`formatDayMonthYear`) or `—` if undated. Self-pay keeps `Item | Qty | Price | Amount` unchanged. The empty row's `colspan` is 5 for funding and 4 for self-pay.
  - Everything else is unchanged: no note text, footer note and cancelled mark as today.

  **Tests.** In `packages/invoice-template/tests/template.test.ts`, add:
  - Funded: Bill to name and both address lines, "Client", the patient name, "Billing number" and "4821", a Date header, two rows "4 Nov 2026" and "12 Nov 2026" in date order, no "Visits on".
  - Self-pay: still "Bill to" with the patient name and the billing address when set, the old header, "Visits on".
  - HTML in labels and values is escaped.
  - Existing tests pass unchanged.

  Use only made-up names; the storyboard's "Maya Okafor" and "4821" are made-up.

  **Files:** `packages/invoice-template/src/index.ts`, `packages/invoice-template/tests/template.test.ts`.

  **Verification:** `pnpm --filter @kineo/invoice-template test`; `pnpm check`.

- [ ] **F9. Data layer reads: mappers, practice data, demo and seed**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F4, F5
  **Board:** none

  **Data.**
  - `packages/data/src/mappers.ts`:
    - Add `toFundingType(row: FundingTypeRow): FundingType`. Parse `details` from JSON text and map `show_on_invoice` → `showOnInvoice`; an invalid JSON or shape throws `RowError("funding_types")`.
    - Add `toPatientFunding(row: PatientFundingRow): PatientFunding`.
    - Extend `toInvoice` with `billTo`. If `bill_to_kind === "funding"`, it is the funding shape with `details` parsed from `bill_to_details`; otherwise `{ kind: "patient", name: bill_to_name ?? "", address: bill_to_address ?? "" }`.
    - Extend `toLineItem` with `serviceDate: row.service_date ?? null` and `toPatient` with `billingAddress: row.billing_address ?? ""`.
  - `packages/data/src/practiceData.ts`:
    - `PracticeData` gains `fundingTypes: FundingType[]` and `patientFundings: PatientFunding[]`.
    - `Rows` and `TABLES` gain `funding_types` and `patient_fundings`.
    - `PRACTICE_QUERIES.funding_types = "SELECT * FROM funding_types WHERE owner_id = ? ORDER BY name COLLATE NOCASE, id"` and `PRACTICE_QUERIES.patient_fundings = "SELECT * FROM patient_fundings WHERE owner_id = ? ORDER BY created_at DESC, id"`.
    - Map both in `buildPracticeData` and update the "eight tables" comment.
  - `packages/data/src/demo.ts` and `supabase/seed.sql`, kept matching:
    - One funding type "Autism Funding" (id `5eed0000-0000-4000-8000-000000000701`) with the preset's recipient and a "Billing number" detail (id `5eed0000-0000-4000-8000-000000000702`, shown).
    - One funding type "ICBC" (`…703`) with an empty recipient and a "Claim number" detail (`…704`, shown).
    - One patient funding for Casey Fictional on Autism Funding (`…801`), billing number `"4821"`, period `2026-04-01`–`2027-03-31`.
    - Update the seed header comment's list.
  - Add `fundingTypes: []` and `patientFundings: []` (or the demo values) everywhere a `PracticeData` literal is built. Find them with `grep -rn "invoiceStyle:" apps packages --include='*.ts' --include='*.tsx'`. This touches app files; that's expected, and the edit is mechanical (one or two lines each).

  **Tests.**
  - `packages/data/tests/mappers.test.ts`: `toFundingType` with JSON-text details; invalid JSON → RowError; `toInvoice` for both kinds; `toLineItem` `serviceDate`.
  - `packages/data/tests/practiceData.test.ts`: the two new tables are watched and mapped.
  - `packages/data/tests/demo.test.ts`: demo data parses with the new schemas.

  **Files:** `packages/data/src/mappers.ts`, `packages/data/src/practiceData.ts`, `packages/data/src/demo.ts`, `supabase/seed.sql`, `packages/data/tests/mappers.test.ts`, `packages/data/tests/practiceData.test.ts`, plus the mechanical `PracticeData` literal fixes.

  **Verification:** `pnpm --filter @kineo/data test`; `pnpm check`; `pnpm test:db` (the seed still loads).

- [ ] **F10. Writer: funding types and patient fundings**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F7, F9
  **Board:** DesktopFundingEditor, DesktopPatientBilling

  **Data.** In `packages/data/src/writes.ts`, add to `PracticeWriter`. Each method is one `writeTransaction`, as the existing methods are. Rule failures throw `FundingRuleError`, a new class in `packages/shared/src/funding/rules.ts` (`class FundingRuleError extends Error { override name = "FundingRuleError" }`, exported). Its message is the first error's message, so it is safe to show.

  ```ts
  saveFundingType(input: FundingTypeDraft & { id?: string }): Promise<FundingType>
  deleteFundingType(id: string): Promise<void>
  addPatientFunding(input: { patientId: string; fundingTypeId: string; detailValues: Record<string, string>; periodStart: string | null; periodEnd: string | null }): Promise<PatientFunding>
  updatePatientFunding(id: string, input: { detailValues: Record<string, string>; periodStart: string | null; periodEnd: string | null }): Promise<PatientFunding>
  endPatientFunding(id: string): Promise<PatientFunding>     // ended_on = env.today()
  undoEndPatientFunding(id: string): Promise<PatientFunding> // ended_on = null
  ```

  - **`saveFundingType`:** run `fundingTypeErrors`; throw on the first. Insert when there's no `id` (new id from `env.newId`), otherwise update. If the id doesn't exist: `WriteError("That funding type no longer exists.")`. Write `details` as `JSON.stringify` with `show_on_invoice` keys.

    Then, in the same transaction, refresh every **draft** invoice whose `patient_funding_id` belongs to a funding of this type. Its `bill_to_name`, `bill_to_address`, `bill_to_funding_name` and `bill_to_details` become the result of `refreshDraftBillTo` (F7), and `updated_at` becomes now.

  - **`deleteFundingType`:** refuse with `FundingRuleError("Move this type's patients to another type before deleting it.")` when `fundingTypeUsage > 0`. Otherwise set `funding_type_id = NULL` on its patient fundings, then delete the type. The local database has no foreign keys, so do both explicitly.
  - **`addPatientFunding` / `updatePatientFunding`:** load the type (missing → `WriteError("That funding type no longer exists.")`). Convert the period values back to input text with `dayInputValue` and run `patientFundingErrors`; throw on the first. The callers pass `YYYY-MM-DD` or null; the UI parses. Keep only values whose keys are this type's detail ids, trimmed. On update, refresh this funding's draft invoices as above.
  - **`endPatientFunding` / `undoEndPatientFunding`:** missing → `WriteError("That funding no longer exists.")`.

  **Tests.** Create `packages/data/tests/fundingWrites.test.ts`, using the existing `tests/sqlite.ts` helpers as `invoiceWrites.test.ts` does. Cover:
  - Save new, and update.
  - A blank name throws "Add a name for this funding type."
  - Saving a type refreshes a draft's recipient and leaves a sent invoice unchanged.
  - Delete is refused while it has an active funding; allowed when that funding is ended, and the funding's type becomes null.
  - Add a funding with a missing shown value throws "Add the billing number."
  - End sets today; undo clears it.
  - Updating a funding's value refreshes the draft detail.

  **Files:** `packages/data/src/writes.ts`, `packages/shared/src/funding/rules.ts` (`FundingRuleError`), `packages/shared/src/index.ts`, `packages/data/tests/fundingWrites.test.ts`.

  **Verification:** `pnpm --filter @kineo/data test`; `pnpm check`.

- [ ] **F11. Writer: Bill to on invoices, line dates and send**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F10
  **Board:** DesktopBillTo, DesktopInvoiceFunded

  **Data.** `packages/data/src/writes.ts`:

  - **`createInvoice` (changed):** read the patient, fundings and types in the transaction and compute `defaultBillTo(…, today = env.today())`. Insert the six bill-to columns: `bill_to_details` as `JSON.stringify` of `[{id,label,value}]`, or `"[]"`; `patient_funding_id` set or null.
  - **New methods:**

    ```ts
    setBillTo(invoiceId: string, choice: { kind: "patient" } | { kind: "funding"; patientFundingId: string }): Promise<Invoice>
    setBillToDetail(invoiceId: string, detailId: string, value: string): Promise<void>
    setSelfPayAddress(invoiceId: string, address: string): Promise<void>
    setLineServiceDate(lineId: string, serviceDate: string | null): Promise<void>
    ```

    - **`setBillTo`:** the invoice must be a draft (`loadDraftInvoice`). The funding must belong to the invoice's patient and be active; otherwise `InvoiceRuleError("Pick one of this patient's current fundings.")`. Write `billToFor(...)`. Then, if `linesToAutoDate` returns ids, set their `service_date` to the single visit date.
    - **`setBillToDetail`:** draft only; the invoice must be funded and the detail id present, otherwise `InvoiceRuleError("That detail isn't on this invoice.")`. Trim and set the value.
    - **`setSelfPayAddress`:** draft only, patient kind only, otherwise `InvoiceRuleError("Only a self-pay invoice has the patient's address.")`. Trim to at most 500 characters, update `invoices.bill_to_address` and `patients.billing_address`, and touch both `updated_at`.
    - **`setLineServiceDate`:** draft only. Non-null must be one of the invoice's visit dates, otherwise `InvoiceRuleError("Pick one of this invoice's visit dates.")`.

  - **`addLine` (changed):** on a draft, `serviceDatesForNewLine(billTo, visitDates)` gives the dates. Insert one line per date (quantity 1 each when there is more than one date, otherwise the given `quantity`), with consecutive `position`s and `service_date`. The method still returns `Promise<LineItem>`: the first line inserted.
  - **`setVisitOnInvoice` (changed):** when removing a visit, set `service_date = NULL` on the lines in `linesLosingDate(...)`.
  - **`sendInvoice` (changed):** before `markSent`, run `billToProblems` and throw `InvoiceRuleError(first.message)`.
  - **`writeStatus` / `loadInvoice`:** select the new columns (they already do with `SELECT *` + `toInvoice`); nothing else changes.

  **Tests.** Create `packages/data/tests/invoiceBillingWrites.test.ts`:
  - A new invoice for a patient with one active funding is funded, with the detail value copied.
  - With none, it's self-pay with the patient's name and billing address.
  - With two, the newest is used.
  - `setBillTo` to self-pay and back.
  - `setBillTo` on a sent invoice throws (the existing lock message from `loadDraftInvoice`).
  - Auto-dating with one visit.
  - `addLine` on a funded draft with two visits makes two dated lines.
  - Removing a visit clears its lines' date.
  - `setLineServiceDate` with a foreign date throws.
  - `setSelfPayAddress` updates the patient.
  - `sendInvoice` throws each F2 message in order.
  - The create upload opData contains the bill-to columns (read the `ps_crud` row as `pendingInvoices.test.ts` does).

  **Files:** `packages/data/src/writes.ts`, `packages/data/tests/invoiceBillingWrites.test.ts`, (if an existing assertion on `addLine` / `createInvoice` columns changes) `packages/data/tests/invoiceWrites.test.ts`.

  **Verification:** `pnpm --filter @kineo/data test`; `pnpm check`.

- [ ] **F12. Tokens: input edge, switch track, chip text and funding icons**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** none (can run in parallel with F1–F11)
  **Board:** Main (colour decisions, chips and tags)

  **Tokens.** In `packages/tokens/src/index.ts`:
  - `colors`: add `inputEdge: "#878791"` with the comment "Input border, switch off track and funding chip outline: 3.24:1 on inputFill, 3.56:1 on surface". Change `controlTrack` to `"#878791"` and update its comment (it was HeroUI's own). Add `chipText: "#3F3F46"` ("Funding chip text: 10:1 on page and surface").
  - `darkColors`: add `inputEdge: "#6B7684"` (`controlTrack` is already `#6B7684`) and `chipText: "#D4D4D8"`.
  - Add `export const fundingChipIcons`:

    ```ts
    {
      funding: { viewBox: "0 0 24 24", paths: ["M4 21V5l8-2 8 2v16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4"], circles: [] },
      selfPay: { viewBox: "0 0 24 24", paths: ["M4 21c1-4 4-6 8-6s7 2 8 6"], circles: [{ cx: 12, cy: 8, r: 4, dashed: false }] },
      ended:   { viewBox: "0 0 16 16", paths: [], circles: [{ cx: 8, cy: 8, r: 6, dashed: true }] },
    } as const
    ```

    Stroke `currentColor`; width 2 (24 box) or 1.6 (16 box); drawn at 14 px.

  - In `packages/tokens/src/heroui.css` and `heroui-native.css`, set the input border colour at rest to `inputEdge` in both modes, keeping the existing focus rule (surface fill and a primary border). Set the switch off track to `controlTrack`.

  **Tests.** In `packages/tokens/tests/tokens.test.ts`:
  - `inputEdge` ≥ 3:1 against `surface`, `inputFill` and `pageBackground` in both palettes.
  - `chipText` ≥ 4.5:1 against `surface` and `pageBackground` in both.
  - The switch knob (light `#FFFFFF`, dark `text`) ≥ 3:1 on `controlTrack`.
  - The CSS files contain the token values (as the existing sync tests do).

  **Files:** `packages/tokens/src/index.ts`, `packages/tokens/src/heroui.css`, `packages/tokens/src/heroui-native.css`, `packages/tokens/tests/tokens.test.ts`.

  **Verification:** `pnpm --filter @kineo/tokens test`; `pnpm check`. Then look at one input screen on each app in light and dark (desktop: `pnpm --filter @kineo/desktop dev` → Your profile; phone: iOS simulator → Profile) and report that the border shows and focus still turns the field white with a sky border.

- [ ] **F13. Phone: funding chip and the patient's Billing card**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F9, F12
  **Board:** PhoneFunding step 1, Main (chips)

  **Phone.**
  - Create `apps/mobile/src/components/funding-chip.tsx`: `export function FundingChip({ variant, label }: { variant: "funding" | "selfPay" | "ended"; label: string })`. It is an inline pill: radius pill, padding 3/10/3/8, gap 6, 13 px weight 500, text `chipText`, 1 px border `inputEdge` (dashed for `ended`), transparent background. The icon from `fundingChipIcons` at 14 px, `accessibilityElementsHidden`. It never wraps (`numberOfLines={1}`). For `ended`, the label is passed as "Ended 31 Mar 2027". Colours come from the theme hook the other components use (`theme/theme-colors.ts`).
  - In `apps/mobile/src/screens/patient/index.tsx`, add a **Billing** card above the Visits card (padding 16, gap 8):
    - The header row is "Billing" (15/600 muted, an accessibility header).
    - Then, for each active funding (`activeFundingsFor(patient.id, data.patientFundings, today)`), a block:
      - row: `FundingChip variant="funding" label={type.name}`, and on the right an "Edit" text button (44 px target) that opens `/patient-funding/{patientId}?fundingId={id}` in the current tab group;
      - line (15 px): the first shown detail with a value, as "{label} " plus a semibold value (tabular figures);
      - muted line: `formatFundingPeriod(...)`, when not null.
    - With no active funding: `FundingChip variant="selfPay" label="Self-pay"` and a muted line "Invoices go to {patient name}."
    - Ended fundings (`endedFundingsFor`): each a row with the type name (muted) and `FundingChip variant="ended" label={\`Ended ${formatDayMonthYear(endedOn)}\`}`.
    - Footer, after a top border: an "Add funding" text button with a plus icon, opening `/patient-funding/{patientId}`.

    The pinned primary is unchanged (Save note / Create invoice).

  **Tests.**
  - Create `apps/mobile/src/components/funding-chip.test.tsx`: label, dashed border on `ended`, colours from tokens in light and dark.
  - In `apps/mobile/src/screens/patient/patient.test.tsx`: the demo patient with funding shows "Autism Funding", "Billing number 4821" and "1 Apr 2026 – 31 Mar 2027"; a patient without funding shows "Self-pay" and "Invoices go to …"; "Add funding" and "Edit" navigate to the right routes.

  **Files:** `apps/mobile/src/components/funding-chip.tsx`, `apps/mobile/src/components/funding-chip.test.tsx`, `apps/mobile/src/screens/patient/index.tsx`, `apps/mobile/src/screens/patient/patient.test.tsx`.

  **Verification:** `pnpm --filter @kineo/mobile test`; `pnpm check`. Simulator check in light and dark at default and largest text size: the chip doesn't wrap and the card fits within the 16 px margins.

- [ ] **F14. Phone: Add funding and Edit funding screen**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F10, F13
  **Board:** PhoneFunding step 2

  **Phone.**
  - Routes: `apps/mobile/src/app/(home)/patient-funding/[patientId].tsx` and `apps/mobile/src/app/(patients)/patient-funding/[patientId].tsx`. Each one renders `<PatientFundingScreen />`, following the existing `new-invoice/[patientId].tsx` route files. An optional `fundingId` search parameter means edit.
  - Create `apps/mobile/src/screens/patient-funding/index.tsx`, wrapped in `PracticeGate` (the form skeleton, title "Add funding"):
    - Back button `accessibilityLabel="Back to {patient name}"`.
    - h1 (26/700): "Add funding", or "Edit funding" when editing.
    - Fields: 16 px input text (no iOS zoom), 44 px height, labels 14/500, the hint word 13 px in the placeholder colour with 6 px start margin.
      - **Funding type:** a select of types by name; disabled when editing. With no types, show only the muted paragraph "You haven't made any funding types yet. Add them in Kineō on your computer, under Settings." and a pinned "Go back".
      - One field per type detail, label = detail label, hint "Required" if `showOnInvoice`, else "Optional". For the date kind, placeholder "e.g. 1 Apr 2026".
      - **Starts** and **Ends** (hint "Optional", placeholder "e.g. 1 Apr 2026"), in two columns with a 12 px gap.
    - A Bill to box (`inputFill` background, radius 12, padding 12/14, 14 px): "Bill to" in the placeholder colour, then the recipient name. If `fundingTypeProblem` is set, show instead, in the error colour with an alert icon: "{type name} has no recipient yet. Add it in Kineō on your computer before you send." Saving is still allowed.
    - Muted caption: "Need a different funder? Add its type in Kineō on your computer, under Settings."
    - When editing: an "End funding" text button (error colour isn't needed; normal text button) at the end of the body. It calls `writer.endPatientFunding`, goes back, and shows the toast "Funding ended" with **Undo** (`undoEndPatientFunding`). Like the existing Undo toasts, it stays until dismissed.
    - Pinned: primary "Save funding" ("Saving…" while pending, via `PendingButton`), and a "Cancel" ghost button below it.
  - Save: parse every date field with `parseDayInput`, run `patientFundingErrors` and show each error under its field. The error is tied with `aria-describedby` / `accessibilityHint` the way the Profile screen ties field errors. Move focus to the first error. Then call `addPatientFunding` or `updatePatientFunding`, go back, and toast "Funding added" or "Funding saved". A thrown error shows the existing error toast with `userMessage(error)`.

  **Tests.** Create `apps/mobile/src/screens/patient-funding/patient-funding.test.tsx`:
  - Add with values saves and shows the toast.
  - An empty billing number shows "Add the billing number." under the field and doesn't save.
  - "April 1" shows "Enter a date like 1 Apr 2026."
  - Edit pre-fills "1 Apr 2026" and disables the type.
  - End funding shows the toast with Undo, and Undo clears it.
  - With no types, the notice shows.

  **Files:** the two route files, `apps/mobile/src/screens/patient-funding/index.tsx`, `apps/mobile/src/screens/patient-funding/patient-funding.test.tsx`.

  **Verification:** `pnpm --filter @kineo/mobile test`; `pnpm check`. Simulator check in light and dark of the add, edit, error and no-types states.

- [ ] **F15. Phone invoice editor: Bill to card and Change sheet**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F11, F13
  **Board:** PhoneFunding step 3, DesktopBillTo states 1–4 and 6 (same words)

  **Phone.**
  - Create `apps/mobile/src/components/bill-to-sheet.tsx`, a bottom sheet following `price-item-sheet.tsx`:
    - Title "Bill to".
    - A radio list (`accessibilityRole="radiogroup"`, `accessibilityLabel="Bill to"`) of `billToOptions(...)`. Each row is at least 44 px, with an 18 px radio circle in `primaryStrong`, bold title and a muted detail line. The selected row has a `tint` background and `textOnTint` text.
    - Choosing a row calls `writer.setBillTo`, then closes. No toast.
  - In `apps/mobile/src/screens/invoice/index.tsx` (draft editor), add a Bill to card under the number and tag header (padding 16, gap 10, no heading, as on the board):
    - **Funded:** a row with `FundingChip funding {fundingName}` and, on the right, a "Change" text button (always shown on a funded invoice; it opens the sheet). Then the recipient name (15/600, wraps). Then for each detail: label = detail label, hint "Required", and an input holding the value (16 px, tabular figures). It saves with `setBillToDetail` on blur. Date kinds are parsed with `parseDayInput`; when one can't be read, show "Enter a date like 1 Apr 2026." and don't save it.
    - **Self-pay:** `FundingChip selfPay "Self-pay"`, with "Change" shown only when the patient has an active funding. Then the patient name (15/600).
      - With no address: muted "No address yet. A name is enough, an address is optional." and an "Add address" text button.
      - With an address: its lines and an "Edit address" text button.
      - Either button opens an inline multiline input labelled "Address" (hint "Optional") with text buttons "Save address" and "Cancel". Save calls `setSelfPayAddress` and shows the toast "Address saved".
    - **Errors:** take the billing problems from `billToProblems` (F7).
      - Under each detail input whose target matches, show the message in the error colour with an alert icon (16 px), 14 px, tied with `aria-describedby`, and `aria-invalid` on the input.
      - A recipient problem shows as an alert in that card (`accessibilityRole="alert"`), with text "{name} has no recipient address. Add it in Kineō on your computer, under Settings, then send." (use the F7 message, replacing "in Settings" with "in Kineō on your computer, under Settings").
    - **Preview and send** (pinned) stays enabled. When billing problems exist, tapping it doesn't navigate: it scrolls to and focuses the first problem's input (for a recipient problem, the alert gets focus).

  **Tests.** In `apps/mobile/src/screens/invoice/invoice.test.tsx`, add:
  - A funded draft shows the chip, the recipient and "Billing number" with "Required".
  - Clearing it shows "Add the billing number before sending." and Preview and send doesn't navigate.
  - Change lists "Autism Funding", "Billing number 4821 · to 31 Mar 2027" and "Self-pay", and choosing Self-pay switches the card.
  - Add address saves and toasts "Address saved".
  - An ICBC-type funding without a recipient shows the alert text.

  **Files:** `apps/mobile/src/components/bill-to-sheet.tsx`, `apps/mobile/src/screens/invoice/index.tsx`, `apps/mobile/src/screens/invoice/invoice.test.tsx`.

  **Verification:** `pnpm --filter @kineo/mobile test`; `pnpm check`. Simulator check in light and dark of funded, self-pay, error and sheet.

- [ ] **F16. Phone: dated lines, preview send block and locked Bill to**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F8, F15
  **Board:** PhoneFunding steps 3–4, DesktopBillTo state 5

  **Phone.**
  - In `apps/mobile/src/screens/invoice/index.tsx`, on a **funded** draft only:
    - The collapsed line row reads "{lineDateLabel} · {name} · {qty} × · {amount}" (e.g. "4 Nov · Physiotherapy, 60 min · 1 × · $110.00").
    - The expanded line row gains a "Visit date" label above a row of pill radio buttons (`accessibilityRole="radiogroup"`, `accessibilityLabel="Visit date for {line name}"`), one per visit date of the invoice ("4 Nov", "12 Nov"), each at least 44 px high. Choosing one calls `setLineServiceDate`.
    - A line whose target is in `billToProblems` shows "Pick a visit date for each line item before sending." under its date pills (error style), and Preview and send focuses that line (expands it) first.
  - In `apps/mobile/src/screens/invoice-preview/index.tsx`, pass `billing: { billTo: resolvedBillTo(invoice, patient), lines, visitDates }` to `sendProblems`. The existing alert lists them; Share PDF and Mark as sent stay disabled while any problem exists, as they do today.
  - In `apps/mobile/src/screens/invoice/detail.tsx` (sent, paid and cancelled), add a Bill to card:
    - Funded: a row with `FundingChip funding {fundingName}` and the status tag on the right. Self-pay: the "Self-pay" chip.
    - The name (600, wraps).
    - Funded only: `billToSummary` muted.
    - A muted line with a lock icon (16 px): "Locked once sent. Later changes to the funding don't alter this invoice."

    No Change, no inputs.

  **Tests.**
  - In `invoice.test.tsx`: the dated row text, choosing a date calls the writer, and the undated-line error and focus.
  - In `invoice-preview.test.tsx`: a funded draft with an empty detail lists "Add the billing number before sending." and disables Share PDF.
  - Create `apps/mobile/src/screens/invoice/detail.test.tsx` (or extend the existing detail tests in `invoice.test.tsx`, wherever they live): the locked line and no Change button.

  **Files:** `apps/mobile/src/screens/invoice/index.tsx`, `apps/mobile/src/screens/invoice-preview/index.tsx`, `apps/mobile/src/screens/invoice/detail.tsx`, `apps/mobile/src/screens/invoice/invoice.test.tsx`, `apps/mobile/src/screens/invoice-preview/invoice-preview.test.tsx`.

  **Verification:** `pnpm --filter @kineo/mobile test`; `pnpm check`. Simulator: Share PDF a funded invoice and check the PDF shows Bill to, Client, Billing number and dated rows, in light and dark (the paper stays white).

- [ ] **F17. Desktop store: funding actions and data**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F11
  **Board:** none

  **Desktop.**
  - In `apps/desktop/src/data/practiceStore.ts`, add to `PracticeStore`, with the same signatures as `PracticeWriter` (F10, F11): `saveFundingType`, `deleteFundingType`, `addPatientFunding`, `updatePatientFunding`, `endPatientFunding`, `undoEndPatientFunding`, `setBillTo`, `setBillToDetail`, `setSelfPayAddress`, `setLineServiceDate`.
  - `apps/desktop/src/data/liveStore.ts`: delegate each to `this.writer`, as the existing methods do.
  - `apps/desktop/src/data/store.ts` (`DemoStore`, in memory): implement each with the same `@kineo/shared` rules and messages as the writer, including refreshing drafts, auto-dating, `addLine` per visit date, clearing dates on visit removal, and the `sendInvoice` billing check. `createInvoice` uses `defaultBillTo`. `createDemoState` includes the demo `fundingTypes` and `patientFundings` from `@kineo/data/demo`. Throw `StoreError` with the shared message, as the existing demo methods do.
  - `apps/desktop/src/data/demoPracticeStore.ts`: wrap each in `this.run`.

  **Tests.** In `apps/desktop/src/data/store.test.ts`, add the same cases as F10's and F11's data tests, against `DemoStore` (the same messages, word for word).

  **Files:** `practiceStore.ts`, `liveStore.ts`, `store.ts`, `demoPracticeStore.ts`, `store.test.ts` (all in `apps/desktop/src/data/`).

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`.

- [ ] **F18. Desktop: funding chip, Settings row and Funding types list**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F12, F17
  **Board:** DesktopFundingTypes

  **Desktop.**
  - Create `apps/desktop/src/components/FundingChip.tsx`: the same API and look as the phone chip (F13), as a `<span>` with `white-space: nowrap` and the icon `aria-hidden="true"`. Colours come from CSS variables set from tokens (see how `StatusTag.tsx` gets its colours).
  - In `apps/desktop/src/screens/Settings.tsx`, add a "Funding types" row after "Invoice style", with the summary `fundingTypesSummary(data.fundingTypes)`, opening `/settings/funding-types`.
  - Create `apps/desktop/src/screens/FundingTypes.tsx`. Use Settings chrome: no wordmark or tab bar at the top; the small wordmark with Terms and Privacy at the bottom middle, as the other Settings screens do via `Screen`. Content max width 760 px, top padding 64, gap 24:
    - Header row: back arrow (44 px, `aria-label="Back to Settings"`), h1 "Funding types" (28/700), and on the right the primary "Add funding type" → `/settings/funding-types/new`.
    - Intro (15 px muted, max width 560, start margin 56): "Who you bill besides the patient. A type sets the recipient and the details that print on the invoice."
    - A card listing the types (name order).
      - Each row is a link (min height 76, padding 12/20, gap 16, bottom border except the last) to `/settings/funding-types/{id}`.
      - Row content: a 40 px icon tile (radius 12, `tint` background, `primary` building icon 20 px), then three lines from `fundingTypeRow(type, fundingTypeUsage(...))`:
        - the name (600);
        - `billTo` (14 muted), or `problem` (14, error colour, with a 14 px alert icon);
        - `counts` (14 muted).
      - A muted chevron at the end. Hover: page background.
    - **Empty state** (no types), inside the card (padding 20, muted 15): "No funding types yet. Add one, or start from a common type below."
    - Section h2 "Start from a common type" (15/600 muted). Then the preset chips: buttons, min height 44, outlined in `inputEdge`, text `chipText`, 14/500, with a 16 px plus icon. One per `FUNDING_PRESETS` with its `chipLabel`, opening `/settings/funding-types/new?preset={key}`. Caption (13 muted): "Starting points only. Check each funder's current requirements before you bill. You can change everything."
    - When `fundingNotice(types, today)` isn't null, an info banner (`tint` background, `textOnTint` text, radius 12, padding 14/16, 14 px, info icon 18 px) with that text.
  - In `apps/desktop/src/router.tsx`, add `/settings/funding-types` (gated, `FormSkeleton title="Funding types"`).

  **Tests.** Create `apps/desktop/src/screens/FundingTypes.test.tsx` (demo store):
  - Rows show "Bill to Autism Funding Branch, Ministry of Children and Family Development" and "1 detail on invoices · 1 patient".
  - The ICBC row shows "Recipient name and address are empty".
  - The empty state.
  - Preset chips link with `?preset=`.
  - The notice shows before 31 March 2027 (fixed clock).
  - The Settings row summary "2 types · 1 is missing a recipient" (in `Settings.test.tsx`).

  **Files:** `components/FundingChip.tsx`, `screens/FundingTypes.tsx`, `screens/FundingTypes.test.tsx`, `screens/Settings.tsx`, `screens/Settings.test.tsx`, `router.tsx` (in `apps/desktop/src/`).

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`. `pnpm --filter @kineo/desktop dev`: check the list, empty state and banner in light and dark.

- [ ] **F19. Desktop: funding type editor**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F18
  **Board:** DesktopFundingEditor

  **Desktop.** Create `apps/desktop/src/screens/FundingTypeEditor.tsx`, with routes `/settings/funding-types/new` (optional `?preset=`) and `/settings/funding-types/:typeId`, both gated with `FormSkeleton title="Funding type" wide`. It uses Settings chrome. The page is max width 1160, top padding 56, gap 16.

  - **Header:** back arrow (`aria-label="Back to Funding types"`). h1 26/700 is the trimmed name, or "New funding type" when blank. Primary on the right: "Save funding type" ("Saving…" via `PendingButton`).
  - Two columns (`minmax(0,1fr) minmax(0,1fr)`, gap 24).
  - **Left, card 1** (padding 20, gap 16):
    - A row (`1fr 1.6fr`, gap 16) with "Type name" and "Recipient name" (hint "Required").
    - "Recipient address" (hint "Required", textarea, 3 rows).
    - Under an empty recipient field, a 13 px muted hint: "Required before you can send an invoice to this funder."
    - Labels are 14/500, the hint 13 px in the placeholder colour with 6 px start margin. Inputs are 44 px high, radius 12, `inputFill`, 15 px.
  - **Left, card 2** (padding 20/20/8): h2 "Details" (17/600), then "Details you show on the invoice must be filled in before it can be sent." (14 muted). Then one row per detail (gap 8, top border, padding 8/0):
    - the label input, flexible width, with a visually hidden label "Name of detail {n}";
    - a select (width 88, `aria-label="Kind for {label}"`, options "Text" and "Date");
    - "Show on invoice" with a switch (48×28, a real `<button type="button" role="switch" aria-checked aria-label="Show {label} on invoice">`, with a 12 px check on the knob when on). Use HeroUI's Switch if it renders `role="switch"` with those names; otherwise build it as specified;
    - a remove icon button (44 px, `aria-label="Remove {label}"`).

    Last row: an "Add detail" text button with a plus icon; it adds `{ id: newId, label: "", kind: "text", showOnInvoice: true }` and focuses its label. Hide it at 20 details.

  - **Right:** h2 "How it prints" (15/600 muted). Then a white paper card (always white with light text in both modes, radius 16, padding 28, 13 px):
    - The header uses `profile.clinicName.value || "[Your clinic name]"` (15/700) and `(profile.fullName.value || "[Your name]") + (title ? \`, ${title}\` : "")`. On the right: "Invoice" (15/700, `#0369A1`) and `formatInvoiceNumber(prefix, nextInvoiceNumber(invoices))`.
    - A two-column block. Left: "Bill to" (`#52525B`), the recipient name in bold (or "[Recipient name]"), and the address lines (or "[Recipient address]"). Right: "Client", "[Patient name]" in bold, then per shown detail its label (`#52525B`) and "[{label}]" in bold with `overflow-wrap: anywhere`.
    - Footer, with a 2 px `#0369A1` top rule: "Services, dates and totals appear here."

    Under the paper (13 muted): "Details that are off stay in Kineō and don't print."

  - **Delete** (existing types only), under the caption: the text button "Delete funding type".
    - When `fundingTypeUsage > 0`, it is disabled, with `aria-describedby` pointing to the 13 px muted "Used by {n} patient(s). Move them to another type first." ("1 patient" / "2 patients").
    - Otherwise it opens a dialog: title "Delete {name}?", body "Ended fundings of this type are hidden from patients. Invoices already made keep their details.", buttons "Cancel" (text) and "Delete funding type" (primary, error colour). On delete, go to the list and toast "Funding type deleted".
  - **Save:** run `fundingTypeErrors`; show each under its field (error colour, alert icon, `aria-describedby`, `aria-invalid`); focus the first. Otherwise `saveFundingType`, then go to the list with the toast "Funding type saved". A new type from `?preset=` starts from `presetDraft(key, crypto.randomUUID)`; an unknown key starts blank.
  - In `apps/desktop/src/router.tsx`, add both routes.

  **Tests.** Create `apps/desktop/src/screens/FundingTypeEditor.test.tsx`:
  - The preset `autism-funding` pre-fills all fields.
  - The preview shows "[Billing number]".
  - Switching Show off removes it from the preview and the switch's `aria-checked` flips.
  - "Add detail" focuses the new row.
  - A blank name shows "Add a name for this funding type." and focuses it.
  - Duplicate labels show "Two details can't have the same name."
  - Save toasts.
  - Delete is disabled with "Used by 1 patient. Move them to another type first." for Autism Funding, and enabled for ICBC.

  **Files:** `screens/FundingTypeEditor.tsx`, `screens/FundingTypeEditor.test.tsx`, `router.tsx`.

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`. Dev check in light and dark: the paper stays white in dark.

- [ ] **F20. Desktop: patient Billing section and funding dialog**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F18
  **Board:** DesktopPatientBilling

  **Desktop.**
  - In `apps/desktop/src/screens/Patient.tsx`, add a **Billing** section at the top of the right column, above Visits (gap 8):
    - h2 "Billing" (15/600 muted).
    - A card (padding 16/20, gap 10). Per active funding:
      - a row with `FundingChip` and, on the right, the text buttons "Edit" and "End funding";
      - a 15 px line: "{label} " plus the bold value (tabular, `overflow-wrap: anywhere`);
      - a 14 px muted line: `[period, \`invoices go to ${recipientName}\`].filter(Boolean).join(" · ")`, with the first letter upper-cased when there is no period ("Invoices go to …").
    - With no active funding: a Self-pay chip and the 14 px muted line "Invoices go to {patient}."
    - Ended fundings: as on phone (F13).
    - Footer row, after a top border: on the left (14 muted), "No other funding. Self-pay applies if this one ends." with exactly one active funding, "You pick who to bill on each invoice." with two or more, and nothing with none. On the right, an "Add funding" text button with a plus icon.
    - "End funding" calls `endPatientFunding` and toasts "Funding ended" with Undo.
  - Create `apps/desktop/src/components/FundingDialog.tsx`: `export function FundingDialog({ patient, funding, onClose }: { patient: Patient; funding: PatientFunding | null; onClose: () => void })`.
    - HeroUI Modal, or `role="dialog" aria-modal="true" aria-labelledby`. Width 520, radius 16, padding 24, gap 16, with the scrim from tokens. It traps focus, closes on Escape, and returns focus to the button that opened it.
    - Title (20/700): "Add funding for {name}" / "Edit funding for {name}".
    - "Funding type" select (disabled on edit).
    - The detail fields (as F14, but 15 px inputs). "Period starts" / "Period ends" (hint "Optional", placeholder "e.g. 1 Apr 2026") in two columns with a 12 px gap.
    - A Bill to box (`inputFill`, radius 12, padding 12/14, 14 px): "Bill to" (placeholder colour), the recipient name, then the address lines joined with ", " followed by ". Change this in Settings." in the placeholder colour. With a recipient problem, instead show (error style): "{type} has no recipient yet. Add it in Settings before you send." and a link "Open Funding types" to `/settings/funding-types/{typeId}`.
    - With no types: the paragraph "You haven't made any funding types yet." and the link "Open Funding types" (to `/settings/funding-types`), with only Cancel.
    - Footer, right-aligned with gap 8: text "Cancel", primary "Save funding" ("Saving…").
    - Validation and toasts as F14 ("Funding added" / "Funding saved").

  **Tests.**
  - In `apps/desktop/src/screens/Patient.test.tsx`: the Billing section for the funded and self-pay demo patients; End funding toasts with Undo; the footer copy for one funding.
  - Create `apps/desktop/src/components/FundingDialog.test.tsx`: the add flow; missing value error and focus; edit pre-fill; the recipient problem link; Escape closes and returns focus.

  **Files:** `screens/Patient.tsx`, `screens/Patient.test.tsx`, `components/FundingDialog.tsx`, `components/FundingDialog.test.tsx`.

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`. Dev check in light and dark, including keyboard-only use of the dialog.

- [ ] **F21. Desktop invoice editor: Bill to, Change and dated lines**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F8, F20
  **Board:** DesktopInvoiceFunded, DesktopBillTo states 1–4 and 6

  **Desktop.**
  - Create `apps/desktop/src/components/BillToCard.tsx`: `export function BillToCard({ invoice, patient, problems }: { invoice: Invoice; patient: Patient; problems: BillToProblem[] })`. It is rendered as the first section of the editor's left column, with h2 "Bill to" (15/600 muted) and a card (padding 16, gap 10).
    - **Funded:** a row with `FundingChip` and a "Change" text button. Then the recipient name (600, `overflow-wrap: anywhere`). Then per detail: an input labelled "{label}" (hint "Required"), 15 px tabular, saving on blur with `setBillToDetail`, dates parsed as F15.
    - **Self-pay:** as F15 (chip, name, the "No address yet. A name is enough, an address is optional." copy, "Add address" / "Edit address", inline "Address" with "Save address" / "Cancel", toast "Address saved"). "Change" shows only when the patient has an active funding.
    - **Change** opens a popover anchored to the button (HeroUI Popover). It holds `role="radiogroup" aria-label="Bill to"` with native `<input type="radio">` (18 px, `accent-color: primaryStrong`) inside `<label>` rows (min height 44, radius 12, padding 10/12). The selected row has the `tint` background and `textOnTint` text. The rows are `billToOptions`: bold title, then a 14 px muted detail. The popover closes on choosing or Escape; focus returns to Change.
    - **Errors:** inline under the matching detail input (14 px, error colour, 16 px alert icon, `aria-describedby`, `aria-invalid="true"`), shown whenever the problem exists on the draft. A recipient problem shows `role="alert"` with the F7 message and a link "Open Funding types" (600, 14 px, 44 px target) to `/settings/funding-types/{typeId}`. Find `typeId` through the funding.
  - In `apps/desktop/src/screens/Invoice.tsx`:
    - Render `BillToCard` first in the left column.
    - Call `sendProblems({ ..., billing: { billTo: resolvedBillTo(invoice, patient), lines, visitDates } })`; the existing alert under the preview lists them and Send stays disabled.
    - For a problem with a `target`, the alert item gets a text button: "Fill in {sentenceLabel(label)}" for a detail (it focuses that input), "Pick the dates" for a line date (it focuses that line's select), or none for recipient (the card's link covers it).
    - On a funded draft, each line row gets a native select before the name (`aria-label="Visit date for {line name}"`, options "Pick a date" (empty) plus each visit date as "4 Nov"), calling `setLineServiceDate`.
    - The live preview gets the new template output automatically (F8).

  **Tests.**
  - In `apps/desktop/src/screens/Invoice.test.tsx`: the funded draft card; clearing "Billing number" shows "Add the billing number before sending." under it and in the alert, "Fill in billing number" focuses the input, and Send invoice is disabled; Change lists the options and switches to Self-pay; the line date select; the recipient alert and link.
  - In `apps/desktop/src/screens/InvoiceSend.test.tsx`: a complete funded draft sends.

  **Files:** `components/BillToCard.tsx`, `screens/Invoice.tsx`, `screens/Invoice.test.tsx`, `screens/InvoiceSend.test.tsx`.

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`. Dev check in light and dark; Download PDF of a funded draft shows Bill to, Client and dated rows.

- [ ] **F22. Desktop invoice detail: locked Bill to**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F21
  **Board:** DesktopBillTo state 5

  **Desktop.** In `apps/desktop/src/screens/InvoiceDetail.tsx`, add a "Bill to" section (h2 15/600 muted, card padding 16, gap 10) to the details column:
  - A row with `FundingChip` (funded) or the Self-pay chip, and the invoice's `StatusTag` on the right.
  - The name (600, wraps).
  - Funded only: `billToSummary` (14 muted).
  - A 14 px muted line with a 16 px lock icon: "Locked once sent. Later changes to the funding don't alter this invoice."

  It is shown for sent, paid and cancelled invoices. There is no Change and no inputs.

  **Tests.** Create `apps/desktop/src/screens/InvoiceDetail.test.tsx`, or extend the existing detail tests: a sent funded invoice shows "Client Maya Okafor · Billing number 4821" (made-up demo values), the locked line and no "Change"; the snapshot stays as it was after the funding type is renamed (`saveFundingType` in the demo store, then re-render).

  **Files:** `screens/InvoiceDetail.tsx` and its test.

  **Verification:** `pnpm --filter @kineo/desktop test`; `pnpm check`.

- [ ] **F23. Docs: record the decisions and close the phase**

  **Target model:** `[Sonnet 5.5 Medium]`
  **Depends on:** F1–F22
  **Board:** none

  **Docs.**
  - `docs/funding-info.md`:
    - §3: replace the Patient funding bullets with decision 1.
    - Add "Lines on a funded invoice each carry a visit date" (decision 2).
    - §4 Pending: mark 1 as answered (approved 13 November 2026, with the measured ratios from decision 3, including the focus ring correction 3.94:1), and mark 2–9 as "Not built; see Discovered".
    - Remove "PENDING" from items that are now settled.
  - `CLAUDE.md`:
    - Domain rules → Funding: replace "planned, not built yet … Don't build or break it down" with a short built rule. Funding types are desktop only. A patient funding holds values and a period. An invoice snapshots Bill to at creation, refreshes it while a draft, and locks it once sent. Funded lines need a visit date. Sending is blocked on a missing recipient, shown detail or line date.
    - Palette: add `inputEdge` #878791 / #6B7684 as the input border and switch off track.
  - `docs/design-brief.md`: add the funding chip (outlined grey, icon and word, never tinted) and the input edge to Visual style.
  - `docs/tasks.md`:
    - Under **Discovered → Later**, add the deferred items: separate Required switch; identifier mandatory per type; fractional hours; registration number and session length on self-pay invoices; child as patient with a guardian contact; rate warnings; Home deadline cue; GST/HST treatment; WorkSafeBC and ICBC recipient addresses and field lists; CYDB recipient name.
    - Tick nothing here: each ticket ticks itself.

  **Files:** `docs/funding-info.md`, `CLAUDE.md`, `docs/design-brief.md`, `docs/tasks.md`.

  **Verification:** `pnpm format:check`.

---

## Model split

21 of 23 tickets are `[Sonnet 5.5 Medium]` (91 %). `[Opus Medium]`: F2 (ordered send checks inside the shared status trigger) and F3 (RPC overload plus TypeScript and Rust uploader parity). F1 and F4 must be committed together, because the schema test compares them.
