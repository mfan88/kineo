import type { UploadRejection } from "@kineo/shared";
import { RetryLater, type Change, type Uploader } from "./upload";

/** Fixed here, so tokens only ever go to Kineō's servers (as on desktop). */
export const SYNC_URL = "https://sync.getkineo.work";
export const API_URL = "https://api.getkineo.work/rest/v1";

/** Clerk's tokens: the session's for PostgREST, the `powersync` template's for PowerSync. */
export type TokenSource = (kind: "session" | "powersync") => Promise<string | null>;

/** What the connector needs from PowerSync's upload queue. */
export interface UploadQueue {
  getNextCrudTransaction(): Promise<{
    crud: Change[];
    complete: () => Promise<void>;
  } | null>;
}

/**
 * PowerSync's connector for the phone: Clerk tokens in, local changes out to
 * PostgREST. A change the server refuses for good (e.g. a locked invoice) is
 * dropped and reported, and PowerSync then restores the server's copy.
 */
export class Connector {
  private readonly listeners = new Set<(rejection: UploadRejection) => void>();

  constructor(
    private readonly tokens: TokenSource,
    private readonly uploader: Pick<Uploader, "upload">,
  ) {}

  async fetchCredentials(): Promise<{ endpoint: string; token: string } | null> {
    const token = await this.tokens("powersync");
    // No token: signed out or offline. PowerSync tries again later.
    if (!token) return null;
    return { endpoint: SYNC_URL, token };
  }

  /**
   * Uploads every queued transaction. Throwing leaves the rest queued, and
   * PowerSync calls this again later.
   */
  async uploadData(queue: UploadQueue): Promise<void> {
    for (;;) {
      const transaction = await queue.getNextCrudTransaction();
      if (!transaction) return;
      const token = await this.tokens("session");
      if (!token) throw new RetryLater("No session token yet.");
      const rejection = await this.uploader.upload(token, transaction.crud);
      // Retrying can't succeed, so drop the change instead of blocking every later one.
      if (rejection) for (const listener of this.listeners) listener(rejection);
      await transaction.complete();
    }
  }

  /** Called with each refused change (never row data). */
  onRejected(listener: (rejection: UploadRejection) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
