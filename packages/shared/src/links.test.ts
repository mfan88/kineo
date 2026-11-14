import { describe, expect, it } from "vitest";
import { FEEDBACK_EMAIL, LEGAL_LINKS, feedbackMailto } from "./links";

describe("LEGAL_LINKS", () => {
  it("points Terms and Privacy at the website", () => {
    expect(LEGAL_LINKS.map((link) => link.label)).toEqual(["Terms", "Privacy"]);
    expect(LEGAL_LINKS.map((link) => link.href)).toEqual([
      "https://getkineo.work/terms/",
      "https://getkineo.work/privacy/",
    ]);
  });
});

describe("feedbackMailto", () => {
  it("addresses support with a subject and a version footer", () => {
    expect(FEEDBACK_EMAIL).toBe("support@fenna.tech");
    expect(feedbackMailto("Kineō", "0.1.0")).toBe(
      "mailto:support@fenna.tech?subject=Kine%C5%8D%20feedback&body=%0A%0A%E2%80%94%0AKine%C5%8D%200.1.0",
    );
  });

  it("decodes back to a blank message with only the app and version", () => {
    const url = new URL(feedbackMailto("Kineō", "2.3.4-beta"));
    expect(url.searchParams.get("subject")).toBe("Kineō feedback");
    expect(url.searchParams.get("body")).toBe("\n\n—\nKineō 2.3.4-beta");
  });

  it("encodes characters that would break the link", () => {
    const url = feedbackMailto("A&B", "1 2");
    expect(url).not.toContain(" ");
    expect(new URL(url).searchParams.get("body")).toBe("\n\n—\nA&B 1 2");
  });
});
