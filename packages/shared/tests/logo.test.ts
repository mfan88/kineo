import { describe, expect, it } from "vitest";
import { MAX_LOGO_BYTES, logoFileError } from "../src/index";

describe("logoFileError", () => {
  it.each(["image/png", "image/jpeg", "image/svg+xml"])("accepts %s", (type) => {
    expect(logoFileError({ type, size: 2048 })).toBeNull();
  });

  it.each(["image/gif", "image/webp", "application/pdf", ""])("refuses %j", (type) => {
    expect(logoFileError({ type, size: 2048 })).toBe("Choose a PNG, JPEG or SVG image.");
  });

  it("accepts exactly 1 MB and refuses one byte more", () => {
    expect(logoFileError({ type: "image/png", size: MAX_LOGO_BYTES })).toBeNull();
    expect(logoFileError({ type: "image/png", size: MAX_LOGO_BYTES + 1 })).toBe(
      "Choose an image of 1 MB or less.",
    );
  });

  it("refuses an empty file", () => {
    expect(logoFileError({ type: "image/png", size: 0 })).toBe(
      "That file is empty. Choose another image.",
    );
  });
});
