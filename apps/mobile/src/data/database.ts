import { buildAppSchema } from "@kineo/data";
import { column, PowerSyncDatabase, Schema, Table } from "@powersync/react-native";

/** The app's schema, built with the phone's own PowerSync (see docs/tech-stack.md). */
const schema = buildAppSchema<typeof column.text | typeof column.integer, Table, Schema>({
  column,
  Table,
  Schema,
});

/**
 * The database file for one signed-in practitioner. Clerk user IDs are letters,
 * digits and "_", but anything else is replaced so the name is always a safe file name.
 */
export function databaseFileFor(userId: string): string {
  return `kineo-${userId.replace(/[^A-Za-z0-9_-]/g, "_")}.db`;
}

/**
 * A practitioner's local database: an SQLite file of their own in the app's storage,
 * opened with op-sqlite by PowerSync. See "Phone local database" in docs/tech-stack.md.
 */
export function createDatabase(userId: string): PowerSyncDatabase {
  return new PowerSyncDatabase({ schema, database: { dbFilename: databaseFileFor(userId) } });
}
