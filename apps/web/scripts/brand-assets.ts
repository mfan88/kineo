/**
 * Builds the website's brand assets from docs/brand.md and copies the self-hosted
 * fonts. Run with `pnpm --filter @kineo/web assets`; the output is committed.
 *
 * Writes to apps/web/public:
 *   favicon.svg, favicon-32.png, apple-touch-icon.png (180 px), og.png (1200×630),
 *   fonts/*.woff2 (Sora 600, Inter 400 and 600; Latin and Latin Extended)
 *
 * Icons are rendered with resvg; og.png (which has text) with headless Chrome.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../public");
const require = createRequire(import.meta.url);
const fontSource = (pkg: string) =>
  join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)), "files");

// Brand palette (docs/brand.md).
const DEEP = "#075985";
const SKY = "#0284C7";
const TINT = "#E0F2FE";
const TILE_EDGE = "#BAE6FD";
const WHITE = "#FFFFFF";

/** The mark (ring + macron bar) in its 100×100 box, as in docs/brand.md. */
const MARK = `<circle cx="50" cy="61" r="19" stroke="${DEEP}" stroke-width="12" fill="none"/>
<path d="M36 26 H64" stroke="${SKY}" stroke-width="8" stroke-linecap="round" fill="none"/>`;

/** A tile with the mark filling about 66% of it. */
function tile(x: number, y: number, size: number, fill: string, radius = size * 0.2237): string {
  const mark = size * 0.66;
  const inset = (size - mark) / 2;
  return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" rx="${radius}" fill="${fill}" stroke="${TILE_EDGE}" stroke-width="1"/>
<g transform="translate(${x + inset} ${y + inset}) scale(${mark / 100})">${MARK}</g>`;
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

mkdirSync(join(publicDir, "fonts"), { recursive: true });

// Favicon: the tint tile, scalable.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${tile(0, 0, 100, TINT)}</svg>\n`;
writeFileSync(join(publicDir, "favicon.svg"), favicon);
writeFileSync(join(publicDir, "favicon-32.png"), png(favicon, 32));

// Apple touch icon: full-bleed square (iOS applies its own mask).
const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${TINT}"/><g transform="translate(17 17) scale(0.66)">${MARK}</g></svg>`;
writeFileSync(join(publicDir, "apple-touch-icon.png"), png(touch, 180));

// Self-hosted fonts.
const fonts: [string, string][] = [
  ["sora", "sora-latin-600-normal.woff2"],
  ["sora", "sora-latin-ext-600-normal.woff2"],
  ["inter", "inter-latin-400-normal.woff2"],
  ["inter", "inter-latin-ext-400-normal.woff2"],
  ["inter", "inter-latin-600-normal.woff2"],
  ["inter", "inter-latin-ext-600-normal.woff2"],
];
for (const [pkg, file] of fonts) {
  copyFileSync(join(fontSource(pkg), file), join(publicDir, "fonts", file));
}

// Social preview: the lockup centred on the tint background. Drawn as HTML with the
// site's own brand.css and fonts, and screenshotted by headless Chrome, so it matches
// the website exactly. Set CHROME_PATH if Chrome isn't in the default macOS location.
const chrome =
  process.env["CHROME_PATH"] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(chrome)) {
  const css = readFileSync(resolve(here, "../src/styles/brand.css"), "utf8").replaceAll(
    'url("/fonts/',
    `url("${pathToFileURL(join(publicDir, "fonts")).href}/`,
  );
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
html, body { margin: 0; width: 1200px; height: 630px; background: ${TINT}; }
body { display: grid; place-items: center; }
.lockup { font-size: 132px; }
.lockup__icon { border-radius: 22%; }
</style></head><body>
<span class="lockup"><img class="lockup__icon" alt="" src="data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${tile(0, 0, 100, WHITE)}</svg>`,
  )}"><span class="wordmark">kine<span class="wordmark__o">o</span></span></span>
</body></html>`;
  const work = mkdtempSync(join(tmpdir(), "kineo-og-"));
  const html = join(work, "og.html");
  writeFileSync(html, page);
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      `--screenshot=${join(publicDir, "og.png")}`,
      pathToFileURL(html).href,
    ],
    { stdio: "ignore" },
  );
  rmSync(work, { recursive: true, force: true });
} else {
  process.stderr.write(`Chrome not found at ${chrome}; og.png left as it was.\n`);
}

process.stdout.write("Brand assets written to apps/web/public.\n");
