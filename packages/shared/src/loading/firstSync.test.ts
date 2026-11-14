import { describe, expect, it } from "vitest";
import { firstSyncCopy, firstSyncPhase } from "./firstSync";

describe("firstSyncPhase", () => {
  it("is checking until the status is known", () => {
    expect(firstSyncPhase(null, false)).toBe("checking");
    expect(firstSyncPhase(null, true)).toBe("checking");
  });

  it("is done once the device has synced, even when offline or upload is refused", () => {
    expect(firstSyncPhase({ hasSynced: true, connected: true }, false)).toBe("done");
    expect(firstSyncPhase({ hasSynced: true, connected: false }, true)).toBe("done");
    expect(firstSyncPhase({ hasSynced: true, connected: true, uploadRefused: true }, false)).toBe(
      "done",
    );
    expect(firstSyncPhase({ hasSynced: true, connected: false, uploadRefused: true }, true)).toBe(
      "done",
    );
  });

  it("is getting while the first sync runs or the connection is still being made", () => {
    expect(firstSyncPhase({ hasSynced: false, connected: true }, true)).toBe("getting");
    expect(firstSyncPhase({ hasSynced: false, connected: false }, false)).toBe("getting");
    expect(firstSyncPhase({ hasSynced: false, connected: true, uploadRefused: false }, true)).toBe(
      "getting",
    );
    expect(
      firstSyncPhase({ hasSynced: false, connected: false, uploadRefused: false }, false),
    ).toBe("getting");
  });

  it("is offline only once the wait has passed without a connection and uploads are not refused", () => {
    expect(firstSyncPhase({ hasSynced: false, connected: false }, true)).toBe("offline");
    expect(firstSyncPhase({ hasSynced: false, connected: false, uploadRefused: false }, true)).toBe(
      "offline",
    );
  });

  it("is refused when an upload was rejected before the first sync finished", () => {
    expect(firstSyncPhase({ hasSynced: false, connected: true, uploadRefused: true }, false)).toBe(
      "refused",
    );
    expect(firstSyncPhase({ hasSynced: false, connected: true, uploadRefused: true }, true)).toBe(
      "refused",
    );
    expect(firstSyncPhase({ hasSynced: false, connected: false, uploadRefused: true }, false)).toBe(
      "refused",
    );
    expect(firstSyncPhase({ hasSynced: false, connected: false, uploadRefused: true }, true)).toBe(
      "refused",
    );
  });
});

describe("firstSyncCopy", () => {
  it("names the device", () => {
    expect(firstSyncCopy("getting", "phone").body).toBe(
      "This only happens once on this phone. Keep Kineō open until it finishes.",
    );
    expect(firstSyncCopy("getting", "computer").body).toContain("on this computer");
  });

  it("says what to do offline", () => {
    const copy = firstSyncCopy("offline", "phone");
    expect(copy.heading).toBe("You're offline");
    expect(copy.body).toContain("Connect to the internet");
  });

  it("explains when the server refuses uploads", () => {
    expect(firstSyncCopy("refused", "phone")).toEqual({
      heading: "Kineō can't save to the server",
      body: "It will keep trying. If this doesn't clear up in a few minutes, email support@fenna.tech.",
    });
    expect(firstSyncCopy("refused", "computer")).toEqual({
      heading: "Kineō can't save to the server",
      body: "It will keep trying. If this doesn't clear up in a few minutes, email support@fenna.tech.",
    });
  });
});
