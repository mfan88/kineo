import { describe, expect, it } from "vitest";
import { contactLink, lockup, renderPage } from "./layout.ts";
import { parsePageHeader } from "./plugin.ts";

describe("renderPage", () => {
  const html = renderPage(
    { path: "/download/", title: "Download", description: "Get the apps." },
    "<h1>Download</h1>",
  );

  it("sets the title, description, canonical URL and Open Graph tags", () => {
    expect(html).toContain("<title>Download · Kineō</title>");
    expect(html).toContain('<meta name="description" content="Get the apps." />');
    expect(html).toContain('<link rel="canonical" href="[SITE URL]/download/" />');
    expect(html).toContain('<meta property="og:image" content="[SITE URL]/og.png" />');
    expect(html).toContain('<html lang="en-CA">');
  });

  it("uses the site name and tagline on Home", () => {
    const home = renderPage({ path: "/" }, "<h1>Home</h1>");
    expect(home).toContain(
      "<title>Kineō: Simple notes and invoicing for physiotherapists.</title>",
    );
  });

  it("puts a skip link first, pointing at the main content", () => {
    const body = html.slice(html.indexOf("<body>"));
    expect(body.indexOf('class="skip-link" href="#main"')).toBeLessThan(body.indexOf("<header"));
    expect(html).toContain('<main id="main" tabindex="-1">');
  });

  it("marks the current page in the navigation", () => {
    expect(html).toContain('<a href="/download/" aria-current="page">Download</a>');
    expect(html).toContain('<a href="/privacy/">Privacy</a>');
  });

  it("has the copyright line and colour variables from @kineo/tokens", () => {
    expect(html).toContain("© 2026 Marcus Fan");
    expect(html).toContain("--color-action: #0369A1;");
    expect(html).toContain("--color-sky: #0284C7;");
  });

  it("keeps a noindex page out of search results, without a canonical URL", () => {
    const notFound = renderPage({ path: "/404.html", noindex: true }, "");
    expect(notFound).toContain('<meta name="robots" content="noindex" />');
    expect(notFound).not.toContain('rel="canonical"');
  });

  it("escapes page text", () => {
    const tricky = renderPage({ path: "/", title: 'A "quoted" <title>' }, "");
    expect(tricky).toContain("<title>A &quot;quoted&quot; &lt;title&gt; · Kineō</title>");
  });
});

describe("lockup", () => {
  it("draws the macron over a plain o, never the ō character", () => {
    const markup = lockup();
    expect(markup).toContain('kine<span class="wordmark__o">o</span>');
    expect(markup).not.toContain("ō");
    expect(markup).toContain('alt=""');
  });
});

describe("contactLink", () => {
  it("shows the placeholder until the contact email is set", () => {
    expect(contactLink()).toBe('<span class="placeholder">[CONTACT EMAIL]</span>');
  });
});

describe("parsePageHeader", () => {
  it("reads the path, title and description", () => {
    const { meta, body } = parsePageHeader(
      '<!-- page path="/terms/" title="Terms" description="The rules." -->\n<h1>Terms</h1>',
    );
    expect(meta).toEqual({ path: "/terms/", title: "Terms", description: "The rules." });
    expect(body).toBe("<h1>Terms</h1>");
  });

  it("refuses a page without a header or path", () => {
    expect(() => parsePageHeader("<h1>No header</h1>")).toThrow(/must start with/);
    expect(() => parsePageHeader('<!-- page title="X" -->')).toThrow(/needs a path/);
  });
});
