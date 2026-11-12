import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OWN_ROW_NAMESPACE, ownRowId, sha1, uuidV5 } from "../src/ownRowId";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("sha1", () => {
  it("matches the FIPS 180 test vectors", () => {
    expect(hex(sha1(new TextEncoder().encode("abc")))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
    expect(hex(sha1(new Uint8Array()))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(
      hex(
        sha1(new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
      ),
    ).toBe("84983e441c3bd26ebaae4aa1f95129e5e54670f1");
  });

  it("matches Node's SHA-1 across block boundaries and for non-ASCII text", () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) % 256);
      expect(hex(sha1(bytes)), `length ${length}`).toBe(
        createHash("sha1").update(bytes).digest("hex"),
      );
    }
    const text = new TextEncoder().encode("Kineō physio ✓");
    expect(hex(sha1(text))).toBe(createHash("sha1").update(text).digest("hex"));
  });
});

describe("uuidV5", () => {
  it("matches the standard's DNS example (and Postgres's uuid_generate_v5)", () => {
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("refuses a malformed namespace", () => {
    expect(() => uuidV5("not-a-uuid", "x")).toThrow(RangeError);
  });
});

describe("ownRowId", () => {
  it("is the same every time for the same practitioner and table", () => {
    expect(ownRowId("profiles", "user_abc")).toBe(ownRowId("profiles", "user_abc"));
    expect(ownRowId("profiles", "user_abc")).toBe(uuidV5(OWN_ROW_NAMESPACE, "profiles:user_abc"));
  });

  it("differs between tables and between practitioners", () => {
    const ids = new Set([
      ownRowId("profiles", "user_abc"),
      ownRowId("practice_settings", "user_abc"),
      ownRowId("invoice_styles", "user_abc"),
      ownRowId("profiles", "user_xyz"),
    ]);
    expect(ids.size).toBe(4);
  });

  it("is a valid version 5 UUID", () => {
    expect(ownRowId("invoice_styles", "user_abc")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("matches the IDs Postgres computes (supabase/tests/own_row_ids.test.sql)", () => {
    expect(ownRowId("profiles", "user_seed_check")).toBe("3debc052-dd15-5085-89e1-349fbeebebab");
    expect(ownRowId("practice_settings", "user_seed_check")).toBe(
      "3998afd7-56e5-56dc-a5b9-0febbf678123",
    );
    expect(ownRowId("invoice_styles", "user_seed_check")).toBe(
      "96c7a667-19c9-596e-b5dd-756bf996a790",
    );
  });

  it("needs an owner", () => {
    expect(() => ownRowId("profiles", " ")).toThrow(RangeError);
  });
});
