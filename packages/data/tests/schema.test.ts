import { describe, expect, it } from "vitest";
import { AppSchema, BOOLEAN_COLUMNS } from "../src";
import { localType, tablesFromMigrations } from "./migrations";

const alphabetical = (a: string, b: string) => a.localeCompare(b);
const byName = (a: string[], b: string[]) => alphabetical(a[0] ?? "", b[0] ?? "");

const migrationFiles = import.meta.glob<string>("../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});
const server = tablesFromMigrations(
  Object.keys(migrationFiles)
    .toSorted(alphabetical)
    .map((path) => migrationFiles[path] ?? ""),
);
const local = new Map(
  AppSchema.tables.map((table) => [
    table.name,
    new Map(table.columns.map((c) => [c.name, String(c.type)])),
  ]),
);

describe("local schema matches the migrations", () => {
  it("reads the migrations", () => {
    expect(Object.keys(migrationFiles).length).toBeGreaterThan(0);
  });

  it("has exactly the server's ten tables", () => {
    expect([...local.keys()].toSorted(alphabetical)).toEqual(
      [...server.keys()].toSorted(alphabetical),
    );
    expect(local.size).toBe(10);
  });

  for (const [table, columns] of server) {
    it(`${table}: same columns, same types`, () => {
      expect(columns.get("id")).toBe("uuid");
      const expected = [...columns]
        .filter(([name]) => name !== "id")
        .map(([name, type]) => [name, localType(type)]);
      expect([...(local.get(table) ?? [])].toSorted(byName)).toEqual(expected.toSorted(byName));
    });
  }

  it("lists exactly the server's boolean columns", () => {
    const serverBooleans = [...server]
      .map(
        ([table, columns]) =>
          [
            table,
            [...columns].filter(([, type]) => type === "boolean").map(([name]) => name),
          ] as const,
      )
      .filter(([, names]) => names.length > 0);
    expect(new Map(serverBooleans.map(([t, names]) => [t, names.toSorted(alphabetical)]))).toEqual(
      new Map(
        Object.entries(BOOLEAN_COLUMNS).map(([t, names]) => [t, names.toSorted(alphabetical)]),
      ),
    );
  });

  it("keeps money in integer cents", () => {
    const moneyTypes = [...local.values()].flatMap((columns) =>
      [...columns].filter(([name]) => name.endsWith("_cents")).map(([, type]) => type),
    );
    expect(moneyTypes.length).toBeGreaterThan(0);
    expect(new Set(moneyTypes)).toEqual(new Set(["INTEGER"]));
  });
});

describe("reading migrations", () => {
  it("skips constraints and handles nested parentheses", () => {
    const tables = tablesFromMigrations([
      `create table public.things (
        id uuid primary key default gen_random_uuid(),
        -- a comment, with commas
        amount_cents bigint not null check (amount_cents >= 0),
        kind text not null default 'a' check (kind in ('a', 'b')),
        constraint things_ok check (amount_cents between 0 and 10),
        unique (id, kind)
      );`,
    ]);
    expect([...(tables.get("things") ?? [])]).toEqual([
      ["id", "uuid"],
      ["amount_cents", "bigint"],
      ["kind", "text"],
    ]);
  });

  it("applies later added, dropped and renamed columns", () => {
    const tables = tablesFromMigrations([
      "create table public.things (id uuid primary key, a text, b text);",
      "alter table public.things add column c boolean not null default false;",
      "alter table public.things drop column if exists a;",
      "alter table public.things rename column b to bee;",
    ]);
    expect([...(tables.get("things") ?? [])]).toEqual([
      ["id", "uuid"],
      ["c", "boolean"],
      ["bee", "text"],
    ]);
  });

  it("refuses types it hasn't been told how to store", () => {
    expect(() => localType("numeric")).toThrow(/never real for money/);
    expect(localType("timestamptz")).toBe("TEXT");
    expect(localType("boolean")).toBe("INTEGER");
  });
});
