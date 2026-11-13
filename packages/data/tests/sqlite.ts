import { queryResultFromMapped } from "@powersync/common";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { AppSchema, type WritableDatabase, type WriteContext } from "../src";

/** SQL parameters as node:sqlite takes them; anything else is a mistake in the test. */
function sqlValues(values: unknown[] = []): SQLInputValue[] {
  return values.map((value) => {
    if (value === null || typeof value === "string" || typeof value === "number") return value;
    throw new Error(`Unsupported SQL parameter: ${typeof value}`);
  });
}

/**
 * A real SQLite database (Node's built-in) with the eight tables from AppSchema,
 * standing in for PowerSync's local database, whose tables look the same to SQL.
 */
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const table of AppSchema.tables) {
    const columns = table.columns.map((column) => `${column.name} ${column.type}`).join(", ");
    sqlite.exec(`CREATE TABLE ${table.name} (id TEXT PRIMARY KEY, ${columns})`);
  }

  const tx: WriteContext = {
    execute: async (sql, values) => {
      const result = sqlite.prepare(sql).run(...sqlValues(values));
      return queryResultFromMapped({ rowsAffected: Number(result.changes) }, []);
    },
    getAll: async <T>(sql: string, values?: unknown[]) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return sqlite.prepare(sql).all(...sqlValues(values)) as T[];
    },
    getOptional: async <T>(sql: string, values?: unknown[]) => {
      const row = sqlite.prepare(sql).get(...sqlValues(values)) ?? null;
      // Like PowerSync's getOptional, the row type is the caller's to state.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return row as T | null;
    },
  };

  const db: WritableDatabase = {
    async writeTransaction(callback) {
      sqlite.exec("BEGIN");
      try {
        const result = await callback(tx);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  /** Every row of a table, typed as that table's row, for checking what was written. */
  function rows<Row>(table: string): Row[] {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];
  }
  const run = (sql: string, ...values: SQLInputValue[]) => sqlite.prepare(sql).run(...values);
  /** Runs any query and returns its rows, for checking SQL the code uses. */
  const all = (sql: string, ...values: SQLInputValue[]) => sqlite.prepare(sql).all(...values);
  return { db, rows, run, all };
}
