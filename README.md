# Kineō

**Simple notes and invoicing for solo physiotherapists.**

Kineō is a desktop and phone app that helps physiotherapists do the two jobs that eat the most time after a session: writing the visit note and sending the invoice. It's built to be calm and uncluttered. You open it, pick who you're seeing, write the note, and bill when you're ready.

> **Status: early beta.** Kineō is under active development and is not yet ready for real patient records. See [Privacy and patient data](#privacy-and-patient-data) before using it.

<!-- Add screenshots here, e.g. ![Home screen](docs/images/home.png) -->

---

## Why Kineō

Most clinic software is built for multi-practitioner clinics and comes with scheduling, insurance billing, reporting and dozens of settings. If you work on your own, that's a lot of software to get a note written. Kineō does less, on purpose:

- **One home screen.** Find a patient, write a note, see which invoices need attention. No menus to dig through.
- **Notes and invoices are separate.** Write the note now and invoice later, or bundle several visits into one invoice.
- **Your patients handle payment.** Kineō produces a clear invoice; patients pay you and claim from their insurer themselves. Marking an invoice paid is for your own records.

Kineō is being built for physiotherapists in **British Columbia, Canada** first.

## Features

### Visit notes

- Quick-tap chips for common findings ("Pain improving", "ROM improved", "Review in 1 week")
- Type or dictate freely
- Copy the last visit's note as a starting point
- Add to or replace any past visit's note
- Last visit summary at the top of every patient

### Invoicing

- Invoices built from your own price list (set once in Settings)
- One invoice can cover several visits
- Optional tax, off by default
- Preview the invoice exactly as the patient will receive it, then download as PDF or share
- Track every invoice: ready to invoice, not sent yet, waiting on payment, paid
- Mark invoices paid for your tax records, with undo

### Patients

- Live search and quick access to recent patients
- Add a new patient in seconds, straight into their first note

### Your profile and invoice style

- Name, title or certification, clinic, address and phone, each with a "show on invoice" toggle
- Customise your invoice's logo, colour, font, layout and footer (desktop app)

### Works offline

- Notes and invoices save on your device first and sync when you're back online

## Platforms

| Platform           | Status         |
| ------------------ | -------------- |
| iPhone and Android | In development |
| Mac and Windows    | In development |

## Built with

- **Phone app:** [Expo](https://expo.dev) and React Native, with [HeroUI Native](https://heroui.com)
- **Desktop app:** [Tauri](https://tauri.app) and React, with [HeroUI](https://heroui.com)
- **Sign-in:** [Clerk](https://clerk.com)
- **Database and API:** [Supabase](https://supabase.com) (Postgres)
- **Offline sync:** [PowerSync](https://www.powersync.com)
- **Language:** TypeScript throughout

## Project structure

```
apps/
  mobile/      Expo phone app
  desktop/     Tauri desktop app
packages/
  shared/      Types, invoice maths, validation and sync shared by both apps
supabase/      Database schema, security rules and migrations
docs/          Design brief and project documentation
```

## Getting started (developers)

> Setup instructions will be filled in as the project structure settles.

You'll need:

- Node.js (LTS) and a package manager
- For the phone app: the Expo toolchain, plus Xcode or Android Studio for simulators
- For the desktop app: Rust and the Tauri prerequisites for your OS
- A Supabase instance (local or hosted) and a Clerk application

```bash
# Clone the repository
git clone https://github.com/<your-username>/kineo.git
cd kineo

# Install dependencies
<install command>

# Copy the example environment file and fill in your keys
cp .env.example .env

# Run the phone app
<mobile dev command>

# Run the desktop app
<desktop dev command>
```

Never commit real keys. Only the public Supabase "anon" key and Clerk publishable key belong in the apps. The Supabase service role key must stay on the server.

## Privacy and patient data

Kineō is designed to store personal health information, so privacy is a core requirement, not an add-on.

- Each practitioner can only ever see their own patients, enforced by database-level security rules.
- Patient records are intended to be stored in Canada.
- Sign-in is handled by Clerk, which stores practitioner account details (name, email). Patient notes and invoices are never sent to Clerk.

**During the beta, please use made-up patient data only.** Before Kineō is used with real patients, practitioners are responsible for meeting their own obligations under BC's _Personal Information Protection Act_ (PIPA) and their regulatory College's record-keeping standards.

## Disclaimer

Kineō is a documentation and invoicing tool. It is not a medical device, does not provide clinical advice, and is not a substitute for professional judgement. It is not affiliated with or endorsed by any regulatory College or insurer.

## Roadmap

- [ ] Phase 1: closed beta on desktop and phone with test data
- [ ] PDF export and sharing
- [ ] Hosted backend in Canada for real patient data
- [ ] Data export and account deletion
- [ ] Support for other provinces

## Contributing

Kineō is in early development and isn't accepting outside code contributions yet. Bug reports and suggestions are welcome. Please [open an issue](../../issues).

## Security

If you find a security problem, **please don't open a public issue.** Email <security contact email> instead and you'll get a reply as soon as possible.

## License

<License name>. See [LICENSE](LICENSE) for details.
