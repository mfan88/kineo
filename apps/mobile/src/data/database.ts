import { buildAppSchema } from "@kineo/data";
import { column, PowerSyncDatabase, Schema, Table } from "@powersync/react-native";

/**
 * Who owns the rows written before sign-in exists on the phone (Phase 3, M16): a
 * fixed made-up owner, in its own database file. Sign-in replaces both with the
 * Clerk user ID and a database per user, and this file is then deleted; nothing in
 * it ever syncs.
 */
export const LOCAL_OWNER_ID = "local-device";
const LOCAL_DATABASE_FILE = "kineo-local.db";

/** The app's schema, built with the phone's own PowerSync (see docs/tech-stack.md). */
const schema = buildAppSchema<typeof column.text | typeof column.integer, Table, Schema>({
  column,
  Table,
  Schema,
});

/**
 * The phone's local database: an SQLite file in the app's own storage, opened with
 * op-sqlite by PowerSync. See "Phone local database" in docs/tech-stack.md.
 */
export function createDatabase(): PowerSyncDatabase {
  return new PowerSyncDatabase({ schema, database: { dbFilename: LOCAL_DATABASE_FILE } });
}
