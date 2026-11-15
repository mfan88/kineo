import { describe, expect, it } from "vitest";
import { FEEDBACK_EMAIL, LEGAL_LINKS, accountRequestMailto, feedbackMailto } from "./links";

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

describe("accountRequestMailto", () => {
  it("addresses support with an account request subject and instructional body", () => {
    expect(FEEDBACK_EMAIL).toBe("support@fenna.tech");
    const expectedSubject = encodeURIComponent("Kineō account request");
    const expectedBody = encodeURIComponent(
      "\n\nTell us if you'd like to close your account or get a copy of your data.\n\n—\nKineō 0.1.0",
    );
    expect(accountRequestMailto("Kineō", "0.1.0")).toBe(
      `mailto:${FEEDBACK_EMAIL}?subject=${expectedSubject}&body=${expectedBody}`,
    );
  });

  it("decodes back to the prompt, em-dash, and app version", () => {
    const url = new URL(accountRequestMailto("Kineō", "2.3.4-beta"));
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("support@fenna.tech");
    expect(url.searchParams.get("subject")).toBe("Kineō account request");
    expect(url.searchParams.get("body")).toBe(
      "\n\nTell us if you'd like to close your account or get a copy of your data.\n\n—\nKineō 2.3.4-beta",
    );
  });

  it("encodes characters that would break the link", () => {
    const url = accountRequestMailto("A&B", "1 2");
    expect(url).not.toContain(" ");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("subject")).toBe("A&B account request");
    expect(parsed.searchParams.get("body")).toBe(
      "\n\nTell us if you'd like to close your account or get a copy of your data.\n\n—\nA&B 1 2",
    );
  });

  it("contains no patient PII or practice details in the link or body", () => {
    const fakePatient = "Jordan Example";
    const fakeClinic = "Sample Clinic";
    const mailto = accountRequestMailto("Kineō", "0.1.0");

    expect(mailto).not.toContain(fakePatient);
    expect(mailto).not.toContain(fakeClinic);
    const parsed = new URL(mailto);
    expect(parsed.searchParams.get("body")).not.toContain(fakePatient);
    expect(parsed.searchParams.get("body")).not.toContain(fakeClinic);
  });
});
