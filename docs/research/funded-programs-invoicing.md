# Report: invoices for funded and insured patients (BC)

Research from Mobbin and Firecrawl (13 November 2026). Part 1 looks at how invoicing and health apps handle per-patient reference details. Part 2 covers what BC funders require on a physiotherapy invoice. Part 3 puts them together as suggestions for Kineō's current workflow.

**Nothing here is built or decided.** Every suggestion needs an OK first, because it touches the schema and the domain rules in `CLAUDE.md`.

---

## 1. How apps handle per-patient funding and insurance details

**Gap:** Mobbin has no practice-management tools (Jane, Cliniko, SimplePractice), the same gap noted in [`notes-and-invoicing-workflows.md`](notes-and-invoicing-workflows.md). It does show two things separately: how invoicing tools attach arbitrary reference details to an invoice, and how health apps collect a person's coverage details. Together they cover most of what Kineō needs.

### Invoicing tools: reference details are free-form label + value pairs

| App              | What it does                                                                                                                                                                                                 | Link                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Stripe           | "Additional options" has a **Custom fields** checkbox. You add a name and a value (e.g. Order No. 018) and the PDF preview on the right shows it in the header block. Also optional Memo, Footer and Tax ID. | [screen](https://mobbin.com/screens/af7b8bbe-ca12-496f-a485-aef31b06bf9d)         |
| Revolut Business | Invoice template with a **Custom fields** list (Field name, Field value, Add Field) and toggles for logo and VAT number. Template-level, so set once and reused.                                             | [screen](https://mobbin.com/screens/7db67dad-4657-41e0-99ab-ca2e684a72f7)         |
| Jobber           | Invoice header has "Add Custom Field" beside Issued date and Payment due.                                                                                                                                    | [screen](https://mobbin.com/screens/4e57080e-c1f0-4d91-9f19-fbfb58b5644a)         |
| Mercury          | "PO number (optional)" sits next to Invoice number, with a live invoice preview beside the form.                                                                                                             | [flow](https://mobbin.com/flows/ef4623ce-bc68-4006-9c98-f720a4546769?tab=screens) |
| Toggl Track      | "Purchase order" line in the invoice header, "Add payment terms" beneath.                                                                                                                                    | [screen](https://mobbin.com/screens/2af72c41-f4cd-4f2a-aeab-a88fb37e83e3)         |
| OpenAI Platform  | Billing preferences: a PO number saved once and shown on **future** invoices only. A past invoice has to be reissued.                                                                                        | [screen](https://mobbin.com/screens/be2353a2-2bab-47bb-9c56-a093a60bba99)         |
| QuickBooks       | Business-level header toggles: "Company registration number", "GST Registration No.", each with a tick to show it.                                                                                           | [screen](https://mobbin.com/screens/44e8ebbe-ed26-4a82-9c0d-980fbeb7e5fd)         |
| Square           | A "Customization" screen renames what the invoice calls things (Services, Recipient, Service date, Deposit).                                                                                                 | [screen](https://mobbin.com/screens/d12bb3f9-3398-495a-bc5e-4f6e69c7c9cf)         |

What this means:

1. **None of them hard-code a funder.** Stripe, Revolut and Jobber use label + value pairs, so the same feature covers a PO number, a claim number or a billing number. This matters here because BC is changing the labels (see Part 2).
2. **Two levels.** Business-wide identifiers (QuickBooks, Revolut's VAT number) are set once with a "show" tick. Per-customer or per-invoice references (Stripe, Jobber, Mercury) are entered where the invoice is made. That matches Kineō's split between profile fields and per-patient details.
3. **A live preview** shows where the value lands (Stripe, Mercury). Kineō already has an invoice preview.
4. **Copy at the time of use.** OpenAI's PO number applies to future invoices only, which is the same idea as Kineō's rule that a line copies name and price when added.

### Health apps: coverage details are optional, deferrable and escapable

| App              | Pattern                                                                                                                                                                                              | Link                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zocdoc (iOS)     | A "Medical insurance" screen with Plan name, Member ID, an optional card photo, Save, and a quiet text button "Remove insurance".                                                                    | [screen](https://mobbin.com/screens/107b3613-ea36-4a79-8afa-b24a67508c98)                                                                             |
| Headspace (web)  | Step 1: "Who is your insurance provider?" with search and an escape row "I'm paying out of pocket instead". Step 2: name, date of birth, Member ID (optional). The note says you can enter it later. | [step 1](https://mobbin.com/screens/d348b177-4563-4935-b18b-62590de55f15) · [step 2](https://mobbin.com/screens/880f672a-fbc0-4ee3-8205-cc4354fb8da5) |
| CVS Health (iOS) | "Add new insurance" with front and back card photos, then Next, "Skip for now" and "Exit to visit checklist".                                                                                        | [screen](https://mobbin.com/screens/50cd57aa-99bd-49b5-a80f-7a1e50474c2c)                                                                             |
| Lloyds (iOS)     | "Extra details" in a separate card: amount and policy number, both marked optional.                                                                                                                  | [screen](https://mobbin.com/screens/ce8b20d9-e29c-4086-aef8-a581e9fbbc5d)                                                                             |

What this means:

1. **The common case is the default.** Headspace's "paying out of pocket instead" is the equivalent of Kineō's private patient. Most patients need nothing extra.
2. **Every field is optional until it is needed.** Nothing blocks the visit or the note. Missing details only matter at the point of billing.
3. **Removal is a text button**, not a prominent action (Zocdoc).

---

## 2. BC programs that apply to physiotherapy

Sources are official BC and WorkSafeBC pages read on 13 November 2026, plus a Down Syndrome Resource Foundation notice about how a BC provider uses Jane for funder billing. I could not confirm everything; the gaps are listed at the end.

### Autism Funding (what you called ADP) is ending

- The programs are Autism Funding: Under Age 6 and Ages 6–18, run by the Ministry of Children and Family Development. I did not find a program called "Autism Development Program" on the official pages, so I assume Autism Funding is what you meant.
- **It ends 31 March 2027.** It is replaced by the **BC Children and Youth Disability Benefit (CYDB)**. The provider page was updated on 3 September 2026 and already covers both. [Information for service providers](https://www2.gov.bc.ca/gov/content/health/managing-your-health/child-behaviour-development/support-needs/pairs/autism-spectrum-disorder-service-providers)
- **Physiotherapy is eligible.** Under-6 families must pick providers from the Registry of Autism Service Providers (RASP), which lists physical therapists. A physio needs full College of Health and Care Professionals registration, at least one year of experience with three or more autistic children under six, and autism-related professional development from the last two years. The CYDB operational policy (August 2026) also lists "Registered Physiotherapist" as an eligible professional.
- **Families hire the provider, and the government pays the provider directly.** The provider is paid after delivering the service.

**Flow before invoicing**

1. The family and provider complete a Request to Pay (Autism Funding) or a Request for Services (CYDB). It sets a maximum hourly or daily rate and a maximum amount per funding period.
2. Once approved, the provider receives a **billing number** (Autism Funding) or an **authorization number** (CYDB). A new one is issued **each funding period**.
3. Services should start only after the number arrives, otherwise the family may owe the cost.
4. The family can change approved rates or amounts during the period (Request to Amend).

**What an Autism Funding invoice must include** (official page and the [sample invoice](https://www2.gov.bc.ca/assets/gov/health/managing-your-health/autism/invoice_sample.pdf))

| Field                                                                                            | Notes                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Service provider: full name, mailing address, phone                                              |                                                                                                                                       |
| Payee: full name, mailing address, phone                                                         | Only if different from the provider                                                                                                   |
| Billing number                                                                                   | Required on all invoices; changes each funding period                                                                                 |
| Invoice number                                                                                   | At least 4 characters                                                                                                                 |
| Child's first and last name                                                                      |                                                                                                                                       |
| Service date (day, month, year), type of service, amount (hours or days), rate (per hour or day) | One row per service                                                                                                                   |
| Total cost                                                                                       | The sample also has GST/HST totals, a rate note "inclusive of PST if applicable", and signature lines for the provider and the parent |
| Bill to                                                                                          | Autism Funding Branch, Ministry of Children and Family Development, PO Box 9776 STN PROV GOVT, Victoria BC V8W 9S5                    |

**Rules**

- Invoice monthly, within six months of the service date.
- No future-dated services, no cancelled or missed appointments.
- Give the family a copy of every submitted invoice. The CYDB page encourages sharing invoices with families _before_ submission.
- Submit through the Service Provider Portal (BCeID), by mail or by email. Pay arrives by direct deposit, typically within 30 days.

**CYDB differences:** an authorization number instead of a billing number, the same monthly cadence and six-month limit, and a different mailbox (`cfd.disabilitybenefit@gov.bc.ca`). The CYDB policy says invoices go in once a month per provider, but I could not find a field list for CYDB invoices; the page points back to the same Sample Invoice. Treat the Autism Funding list as the working list.

### WorkSafeBC

- Physios need a **contract** with WorkSafeBC to bill. The guide covers an initial assessment (one visit and report), a treatment period of 15 visits or 6 weeks, and extensions.
- Fee code **19102** is billed per visit (one visit per day per claim), and 19103 is the extension request report. The date on the invoice is tied to the date on the matching report.
- Bill within **90 days** of the date of service. A rejected invoice can be corrected within 180 days of service or 90 days of the first rejection.
- Bill **electronically** where possible. Paper goes on Form 267, only when the worker has no BC Personal Health Number.
- The field list on the official page I could read is the hospital one: worker's name, gender, date of birth, **Personal Health Number**, **date of injury**, diagnostic code, side of body, body part code, nature of injury code, service location, date of service, payee number, practitioner number, fee code, billed amount and invoice totals. The physio guide refers to the same worker, claim and injury codes and the MSP payee number. [Billing guide](https://www.worksafebc.com/~/media/2DE6FD3941FC414FAC020AB0849EDDFE.ashx?dt=202212071004) (a 2022 document) · [Invoice information](https://www.worksafebc.com/en/health-care-providers/provider-types/hospitals/reports-invoices)
- A claim has to be accepted before treatment is payable. The claim number is the key identifier.

### ICBC

- Direct billing needs ICBC approval and a valid ICBC account. The page states each invoice "must accurately identify the Customer and the individuals that provided the Services". Invoicing happens in ICBC's Care Provider Invoicing and Reporting App against pre-approved sessions, using the claim number. I did not confirm the full field list. [Terms](https://icbc.com/policies/health-care-direct-billing-terms)

### What I could not confirm

- Field lists for **Children and Youth with Support Needs / At Home Program** respite and other lines, **Jordan's Principle**, **NIHB**, **Veterans Affairs** and **MSP supplementary benefits**. The automated research job was still running when I wrote this, so none of these are included. The Jane notice shows a BC provider billing At Home, Autism Funding, Jordan's Principle, Variety, CKNW and CLBC funders; each is a separate funder with its own reference.
- Whether physio services on these invoices are GST-exempt. The sample has a GST line; I did not verify tax treatment.

### How a BC provider's practice software copes

The Down Syndrome Resource Foundation notice shows the real pattern: for clients with a funding source the services are "directly billed to your funding source", a card on file covers no-shows and late cancellations (which funders won't pay), and private clients get a receipt "with the necessary details for reimbursement through extended health". [Notice](https://dsrf.org/about-us/news-and-updates/jane-app-billing/)

---

## 3. Fitting this into Kineō's current workflow

### What already fits

| Funder requirement                  | Kineō today                                             |
| ----------------------------------- | ------------------------------------------------------- |
| Provider name, address, phone       | Profile fields with "show on invoice" and the send gate |
| Invoice number of 4+ characters     | Numbers are padded to four digits (`INV-0004`)          |
| One invoice per month for one child | One invoice covers several visits for one patient       |
| Dates, service type, rate           | Visits and price-list lines copied onto the invoice     |
| Provide a copy to the family        | Download PDF and share                                  |
| Locked after sending                | Sent and paid invoices are locked                       |
| Missed appointments not billable    | Kineō has no cancellations to bill                      |

### What is missing

1. **A per-patient funder reference.** A billing or authorization number that changes each funding period, or a WorkSafeBC claim number with date of injury.
2. **Practitioner identifiers.** College registration, MSP payee number, WorkSafeBC practitioner number. Profile has five fixed fields today.
3. **Who the invoice is for.** Today the invoice is billed to the patient. Funded invoices are billed to a funder, and the child is only a named client.
4. **Hours and an hourly rate.** Lines are whole-number quantities. Funders authorize a maximum hourly rate and ask for hours.
5. **A service date on each line.** Autism Funding wants one row per service date.
6. **A deadline cue.** Six months (Autism Funding, CYDB) and 90 days (WorkSafeBC).

### Suggested approach

**1. Generic labelled references, not funder-specific screens.** Follow Stripe and Revolut: a patient can have a few "Billing details", each a label and a value. Offer starting labels as suggestions only (Billing number, Authorization number, Claim number, Date of injury). This is the key design choice, because BC is replacing "billing number" with "authorization number" in under five months. Hard-coding either would be stale by April 2027.

- Entered on the patient screen, with a text button "Add billing detail". Optional, never blocks a note or visit (Headspace, Zocdoc).
- Private patients see nothing extra (the Headspace "out of pocket" default).

**2. Copy onto the invoice when it is created.** This matches the existing line-item rule and OpenAI's "future invoices only". A new funding period means a new number on the patient without changing sent invoices. Draft invoices can still be edited; sent invoices stay locked.

**3. Reuse the send gate.** A reference marked "show on invoice" and left empty blocks sending, with a message that names it: "Add the billing number before sending." This is the same pattern as profile fields.

**4. Practitioner identifiers as optional profile fields.** Add a small number of optional profile fields (College registration number, MSP payee number, GST number) with the same "show on invoice" flag, following QuickBooks' header toggles. Keep them out of the settings screen's main view until used.

**5. Optional "Bill to" on the invoice.** Default is the patient. A funder is a name and address block saved once in settings (e.g. the Autism Funding Branch address) and picked per patient. The patient remains the named client on the invoice.

**6. Hours and dates.** Two options: (a) keep whole-number quantity and set up price-list items by session length ("Physiotherapy, 60 min"), or (b) allow fractional hours. (a) needs no schema change and works for most sessions. Show each visit date beside its line on funded invoices.

**7. Soft guardrails, not rules.** Optionally record the authorized maximum hourly rate and period maximum next to the billing number. Show a gentle warning when an invoice goes over, never a block (the funder will reject it, and the practitioner may know of an approved change).

**8. Deadline cue on Home.** "Ready to invoice (N visits)" could add the age of the oldest unbilled visit once it passes a threshold. This is the smallest piece and can wait.

### How this fits the rules in `CLAUDE.md`

- **"Kineō never submits insurance claims."** It still holds. Kineō produces the invoice; the practitioner submits it. This is an invoice carrying extra details, not claim submission.
- **"Patients handle payment and insurance themselves."** Funded patients are the exception. The wording in the docs would need a small change, because the funder pays the practitioner directly.
- **"Do not add: extra menus, dashboards or features not in the brief."** These suggestions go beyond the brief, so this needs your decision. The smallest version is items 1–3, which add one optional block on the patient and one line on the invoice.
- **Invoice rules:** one patient per invoice, locked once sent, tax optional, copy-at-creation, and no note text on invoices all stay unchanged.
- **Privacy:** a billing number or claim number is health-related, so it falls under the existing rule of never logging patient details. Any test data stays made up.
- **Phone:** entering references fits the phone patient screen. Funder and invoice style choices stay desktop only.

### Suggested order, if you want to proceed

1. Decide the scope: items 1–3 only, or more.
2. Schema change (new table or column for patient references, copied to the invoice) with RLS and tests.
3. Shared rules and tests in `packages/shared`.
4. Patient screen, invoice preview, send gate on desktop, then phone.
5. Optional later: items 4–8.

### Questions for you

1. Which funders do you actually bill today? That decides whether WorkSafeBC and ICBC are worth supporting or only Autism Funding and CYDB.
2. Is the patient on the invoice the child, with a parent as the contact? Today a patient is one name.
3. Are you in the RASP or under contract with WorkSafeBC? The program rules apply to your registration, not to the app.
4. Should I add the first step to **Discovered** in `docs/tasks.md`?
