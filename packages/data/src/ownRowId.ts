/**
 * Fixed IDs for the rows each practitioner has exactly one of (profile, practice
 * settings, invoice style), so a first save on any device writes the same row and
 * the server merges them instead of refusing a second one.
 *
 * The ID is a version 5 UUID (RFC 9562): SHA-1 of a Kineō namespace plus
 * "<table>:<Clerk user ID>". Postgres computes the same value with
 * `extensions.uuid_generate_v5('<namespace>', '<table>:<user ID>')`
 * (supabase/migrations/…_own_row_ids.sql). SHA-1 is done here in plain code so it
 * works the same on desktop, phone and in tests, with no platform crypto.
 */

/** Kineō's namespace for these IDs. Never change it: every saved ID depends on it. */
export const OWN_ROW_NAMESPACE = "6f0b8c1e-3d2a-4c5b-9e8f-7a1d2c3b4e5f";

export type OwnRowTable = "profiles" | "practice_settings" | "invoice_styles";

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new RangeError("Not a UUID.");
  return Uint8Array.from({ length: 16 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

/** Rotates a 32-bit word left by n bits. */
const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** SHA-1 of the given bytes (FIPS 180-4). */
export function sha1(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  // Message + 0x80 + zero padding + 64-bit length, to a multiple of 64 bytes.
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);

  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl((w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0), 1);
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i += 1) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const next = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}

/** A version 5 UUID for `name` in `namespace` (RFC 9562, section 5.5). */
export function uuidV5(namespace: string, name: string): string {
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(uuidBytes(namespace));
  input.set(nameBytes, 16);
  const hash = sha1(input).slice(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50; // version 5
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80; // RFC variant
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The fixed ID of a practitioner's one row in `table`. */
export function ownRowId(table: OwnRowTable, ownerId: string): string {
  if (ownerId.trim() === "") throw new RangeError("An owner is required.");
  return uuidV5(OWN_ROW_NAMESPACE, `${table}:${ownerId}`);
}
