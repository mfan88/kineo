/**
 * Works out each table's final columns from the migration files, in order:
 * `create table public.x (...)`, then `alter table public.x add/drop/rename column`.
 * Only what the schema check needs; it isn't a general SQL parser.
 */
export type ServerColumns = Map<string, string>;

const NOT_COLUMNS = new Set(["constraint", "unique", "primary", "foreign", "check", "exclude"]);

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Splits on commas that aren't inside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** The body between a create table's opening parenthesis and its matching close. */
function tableBody(sql: string, start: number): string {
  let depth = 0;
  for (let i = start; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(start + 1, i);
    }
  }
  throw new Error("Unclosed create table.");
}

export function tablesFromMigrations(files: string[]): Map<string, ServerColumns> {
  const tables = new Map<string, ServerColumns>();

  for (const raw of files) {
    const sql = stripComments(raw);

    const statements =
      /create table (?:if not exists )?public\.(\w+)\s*\(|alter table (?:only )?public\.(\w+)\s+(add|drop|rename) column (?:if (?:not )?exists )?(\w+)(?:\s+(?:to\s+)?(\w+))?/gi;
    for (const match of sql.matchAll(statements)) {
      const [whole, created, altered, action, column, extra] = match;
      if (created) {
        const columns: ServerColumns = new Map();
        const body = tableBody(sql, match.index + whole.length - 1);
        for (const item of splitTopLevel(body)) {
          const [name = "", type = ""] = item.split(/\s+/);
          if (NOT_COLUMNS.has(name.toLowerCase())) continue;
          columns.set(name, type.toLowerCase());
        }
        tables.set(created, columns);
        continue;
      }
      const columns = altered ? tables.get(altered) : undefined;
      if (!columns || !column) throw new Error(`Alter of unknown table: ${whole}`);
      const verb = action?.toLowerCase();
      if (verb === "add" && extra) columns.set(column, extra.toLowerCase());
      if (verb === "drop") columns.delete(column);
      if (verb === "rename" && extra) {
        const type = columns.get(column);
        if (type === undefined) throw new Error(`Rename of unknown column: ${whole}`);
        columns.delete(column);
        columns.set(extra, type);
      }
    }
  }
  return tables;
}

/** The PowerSync column type a Postgres type is stored as locally. */
export function localType(postgresType: string): "TEXT" | "INTEGER" | "REAL" {
  if (["uuid", "text", "date", "timestamptz"].includes(postgresType)) return "TEXT";
  if (["integer", "bigint", "smallint", "boolean"].includes(postgresType)) return "INTEGER";
  if (["real", "double"].includes(postgresType)) return "REAL";
  throw new Error(
    `No local type for Postgres type "${postgresType}". Add it here and pick the PowerSync column type deliberately (never real for money).`,
  );
}
