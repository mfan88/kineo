# Kineō desktop

Tauri 2 + React + HeroUI. Run everything from the repo root.

## Setup

1. **Rust 1.96 or newer** (PowerSync needs it): `rustup update stable`.
2. **Clerk key:** create `apps/desktop/.env.local` (git-ignored) with your Clerk publishable key:

   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
   ```

   Find it in the Clerk dashboard under **Configure → API keys**. It's a publishable key, meant for app code, but keep it out of git anyway. Never put Clerk's secret key (`sk_…`) here.

3. In the Clerk dashboard: the settings in "Clerk dashboard settings" in `docs/tech-stack.md` (Native API, email code and password, open sign-up with legal consent, Google, and `kineo://sso-callback` as a native redirect URL). "Continue with Google" needs a bundled build to come back to the app (`pnpm tauri build --debug --bundles app`); `tauri dev` can't receive the link on macOS.

## Run

```bash
pnpm --filter @kineo/desktop dev
```
