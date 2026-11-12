import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { escapeHtml } from "./html.ts";

const LEGAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/legal");

export interface LegalDocument {
  title: string;
  /** YYYY-MM-DD */
  lastUpdated: string;
  draft: boolean;
  /** Markdown body, without the front matter or the leading "# Title" line. */
  body: string;
}

/** Splits simple "key: value" front matter from a Markdown file. */
export function parseLegal(markdown: string): LegalDocument {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) throw new Error("Legal document needs front matter.");
  const fields = new Map(
    (match[1] ?? "")
      .split("\n")
      .map((line) => /^([a-z_]+):\s*(.*)$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]?.trim() ?? ""]),
  );
  const title = fields.get("title");
  const lastUpdated = fields.get("last_updated");
  if (!title) throw new Error("Legal document needs a title.");
  if (!lastUpdated || !/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    throw new Error("Legal document needs last_updated as YYYY-MM-DD.");
  }
  const body = markdown
    .slice(match[0].length)
    .replace(/^\s*#\s+[^\n]*\n/, "")
    .trim();
  return { title, lastUpdated, draft: fields.get("status") === "draft", body };
}

const longDate = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** The page content for a legal document: heading, draft banner, date and text. */
export function legalHtml(doc: LegalDocument): string {
  const date = longDate.format(new Date(`${doc.lastUpdated}T00:00:00Z`));
  const banner = doc.draft
    ? `<p class="draft-banner" role="note"><strong>Draft:</strong> not yet in effect.</p>`
    : "";
  const content = marked.parse(doc.body, { async: false, gfm: true });
  return `<section class="section">
  <div class="container prose legal">
    <h1>${escapeHtml(doc.title)}</h1>
    ${banner}
    <p class="muted">Last updated <time datetime="${doc.lastUpdated}">${date}</time></p>
    ${content}
  </div>
</section>`;
}

/** Reads docs/legal/<name>.md and renders it. */
export function legalPage(name: "privacy" | "terms"): string {
  return legalHtml(parseLegal(readFileSync(resolve(LEGAL_DIR, `${name}.md`), "utf8")));
}
