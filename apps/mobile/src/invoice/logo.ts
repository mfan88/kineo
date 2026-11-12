import { MAX_LOGO_BYTES } from "@kineo/shared";

/** Fixed here, so tokens only ever go to Kineō's server (as on desktop). */
export const STORAGE_URL = "https://api.getkineo.work/storage/v1";
const BUCKET = "logos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
};

/**
 * The logo's content type, if `path` is a logo path: `user_abc123/logo-<uuid>.png`,
 * the owner's Clerk ID as the folder, then a new file name per upload (as desktop's
 * `check_path`). Anything else is refused before any request or file access.
 */
export function logoContentType(path: string): string | null {
  const match = /^(user_[A-Za-z0-9]+)\/logo-([^/]+)\.([a-z]+)$/.exec(path);
  if (!match) return null;
  const [, , uuid = "", extension = ""] = match;
  if (!UUID.test(uuid)) return null;
  return TYPES[extension] ?? null;
}

/** Where the phone keeps its copies of logos, as the app's files see them. */
export interface LogoFiles {
  /** The kept copy as base64, or null if there isn't one. */
  read(path: string): Promise<string | null>;
  /** Keeps a copy; failing to is fine (it's downloaded again next time). */
  write(path: string, bytes: Uint8Array): Promise<void>;
}

/** The logo couldn't be loaded. The message is safe to show. */
export class LogoError extends Error {
  override name = "LogoError";
}

/**
 * Logos as `data:` URIs for the invoice: the copy kept on the phone if there is
 * one, otherwise downloaded from Storage with the session token and kept, so it
 * shows offline from then on. A data URI because iOS can't print local image files.
 */
export class LogoStore {
  private readonly loading = new Map<string, Promise<string>>();

  constructor(
    private readonly files: LogoFiles,
    private readonly token: () => Promise<string | null>,
    private readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>,
    private readonly storageUrl = STORAGE_URL,
  ) {}

  /** The logo as a data URI. Rejects with LogoError if it can't be loaded. */
  dataUri(path: string): Promise<string> {
    const started = this.loading.get(path);
    if (started) return started;
    const load = this.load(path);
    this.loading.set(path, load);
    // A failure isn't remembered: the next preview tries again.
    load.catch(() => this.loading.delete(path));
    return load;
  }

  private async load(path: string): Promise<string> {
    const type = logoContentType(path);
    if (type === null) throw new LogoError("That isn't a logo path.");
    const kept = await this.files.read(path).catch(() => null);
    if (kept !== null) return `data:${type};base64,${kept}`;

    const offline = new LogoError("Couldn't load the logo. Check your internet connection.");
    const token = await this.token().catch(() => null);
    if (!token) throw offline;
    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.storageUrl.replace(/\/+$/, "")}/object/authenticated/${BUCKET}/${path}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      throw offline;
    }
    if (!response.ok) {
      throw new LogoError(
        response.status === 400 || response.status === 404
          ? "The logo couldn't be found. Choose it again in Invoice style on your computer."
          : "Couldn't load the logo. Try again.",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
      throw new LogoError("Couldn't load the logo. Try again.");
    }
    await this.files.write(path, bytes).catch(() => {});
    return `data:${type};base64,${toBase64(bytes)}`;
  }
}

/** Standard base64 of `bytes`, in pieces so long logos don't overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
