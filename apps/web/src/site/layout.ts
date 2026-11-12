import { isPlaceholder, site } from "./config.ts";
import { escapeHtml } from "./html.ts";
import { tokensCss } from "./tokens-css.ts";

export interface PageMeta {
  /** Page title; the site name is added after it. Omit on Home. */
  title?: string;
  description?: string;
  /** Site path with a trailing slash, e.g. "/download/". */
  path: string;
  /** Keep the page out of search results (and give it no canonical URL), e.g. the 404 page. */
  noindex?: boolean;
}

const NAV = [
  { href: "/download/", label: "Download" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
] as const;

/** The lockup: icon tile and the wordmark with its drawn macron. */
export function lockup(className = ""): string {
  return `<span class="lockup ${className}"><img class="lockup__icon" src="/favicon.svg" alt="" width="40" height="40"><span class="wordmark">kine<span class="wordmark__o">o</span></span></span>`;
}

/** Wraps a page's main content in the shared document, header and footer. */
export function renderPage(meta: PageMeta, main: string): string {
  const title = meta.title
    ? `${meta.title} · ${site.name}`
    : `${site.name}: ${site.defaultDescription}`;
  const description = meta.description ?? site.defaultDescription;
  const canonical = `${site.url}${meta.path}`;
  const nav = NAV.map(
    ({ href, label }) =>
      `<a href="${href}"${href === meta.path ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("");

  return `<!doctype html>
<html lang="en-CA">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${meta.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${escapeHtml(canonical)}" />`}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${site.name}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(`${site.url}/og.png`)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#E0F2FE" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/sora-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin />
    <style>
${tokensCss()}
    </style>
    <link rel="stylesheet" href="/src/styles/site.css" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="container site-header__inner">
        <a class="site-header__home" href="/" aria-label="${site.name} home">${lockup()}</a>
        <nav class="site-nav" aria-label="Main">${nav}</nav>
      </div>
    </header>
    <main id="main" tabindex="-1">
${main}
    </main>
    <footer class="site-footer">
      <div class="container site-footer__inner">
        <a class="site-footer__home" href="/" aria-label="${site.name} home">${lockup("lockup--small")}</a>
        <nav class="site-footer__links" aria-label="Footer">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          ${contactLink()}
        </nav>
        <p class="site-footer__copyright">${escapeHtml(site.copyright)}</p>
      </div>
    </footer>
  </body>
</html>
`;
}

/** The contact email as a mailto link, or the placeholder text until it's set. */
export function contactLink(label?: string): string {
  const email = site.contactEmail;
  if (isPlaceholder(email)) return `<span class="placeholder">${escapeHtml(label ?? email)}</span>`;
  return `<a href="mailto:${escapeHtml(email)}">${escapeHtml(label ?? email)}</a>`;
}
