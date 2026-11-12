# Workflow report: visit notes and invoicing

Research from Mobbin (November 2026) on how mobile and desktop apps handle (1) writing session notes linked to a person and (2) creating, sending and tracking invoices. Each finding ends with what it means for Kineō.

Mobbin has few true practice-management EHRs (no Jane, Cliniko or SimplePractice). The closest clinical example is **Heidi** (AI medical scribe). For invoicing, the best matches are field-service and freelancer tools (**Jobber**, **Contra**, **PayPal**, **Stripe**, **Revolut Business**, **Fresha**), which share Kineō's job-then-bill shape.

The v2 storyboard built from this research is on a design canvas: [Kineō v2 storyboard](https://claude.ai/artifact/NsrUrTUR5PDWYH3b5jFh45) (private until shared from its Share menu). Its status tag colours are in `@kineo/tokens` as `statusTags`.

---

## 1. Session notes linked to a person

### Heidi (web): the session is the unit, the patient is its header

- [Creating a session](https://mobbin.com/flows/7492cf17-2235-47dc-96ee-975e7f4266e5?tab=screens) · [Creating a document](https://mobbin.com/flows/f8bd6f6d-d00d-4d16-b6cd-5e7bf0162c02?tab=screens) · [Patient context screen](https://mobbin.com/screens/5f8e7fe4-f221-4de7-9633-dc74ff84df4c)

How it works:

1. **New session** creates an untitled session immediately ("Add patient details" placeholder). No form first.
2. The patient name sits in the header; the date chip opens "Patient's past sessions" and lets you re-date the visit.
3. Tabs on the session: **Context** (carry-forward background, past sessions as attachments), **Note** (the written note, from a template), plus generated documents.
4. Left column lists sessions by Upcoming / Past. A banner reminds you to review the note before use.

What works: zero-friction start, previous context one tap away, editing timestamped by session.
What's too much for Kineō: templates, transcription, AI tasks, multiple outputs per session.

### Consumer health journaling (iOS): the note box itself

- [Flo: My notes](https://mobbin.com/screens/4fe041c3-33c5-47b7-9958-9f521084bc98) · [Lifesum: dated note](https://mobbin.com/screens/8b63cba7-ca55-48f6-943c-bc25b5ee988e) · [Alan: notes for your physiotherapist](https://mobbin.com/screens/d23d670e-0c7e-4143-b06f-538fa1b99a82) · [Yazio: note with quick tags](https://mobbin.com/screens/9e1771df-29cb-4bda-be8d-4d849ff133f9) · [Ahead: "Save and write notes" / "Just save"](https://mobbin.com/screens/a19554ab-ce82-47fd-b275-e01662401b28)

Patterns:

- Full-screen sheet, date as the title, one large text area, keyboard up on open, one Done button.
- Lifesum and Flo show the date at the top so the note is anchored to a day without a date field.
- Alan and Yazio add tappable chips (Injury, Sciatic pain…) above the text area for common entries.
- Ahead offers two exits: save only, or save and keep writing.

### Desktop research/meeting tools: list + detail

- [Maze: sessions list beside session detail](https://mobbin.com/screens/cf154926-259b-4f3c-ba75-2904515ba5bb) · [Kajabi: sessions as cards with a notes tab](https://mobbin.com/screens/1680974d-4690-4922-86a4-d8b2c206755b) · [Lyssna: past sessions with Completed tag](https://mobbin.com/screens/a4a36ca5-12d7-4a97-afec-e832fbea749f) · [Otter: notes feed by day](https://mobbin.com/screens/7aaab63d-a1c8-410a-ba9f-139d389df77e)

Patterns: a person (or project) owns a vertical list of dated sessions; each session card carries a status tag; selecting one shows the note to the right. Lyssna's "Session marked as completed" toast is the confirmation model.

### Comparison: notes

|                | Heidi (web)                               | Health journals (iOS)        | Maze / Kajabi (web)                        |
| -------------- | ----------------------------------------- | ---------------------------- | ------------------------------------------ |
| Entry point    | "New session" button, patient added after | Daily screen → note sheet    | Person/project → session                   |
| Link to person | Patient in session header                 | Implicit (it's your own app) | Session nested under person                |
| Past notes     | Date-chip dropdown + Context tab          | Calendar/day history         | Left list of sessions                      |
| Status         | Upcoming / Past                           | None                         | Tag per session (Completed, Not scheduled) |
| Save           | Autosave                                  | Done button                  | Autosave + toast                           |

---

## 2. Creating, sending and tracking invoices

### Jobber (iOS + web): bill from completed work — closest to Kineō

- iOS: [Creating an invoice](https://mobbin.com/flows/df8f88e7-78e4-4995-abd3-7720d8664daf?tab=screens) · [Sending an invoice](https://mobbin.com/flows/5a312970-1e30-45f5-92f1-3dc41eebdf9d?tab=screens)
- Web: [Creating an invoice](https://mobbin.com/flows/ff897ea4-f831-44e0-bd18-283d5b499aab?tab=screens)

Flow:

1. Create (FAB on iOS, Create menu on web) → **Invoice** → pick client.
2. Web: **"Select the jobs you want to invoice"**: a checklist of that client's uninvoiced jobs with amounts. This is exactly "pick visits for this patient".
3. Form: billed-to, issue date, payment terms, line items, subtotal/discount/tax/total, client message.
4. One primary **Review and Send** (secondary "Save" = draft).
5. Review shows the rendered invoice; **Send by email**.
6. Detail screen: status tag ("Awaiting Payment"), **Resend** and **Collect Payment**, "Invoice sent" toast.

### Contra (web): inline editor, preview, send

- [Sending an invoice](https://mobbin.com/flows/e3e881af-2158-4bbb-8a81-c1dfc35cf0f9?tab=screens)
- A single centred document you edit in place: client, due date, project, line rows (name · qty · rate · total), "Add an item", "Add inclusive tax", memo.
- Top right: Cancel · **Preview** · **Send now**. Preview has "Keep editing". Toast: "Invoice 24-002 was successfully sent".

### PayPal (web): form left, live preview right

- [Creating an invoice](https://mobbin.com/flows/12250cf7-9192-4d0f-bff7-3d61a7ce2ea0?tab=screens)
- Two columns: "Who are you billing?" / "What are they paying for?" on the left; on the right a live preview with tabs **Invoice PDF / Mobile / Email**.
- Notable: PayPal shows a warning that its invoices shouldn't include protected health information. A reminder for Kineō to keep clinical note text off invoices and emails.

### Stripe (web): delivery options + PDF preview + event log

- [Sending an invoice](https://mobbin.com/flows/baa5d966-eaef-4fa7-b515-2a4ccd9b6832?tab=screens)
- Left: delivery method, branding, optional fields. Right: tabs Invoice PDF / Email / Hosted page. "Draft saved 8 seconds ago" autosave note. After sending: toast plus an Events history ("draft finalised", "invoice sent").

### Revolut Business (iOS): invoices list grouped by state

- [Sending an invoice](https://mobbin.com/flows/27ab137d-4f85-4868-926e-e3239e2a1b22?tab=screens)
- List grouped **Drafts / Today / by date**, each row: client, number, amount, "Paid" or "Due in 9 days".
- Editor: invoice number (editable, auto-proposed `INV-8`), due date, collapsible items, subtotal/total, preview (eye) + **Send**.
- Detail: big amount, **Mark as paid** pill, status / number / due date card.

### Fresha (iOS): send a copy of a receipt

- [Sending an invoice to email](https://mobbin.com/flows/ce3e48ef-22b9-4398-bb8f-5c18adff8f98?tab=screens)
- Rendered invoice → **Send a copy** / **Download** → email prefilled → toast "Invoice has been sent to …". Very short, appointment-business oriented.

### Comparison: invoices

|              | Jobber                              | Contra              | PayPal              | Stripe              | Revolut           | Fresha         |
| ------------ | ----------------------------------- | ------------------- | ------------------- | ------------------- | ----------------- | -------------- |
| Start        | Create → client                     | Send Invoice button | Create invoice card | Invoices → New      | New invoice       | From sale      |
| Link to work | **Pick uninvoiced jobs**            | Pick project        | None                | None                | None              | Sale itself    |
| Editing      | Form sections                       | Inline document     | Form + live preview | Form + preview tabs | Collapsible items | None           |
| Preview      | Separate Review step                | Preview button      | Always visible      | Always visible      | Eye button        | Is the preview |
| Send         | Email                               | Email               | Email               | Email/auto          | Email/link        | Email copy     |
| After send   | Status tag, Resend, Collect payment | Toast               | Status              | Toast + event log   | Mark as paid      | Toast          |

---

## 3. Patterns worth taking

1. **Start fast, attach details later** (Heidi): opening a note should never be blocked by a form.
2. **Date as the note's title** (Lifesum, Flo): anchors the note without an extra field.
3. **Bill from a checklist of unbilled work** (Jobber web): the strongest match for "one invoice, several visits, one patient".
4. **One primary action that moves state forward** (Jobber "Review and Send", Contra "Send now"), with Save draft as secondary text.
5. **Preview before send** (PayPal, Stripe side-by-side on desktop; Jobber/Revolut separate step on phone).
6. **Status tags + grouped lists** (Revolut Drafts / Due / Paid; Jobber "Awaiting Payment").
7. **Toasts with the object named** ("Invoice 24-002 was successfully sent").
8. **Keep clinical text off invoices** (PayPal's PHI warning).

Patterns to skip for Kineō: AI transcription and templates (Heidi), salesperson/discount/contract fields (Jobber), branding inside the send flow (Stripe), multi-currency (Revolut), event logs (Stripe), sidebars and top bars (Jobber web, Stripe).

---

## 4. Suggested Kineō workflow

Most of this already matches what M11–M15 built; the list marks where references suggest a change or confirm a choice.

### Phone (Expo, bottom tabs)

**Note**

1. Home → "Who are you seeing?" search or recent patient → patient screen.
2. Large note box at the top, titled with today's date (Lifesum/Flo). Keyboard opens on tap; "Save note" primary; toast "Note saved".
3. Visit list below, each row with a status tag (Not invoiced / Draft / Sent / Paid), paid rows locked (Lyssna/Kajabi tags).
4. Optional later idea: a few quick chips for common phrases (Alan/Yazio). Only if you want it; not in the brief.

**Invoice**

1. Patient screen or Home "Ready to invoice" → **Create invoice** → checklist of this patient's uninvoiced visits, all ticked (Jobber web), then Continue.
2. Editor: visits, line items from price list, quantity stepper, tax toggle, totals (Revolut collapsible rows keep it short). Primary: **Preview and send**.
3. Preview screen from the shared template (Jobber Review) → **Share PDF** / **Mark as sent**.
4. Detail: status tag, amount, **Record payment** pill (Revolut "Mark as paid"); toast "Marked paid" with Undo.
5. Invoices tab: grouped Not sent yet / Waiting on payment / Paid (Revolut grouping).

### Desktop (Tauri, no sidebar)

**Note**: Home → patient → two-column patient page: note editor on the left (date title, autosave or Save note), visit history on the right with status tags (Maze list + detail, minus the chrome).

**Invoice**: Single editor page with the form on the left and a **live invoice preview on the right** (PayPal/Stripe), one primary **Preview and send** top-right of content (Contra), back arrow top-left. Uninvoiced visits appear as a ticked checklist at the top of the form. Send blocks show inline in the preview ("Add your phone number to send"), matching the existing domain rule.

### Shared logic (`packages/shared`)

- "Uninvoiced visits for patient" query, invoice state transitions and totals stay in shared code so both apps use the same checklist and blocks.
- Invoice email/PDF content: patient name, visit dates, line items, totals only. Never note text (PayPal PHI lesson).

---

## 5. Gaps in this research

- No physio-specific EHR (Jane, Cliniko) is on Mobbin, so clinical charting depth (SOAP structure, body charts) isn't represented.
- Heidi's mobile app wasn't in the results; phone note patterns come from consumer health apps.
