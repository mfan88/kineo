import { describe, expect, it, vi } from "vitest";

vi.mock("@powersync/react-native", () => ({
  column: {},
  PowerSyncDatabase: class {},
  Schema: class {},
  Table: class {},
}));
vi.mock("@kineo/data", () => ({ buildAppSchema: () => ({}) }));

const { databaseFileFor } = await import("./database");

describe("databaseFileFor", () => {
  it("gives each Clerk user their own file", () => {
    expect(databaseFileFor("user_2abcDEF123")).toBe("kineo-user_2abcDEF123.db");
    expect(databaseFileFor("user_other")).not.toBe(databaseFileFor("user_2abcDEF123"));
  });

  it("keeps the name a safe file name", () => {
    expect(databaseFileFor("../user x/y")).toBe("kineo-___user_x_y.db");
  });
});
