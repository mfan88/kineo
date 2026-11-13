import { describe, expect, it } from "vitest";
import { firstSyncCopy, firstSyncPhase } from "./firstSync";

describe("firstSyncPhase", () => {
  it("is checking until the status is known", () => {
    expect(firstSyncPhase(null, false)).toBe("checking");
    expect(firstSyncPhase(null, true)).toBe("checking");
  });

  it("is done once the device has synced, even when offline", () => {
    expect(firstSyncPhase({ hasSynced: true, connected: true }, false)).toBe("done");
    expect(firstSyncPhase({ hasSynced: true, connected: false }, true)).toBe("done");
  });

  it("is getting while the first sync runs or the connection is still being made", () => {
    expect(firstSyncPhase({ hasSynced: false, connected: true }, true)).toBe("getting");
    expect(firstSyncPhase({ hasSynced: false, connected: false }, false)).toBe("getting");
  });

  it("is offline only once the wait has passed without a connection", () => {
    expect(firstSyncPhase({ hasSynced: false, connected: false }, true)).toBe("offline");
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
});
