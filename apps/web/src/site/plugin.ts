import type { Plugin } from "vite";
import { renderPage, type PageMeta } from "./layout.ts";

/** First-line page header: <!-- page path="/download/" title="Download" description="…" --> */
const PAGE_HEADER = /^\s*<!--\s*page((?:\s+[a-z]+="[^"]*")*)\s*-->/;
const ATTRIBUTE = /([a-z]+)="([^"]*)"/g;

/** Turns a page file's header comment into its metadata. */
export function parsePageHeader(html: string): { meta: PageMeta; body: string } {
  const match = PAGE_HEADER.exec(html);
  if (!match) throw new Error('Page must start with <!-- page path="/…/" … -->.');
  const attributes = new Map([...(match[1] ?? "").matchAll(ATTRIBUTE)].map((m) => [m[1], m[2]]));
  const path = attributes.get("path");
  if (!path) throw new Error("Page header needs a path.");
  const meta: PageMeta = { path };
  const title = attributes.get("title");
  const description = attributes.get("description");
  if (title) meta.title = title;
  if (description) meta.description = description;
  if (attributes.get("noindex") === "true") meta.noindex = true;
  return { meta, body: html.slice(match[0].length).trim() };
}

/** Fills generated sections, e.g. <!-- include:downloads -->. */
export type Includes = Record<string, () => string>;

/**
 * Builds each page: wraps the page file's content in the shared layout and fills
 * its includes. Runs before Vite processes the HTML, so the stylesheet and assets
 * the layout links to are bundled as usual.
 */
export function kineoPages(includes: Includes = {}): Plugin {
  return {
    name: "kineo-pages",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const { meta, body } = parsePageHeader(html);
        const filled = body.replace(/<!--\s*include:([a-z-]+)\s*-->/g, (_, name: string) => {
          const include = includes[name];
          if (!include) throw new Error(`Unknown include "${name}".`);
          return include();
        });
        return renderPage(meta, filled);
      },
    },
  };
}
