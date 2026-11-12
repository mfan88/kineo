/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key (pk_test_… or pk_live_…), from apps/desktop/.env.local. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
