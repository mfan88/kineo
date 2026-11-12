# Kineō desktop

Tauri 2 + React + HeroUI. Run everything from the repo root.

## Setup

1. **Rust 1.96 or newer** (PowerSync needs it): `rustup update stable`.
2. **Clerk key:** create `apps/desktop/.env.local` (git-ignored) with your Clerk publishable key:

   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
   ```

   Find it in the Clerk dashboard under **Configure → API keys**. It's a publishable key, meant for app code, but keep it out of git anyway. Never put Clerk's secret key (`sk_…`) here.

3. In the Clerk dashboard: **Native API** on (Configure → Native applications), and sign-in by **email verification code** and **password**. See "Desktop sign-in" in `docs/tech-stack.md`.

## Run

```bash
pnpm --filter @kineo/desktop dev
```
