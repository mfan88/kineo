import { AppSchema } from "@kineo/data";
import { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { appDataDir } from "@tauri-apps/api/path";

/**
 * The local database: an SQLite file in the app's data folder (created at startup
 * by src-tauri/src/lib.rs), owned by PowerSync's Rust side. See "Desktop local
 * database" in docs/tech-stack.md. Sync is connected from Rust (D6).
 */
export function createDatabase(): PowerSyncTauriDatabase {
  return new PowerSyncTauriDatabase({
    schema: AppSchema,
    database: { dbFilename: "kineo.db", dbLocationAsync: appDataDir },
  });
}
