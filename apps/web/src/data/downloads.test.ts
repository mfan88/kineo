import { describe, expect, it } from "vitest";
import { DOWNLOAD_STATUSES, downloads, isRealLink } from "./downloads.ts";

describe("downloads", () => {
  it("lists iPhone, Android, Mac and Windows once each", () => {
    expect(downloads.map((d) => d.platform)).toEqual(["iphone", "android", "mac", "windows"]);
  });

  it.each(downloads)("$name has a valid status, a name and a requirement line", (download) => {
    expect(DOWNLOAD_STATUSES).toContain(download.status);
    expect(download.name.trim()).not.toBe("");
    expect(download.requirement.trim()).not.toBe("");
  });

  it.each(downloads.filter((d) => d.status === "available"))(
    "$name is available, so it has a real https link",
    (download) => {
      expect(isRealLink(download.link)).toBe(true);
    },
  );
});

describe("isRealLink", () => {
  it("accepts https links only", () => {
    expect(isRealLink("https://apps.apple.com/app/id1")).toBe(true);
    expect(isRealLink("http://example.com")).toBe(false);
    expect(isRealLink("[APP STORE LINK]")).toBe(false);
    expect(isRealLink("")).toBe(false);
  });
});
