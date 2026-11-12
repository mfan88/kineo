# Workflow report: importing patients from another system

Research from Mobbin (November 2026) on how apps let people bring existing clients or contacts in from files, other apps and phone contacts, compared for Kineō's case: a solo physiotherapist moving their patient list over from a previous system, a spreadsheet or their phone.

## Summary

- **Best option for Kineō:** a desktop "Import patients" flow that takes a **CSV file or pasted text**, matches the name column automatically, shows a preview with duplicates skipped, and adds everyone in one step, with Undo.
- It suits Kineō because a patient record is tiny: just a full name (required) and a reason for visit (optional). Most of what makes CRM imports long (mapping 10+ columns, data-format rules) can be cut.
- Parse the file **on the device**. Nothing needs uploading raw, which keeps patient details off any server until they're real records under row-level security.
- Import **patients only** for now. Old notes and invoices stay in the old system, which the practitioner keeps anyway for records retention.
- **Later, optional:** picking patients from phone contacts on the phone app. Skip direct connections to other practice software.

---

## 1. Examples found

### Fresha (web) · salon and clinic booking, closest in domain

- [Importing clients](https://mobbin.com/flows/013f8be3-7f9c-4707-9917-f23bed03afa0?tab=screens)
- Clients list → Options → Import. Upload a CSV, then **"Review column matching"**: Fresha's fields on the left, a dropdown of your file's columns on the right, already filled in where names match. "First name… Required for import" is the only required field.
- Ends on "Import successful! 1 client has been added to your client list" with Done.
- **Good:** auto-matched columns, one required field, plain language. **Weak:** a full-page success screen for what could be a toast; no preview of the rows before importing.

### Square (web) · small-business customer directory

- [Importing customers (1)](https://mobbin.com/flows/c061d68f-aa05-4be1-88c3-46adc5e55dec?tab=screens) · [Importing customers (2)](https://mobbin.com/flows/fc99d96e-c9c1-4f59-8b95-ecac34ddafa0?tab=screens)
- Four steps: Download template → **Check your data format** (dates, phone numbers, addresses, each with a rule) → Select file → Assign fields.
- Errors are handled well: "10 customers were not imported", the reason ("Phone number not formatted as…"), the rows affected, **Download error file** and **Import again**. A summary shows Imported 0 · Failed 10 with "Fix and reimport".
- Imported customers land in a group named after the import time, so a batch can be found and removed.
- Also offers **Import customers** right in the empty state: "No customers yet" with Import customers beside Create customer.
- **Good:** empty-state entry point, error file, batch group. **Weak:** the format-rules step is reading before doing; most of it doesn't apply when there are few fields.

### Shopify (web) · customer list

- [Importing customers](https://mobbin.com/flows/97188b3c-142c-4e83-afc3-66385267f00a?tab=screens)
- One dialog: choose file, **"Overwrite existing customers that have the same email or phone"**, add a tag to everyone imported, "Download a sample CSV". Progress bar; "You can close this dialog box… we will email you once the import finishes."
- Opens a segment "Imported on July 6 2026 at 3:13 PM" showing exactly who was added.
- **Good:** everything on one screen, a clear duplicate rule, a view of just the imported batch. **Weak:** no column mapping, so the file must match their template.

### Attio (web) · CRM

- [Importing a CSV](https://mobbin.com/flows/2c5ec636-6d46-416e-b798-ae09d51881c3?tab=screens)
- Four numbered steps in a header: Upload file → **Map columns** (your column → attribute, with a live "Data preview" of the first values) → Review values → **Preview import** ("3 will be created · 0 will be updated") → Start import, with a confirmation.
- **Good:** the created/updated counts before committing, and the data preview beside the mapping. **Weak:** four steps and a confirm dialog are heavy for a list of names.

### Apollo (web) · sales CRM

- [Importing contacts](https://mobbin.com/flows/2eb0884f-5123-4de0-8f77-af07565397b0?tab=screens)
- Column mapping as a horizontal table with "6 recognized · 2 need mapping" badges and a "Hide recognised columns" option, plus settings for what to do when a contact already exists.
- **Good:** only shows what needs attention. **Weak:** a dense screen with many settings.

### Quo (web) · business phone

- [Importing a CSV](https://mobbin.com/flows/39d0d522-6c67-4872-9d65-d3c5631d5069?tab=screens)
- Import lives in Settings → Contacts beside **Integrations** (Connect Google). Final step: "49 contacts will be created", a name for the import, and **"I confirm that I have obtained consent to communicate with each of these 49 contacts"**.
- **Good:** a count before committing; a named batch; a consent check. Kineō already has the practitioner–patient relationship, so a consent box isn't needed, but it shows how sensitive imported people data is treated.

### OpenPhone and Co-Star (iOS) · phone contacts

- [OpenPhone: Syncing device contacts](https://mobbin.com/flows/e1fd60ae-aba0-4cb8-8bd3-69c2b0d63f7d?tab=screens): "Sync device contacts" row, then a sheet: "Sync to device" (this phone only) or "Sync everywhere".
- [Co-Star: Contacts](https://mobbin.com/flows/04240599-fb28-4adc-94fc-710b1736d113?tab=screens): reads the whole address book and lists everyone with Add or Invite.
- [AllTrails: Contacts](https://mobbin.com/flows/ad4abedf-32b5-4724-b4e5-a1fd81aa903d?tab=screens): a "Sync phone contacts" switch with an explanation and "Remove synced contacts".
- **Good:** no file needed on a phone. **Weak for Kineō:** a practitioner's phone mixes patients with friends and family; syncing everything would pull personal contacts into a health app.

---

## 2. Options for Kineō

| Option                                    | Seen in                                   | Effort to build                      | Effort for the user                             | Fits Kineō because…                                                                                       | Risks                                                                                             |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A. CSV file with auto-matched columns** | Fresha, Square, Attio, Apollo             | Medium                               | Low: export from old system, pick file, confirm | Most practice software and every spreadsheet can save a CSV                                               | Needs a CSV parser (new dependency); Excel files must be saved as CSV first                       |
| **B. Paste a list**                       | (my suggestion; no direct Mobbin example) | Low                                  | Very low for short lists                        | Only one required field, so "one name per line" works; copy a column straight from Excel or Google Sheets | Less suited to two columns, though tab-separated paste handles it                                 |
| **C. Pick from phone contacts**           | OpenPhone, Co-Star, AllTrails             | Medium (new Expo module, permission) | Low on phone                                    | People who kept patients in their phone                                                                   | Mixes in personal contacts unless the user picks individuals; needs a permission prompt           |
| **D. Connect to the old system directly** | Quo (Google), none for practice software  | High (each vendor's API and sign-in) | Lowest                                          | —                                                                                                         | Per-vendor work, credentials, breakage when APIs change; not worth it for a solo-practitioner app |
| **E. "Send us your file" (done for you)** | —                                         | Process, not code                    | Lowest                                          | —                                                                                                         | Patient data leaves the practitioner's hands; conflicts with Kineō's privacy rules                |

### Why A and B together are the best fit

- **They cover where patients actually are.** A practice system's export (Jane, Cliniko and others can export a patient list as CSV), a spreadsheet, or a hand-typed list. Option B also covers people moving off paper: they type or paste names.
- **The mapping step almost disappears.** With only "Full name" and "Reason for visit", Kineō can auto-detect the name column (names like "Name", "Patient", "Full name", or "First name" + "Last name" joined), and ask only when it can't tell. That is Apollo's "only show what needs attention", taken further.
- **It stays local-first and private.** The file is read on the device; rows become patients through the same local write path as "New patient", then sync like any other change. No raw file sits on a server.
- **It's one shared flow.** Parsing, column detection, name clean-up and duplicate checks are pure logic for `packages/shared`, with tests; each app only draws the screens.

### Why not the others (yet)

- **C (phone contacts)** is worth adding later as a convenience on the phone, using the system contact picker so the practitioner chooses specific people rather than syncing the whole address book.
- **D and E** cost far more than they save for one practitioner moving once.

---

## 3. Suggested flow (desktop first)

Entry points, with no new menus:

- The Patients empty state: "No patients yet" with **New patient** and **Import patients** (as Square does).
- A quiet "Import patients" link on the Patients screen. (Phone: the same link opens a note pointing to the desktop app, as Invoice style does, until phone import exists.)

Steps, as one screen that grows rather than a four-step wizard:

1. **Add your list.** Drop or choose a CSV file, or paste names (one per line). A line explains: "Export your patient list from your old system as CSV, or paste names from a spreadsheet."
2. **Check the columns** (only if needed). "We'll use **Name** for Full name." If the file has First and Last name, join them. Optional: "Use **Notes** for Reason for visit?" Other columns are ignored, and the screen says so.
3. **Preview.** "**42 patients will be added.** 3 are already in Kineō and will be skipped. 1 row has no name and will be skipped." Then a short list of the first rows, with the skipped ones shown and why (Attio's counts plus Square's reasons).
4. **Import 42 patients** (the one primary button). Toast: "42 patients added" with **Undo**, which removes that batch while none of them have notes or invoices yet. Then go to Patients, filtered to the new batch for a moment (as Shopify and Square show the imported group).

Rules worth deciding before building:

- **Duplicates:** match on name after trimming spaces and ignoring case and accents; skip, never overwrite (Kineō has no email or phone to match on).
- **Size:** a solo practice is hundreds to a few thousand patients; import in one local transaction so it's all or nothing.
- **Encoding:** accept UTF-8 and common Excel exports; names like "Zoë" and "Nguyễn" must survive.
- **Privacy:** never log file contents or names, including in errors ("Row 12 has no name", not the row itself).
- **New dependency:** a CSV parser (for example Papa Parse) would need your approval; the alternative is a small hand-written parser in `packages/shared`, which is enough for quoted CSV but riskier with odd exports.

## 4. Possible storyboard additions

If you want to see it before building: one desktop frame (Patients empty state, the import screen with file or paste, preview counts, the "42 patients added" toast) and one phone frame (the empty state and the note pointing to desktop), in light and dark.
