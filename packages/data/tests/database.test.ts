import { queryResultFromMapped } from "@powersync/common";
import { describe, expect, it } from "vitest";
import { rowsOf } from "../src";

describe("rowsOf", () => {
  const rows = [{ id: "a" }, { id: "b" }];

  it("reads a @powersync/common 2.0 result (desktop)", () => {
    expect(rowsOf(queryResultFromMapped({}, rows))).toEqual(rows);
  });

  it("reads a @powersync/common 1.x result (React Native), which has no `array`", () => {
    const result = {
      rowsAffected: 0,
      rows: { _array: rows, length: 2, item: (i: number) => rows[i] },
    };
    expect(rowsOf(result)).toEqual(rows);
  });

  it("gives no rows for a result without any (e.g. an UPDATE)", () => {
    const update = { rowsAffected: 1, rows: undefined };
    expect(rowsOf(update)).toEqual([]);
    expect(rowsOf({})).toEqual([]);
  });
});
