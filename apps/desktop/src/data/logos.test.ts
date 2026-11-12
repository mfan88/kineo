import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogos, deleteLogo, LogoError, logoDataUrl, newLogoPath, uploadLogo } from "./logos";

const invoke = vi.hoisted(() =>
  vi.fn<(command: string, args?: unknown, options?: unknown) => Promise<unknown>>(),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const OWNER = "user_abc";

beforeEach(async () => {
  invoke.mockReset();
  invoke.mockResolvedValue(null);
  await clearLogos();
  invoke.mockClear();
});

describe("newLogoPath", () => {
  it("puts each logo in the owner's folder with a new name and the right extension", () => {
    expect(newLogoPath(OWNER, "image/png", () => "id-1")).toBe("user_abc/logo-id-1.png");
    expect(newLogoPath(OWNER, "image/jpeg", () => "id-2")).toBe("user_abc/logo-id-2.jpg");
    expect(newLogoPath(OWNER, "image/svg+xml", () => "id-3")).toBe("user_abc/logo-id-3.svg");
  });
});

describe("uploadLogo", () => {
  it("sends the bytes with the new path and resolves to it", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    const path = await uploadLogo(OWNER, file);
    expect(path).toMatch(/^user_abc\/logo-[0-9a-f-]{36}\.png$/);
    expect(invoke).toHaveBeenCalledWith("logo_upload", new Uint8Array([1, 2, 3]), {
      headers: { "kineo-logo-path": path },
    });
  });

  it("checks the file first, with the shared messages", async () => {
    await expect(
      uploadLogo(OWNER, new File(["x"], "a.gif", { type: "image/gif" })),
    ).rejects.toThrow(new LogoError("Choose a PNG, JPEG or SVG image."));
    await expect(uploadLogo(OWNER, new File([], "a.png", { type: "image/png" }))).rejects.toThrow(
      new LogoError("That file is empty. Choose another image."),
    );
    const large = new File([new Uint8Array(1024 * 1024 + 1)], "a.png", { type: "image/png" });
    await expect(uploadLogo(OWNER, large)).rejects.toThrow(
      new LogoError("Choose an image of 1 MB or less."),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes on the reason an upload failed", async () => {
    invoke.mockRejectedValueOnce("Kineō couldn't save the logo to your account.");
    const file = new File([new Uint8Array([1])], "logo.svg", { type: "image/svg+xml" });
    await expect(uploadLogo(OWNER, file)).rejects.toThrow(
      new LogoError("Kineō couldn't save the logo to your account."),
    );
  });
});

describe("logoDataUrl", () => {
  it("turns the stored bytes into a data URL of the right type, once per path", async () => {
    invoke.mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer);
    const path = "user_abc/logo-1.png";
    expect(await logoDataUrl(path)).toBe("data:image/png;base64,iVBORw==");
    expect(await logoDataUrl(path)).toBe("data:image/png;base64,iVBORw==");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("logo_read", { path });
  });

  it("uses the SVG type for SVG logos", async () => {
    invoke.mockResolvedValue(new TextEncoder().encode("<svg/>").buffer);
    expect(await logoDataUrl("user_abc/logo-2.svg")).toBe(
      `data:image/svg+xml;base64,${btoa("<svg/>")}`,
    );
  });

  it("tries again next time after a failure", async () => {
    invoke.mockRejectedValueOnce("The logo couldn't be found. Choose it again in Invoice style.");
    await expect(logoDataUrl("user_abc/logo-3.png")).rejects.toThrow(LogoError);
    invoke.mockResolvedValueOnce(new Uint8Array([1]).buffer);
    await expect(logoDataUrl("user_abc/logo-3.png")).resolves.toBe("data:image/png;base64,AQ==");
  });
});

describe("deleting and clearing", () => {
  it("deletes a logo and forgets its image", async () => {
    invoke.mockResolvedValue(new Uint8Array([1]).buffer);
    await logoDataUrl("user_abc/logo-4.png");
    await deleteLogo("user_abc/logo-4.png");
    expect(invoke).toHaveBeenCalledWith("logo_delete", { path: "user_abc/logo-4.png" });
    await logoDataUrl("user_abc/logo-4.png");
    expect(invoke.mock.calls.filter(([command]) => command === "logo_read")).toHaveLength(2);
  });

  it("clears the saved copies on this computer", async () => {
    await clearLogos();
    expect(invoke).toHaveBeenCalledWith("logo_clear_cache");
  });
});
