import type { UploadRejection } from "@kineo/shared";
import { describe, expect, it, vi } from "vitest";
import { Connector, SYNC_URL, type TokenSource, type UploadQueue } from "./connector";
import { RetryLater, type Change } from "./upload";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CHANGE: Change = { op: "DELETE", table: "patients", id: ID };
const REFUSED: UploadRejection = {
  table: "patients",
  operation: "DELETE",
  status: 400,
  code: "23514",
  message: "Locked.",
};

function queueOf(transactions: Change[][]) {
  const completed: number[] = [];
  let next = 0;
  const queue: UploadQueue = {
    getNextCrudTransaction: () => {
      const index = next;
      const crud = transactions[index];
      if (!crud) return Promise.resolve(null);
      return Promise.resolve({
        crud,
        complete: () => {
          completed.push(index);
          next = index + 1;
          return Promise.resolve();
        },
      });
    },
  };
  return { queue, completed };
}

function uploaderReturning(...results: (UploadRejection | null | Error)[]) {
  const upload =
    vi.fn<(token: string, changes: readonly Change[]) => Promise<UploadRejection | null>>();
  for (const result of results) {
    if (result instanceof Error) upload.mockRejectedValueOnce(result);
    else upload.mockResolvedValueOnce(result);
  }
  return { upload, uploader: { upload } };
}

const tokens: TokenSource = (kind) =>
  Promise.resolve(kind === "session" ? "session-jwt" : "ps-jwt");

const noSession: TokenSource = (kind) => Promise.resolve(kind === "session" ? null : "ps");

describe("Connector", () => {
  it("gives PowerSync the powersync token and Kineō's sync server", async () => {
    const connector = new Connector(tokens, uploaderReturning().uploader);
    expect(await connector.fetchCredentials()).toEqual({ endpoint: SYNC_URL, token: "ps-jwt" });
  });

  it("has no credentials without a token", async () => {
    const connector = new Connector(() => Promise.resolve(null), uploaderReturning().uploader);
    expect(await connector.fetchCredentials()).toBeNull();
  });

  it("uploads each transaction with the session token, then completes it", async () => {
    const { upload, uploader } = uploaderReturning(null, null);
    const { queue, completed } = queueOf([[CHANGE], [CHANGE, CHANGE]]);
    await new Connector(tokens, uploader).uploadData(queue);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[0]).toBe("session-jwt");
    expect(completed).toEqual([0, 1]);
  });

  it("reports a refused change, drops it and carries on", async () => {
    const { uploader } = uploaderReturning(REFUSED, null);
    const { queue, completed } = queueOf([[CHANGE], [CHANGE]]);
    const connector = new Connector(tokens, uploader);
    const seen: UploadRejection[] = [];
    const stop = connector.onRejected((rejection) => seen.push(rejection));
    await connector.uploadData(queue);
    expect(seen).toEqual([REFUSED]);
    expect(completed).toEqual([0, 1]);

    stop();
    const again = queueOf([[CHANGE]]);
    await new Connector(tokens, uploaderReturning(REFUSED).uploader).uploadData(again.queue);
    expect(seen).toHaveLength(1);
  });

  it("leaves the transaction queued when it should retry", async () => {
    const { uploader } = uploaderReturning(new RetryLater("The server answered 503."));
    const { queue, completed } = queueOf([[CHANGE]]);
    await expect(new Connector(tokens, uploader).uploadData(queue)).rejects.toBeInstanceOf(
      RetryLater,
    );
    expect(completed).toEqual([]);
  });

  it("leaves it queued without a session token", async () => {
    const { upload, uploader } = uploaderReturning();
    const { queue, completed } = queueOf([[CHANGE]]);
    await expect(new Connector(noSession, uploader).uploadData(queue)).rejects.toBeInstanceOf(
      RetryLater,
    );
    expect(upload).not.toHaveBeenCalled();
    expect(completed).toEqual([]);
  });
});
