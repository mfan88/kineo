import { describe, expect, it } from "vitest";
import type { Download } from "../data/downloads.ts";
import { downloadCardsHtml } from "./downloads-html.ts";

const base: Download = {
  platform: "mac",
  name: "Mac",
  requirement: "Desktop app for macOS.",
  link: "[MAC DOWNLOAD LINK]",
  status: "coming-soon",
};

describe("downloadCardsHtml", () => {
  it("renders a card per platform with its name and requirement", () => {
    const html = downloadCardsHtml();
    for (const name of ["iPhone", "Android", "Mac", "Windows"]) {
      expect(html).toContain(`<h2 class="download__name">${name}</h2>`);
    }
    expect(html).toContain("From the App Store.");
  });

  it("shows a Coming soon tag, not a button, for coming-soon platforms", () => {
    const html = downloadCardsHtml([base]);
    expect(html).toContain('<span class="tag">Coming soon</span>');
    expect(html).not.toContain('class="button"');
    expect(html).not.toContain("[MAC DOWNLOAD LINK]");
  });

  it("shows a download button for an available platform with a real link", () => {
    const html = downloadCardsHtml([
      { ...base, status: "available", link: "https://example.com/kineo.dmg" },
    ]);
    expect(html).toContain(
      '<a class="button" href="https://example.com/kineo.dmg">Get Kineō for Mac</a>',
    );
  });

  it("labels a beta build", () => {
    const html = downloadCardsHtml([{ ...base, status: "beta", link: "https://example.com/beta" }]);
    expect(html).toContain('Mac <span class="tag">Beta</span>');
    expect(html).toContain('class="button"');
  });

  it("never links a placeholder, even if the status says available", () => {
    const html = downloadCardsHtml([{ ...base, status: "available" }]);
    expect(html).not.toContain('class="button"');
  });
});
