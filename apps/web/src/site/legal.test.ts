import { describe, expect, it } from "vitest";
import { legalHtml, legalPage, parseLegal } from "./legal.ts";

const SAMPLE = `---
title: Privacy policy
last_updated: 2026-11-11
status: draft
---

# Privacy policy

## Who we are

[TO BE WRITTEN]
`;

describe("parseLegal", () => {
  it("reads the front matter and drops the leading title", () => {
    expect(parseLegal(SAMPLE)).toEqual({
      title: "Privacy policy",
      lastUpdated: "2026-11-11",
      draft: true,
      body: "## Who we are\n\n[TO BE WRITTEN]",
    });
  });

  it("needs a title and a YYYY-MM-DD date", () => {
    expect(() => parseLegal("# No front matter")).toThrow(/front matter/);
    expect(() => parseLegal("---\nlast_updated: 2026-11-11\n---\n")).toThrow(/title/);
    expect(() => parseLegal("---\ntitle: X\nlast_updated: soon\n---\n")).toThrow(/YYYY-MM-DD/);
  });
});

describe("legalHtml", () => {
  it("shows the title, draft banner, date and sections", () => {
    const html = legalHtml(parseLegal(SAMPLE));
    expect(html).toContain("<h1>Privacy policy</h1>");
    expect(html).toContain("<strong>Draft:</strong> not yet in effect.");
    expect(html).toContain('<time datetime="2026-11-11">November 11, 2026</time>');
    expect(html).toContain("<h2>Who we are</h2>");
    expect(html).toContain("[TO BE WRITTEN]");
  });

  it("has no draft banner once the status changes", () => {
    const html = legalHtml(parseLegal(SAMPLE.replace("status: draft", "status: final")));
    expect(html).not.toContain("draft-banner");
  });
});

describe("docs/legal", () => {
  it.each([
    [
      "privacy",
      [
        "Who we are",
        "What we collect",
        "Patient information",
        "Where your data is stored",
        "Who we share it with",
        "How long we keep it",
        "Your rights",
        "Security",
        "Children",
        "Changes to this policy",
        "Contact",
      ],
    ],
    [
      "terms",
      [
        "Agreement",
        "The service",
        "Your account",
        "Your responsibilities",
        "Patient data and professional obligations",
        "Fees",
        "Beta software",
        "Intellectual property",
        "Disclaimers",
        "Limitation of liability",
        "Ending your account",
        "Changes",
        "Governing law",
        "Contact",
      ],
    ],
  ] as const)("%s has every required section, in order", (name, headings) => {
    const html = legalPage(name);
    const found = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(found).toEqual(headings);
    // Both documents are in effect (status: production), so no draft banner.
    expect(html).not.toContain("draft-banner");
  });
});
