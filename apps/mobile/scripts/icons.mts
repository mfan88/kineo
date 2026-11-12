/**
 * Draws the phone app's icons and launch images from docs/brand.md. Run with
 * `pnpm --filter @kineo/mobile icons`; the output in apps/mobile/assets is committed.
 *
 *   icon.png                       iOS: full-bleed 1024 px tint square (iOS applies the mask)
 *   android-icon-foreground.png    Android adaptive foreground, 432 px (108 dp at 4×),
 *                                  the mark inside the 72 dp safe zone; the background
 *                                  layer is the colour #E0F2FE in app.json
 *   android-icon-monochrome.png    Android themed icon: the mark in one colour (Android
 *                                  tints it, e.g. #0C4A6E on #BAE6FD)
 *   splash.png                     iOS launch screen: icon on a white tile, wordmark below
 *   splash-android.png             Android launch screen: the white tile only (Android 12+
 *                                  shows the launch image inside a circle, which would
 *                                  cut off a wordmark)
 *
 * Icons are rendered with resvg. splash.png has text, so it's drawn as HTML with the
 * website's brand.css (Sora, and the macron as a separate bar) and screenshotted by
 * headless Chrome. Set CHROME_PATH if Chrome isn't in the default macOS location.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, "../assets");
const require = createRequire(import.meta.url);

// Brand palette (docs/brand.md).
const DEEP = "#075985";
const SKY = "#0284C7";
const TINT = "#E0F2FE";
const TILE_EDGE = "#BAE6FD";
const WHITE = "#FFFFFF";

/** The mark (ring + macron bar) in its 100×100 box, as in docs/brand.md. */
const mark = (ring = DEEP, bar = SKY) =>
  `<circle cx="50" cy="61" r="19" stroke="${ring}" stroke-width="12" fill="none"/>
<path d="M36 26 H64" stroke="${bar}" stroke-width="8" stroke-linecap="round" fill="none"/>`;

/** The mark scaled to `size`, centred in a square canvas of `canvas`. */
const centredMark = (canvas: number, size: number, ring?: string, bar?: string) =>
  `<g transform="translate(${(canvas - size) / 2} ${(canvas - size) / 2}) scale(${size / 100})">${mark(ring, bar)}</g>`;

/** A white tile with its edge and the mark filling about 66% of it. */
const whiteTile = (x: number, y: number, size: number) =>
  `<rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${size * 0.2237}" fill="${WHITE}" stroke="${TILE_EDGE}" stroke-width="2"/>
<g transform="translate(${x + size * 0.17} ${y + size * 0.17}) scale(${(size * 0.66) / 100})">${mark()}</g>`;

const svg = (size: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

function write(name: string, source: string, width: number) {
  const png = new Resvg(source, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  writeFileSync(join(assets, name), png);
  process.stdout.write(`Wrote assets/${name}\n`);
}

// iOS: full-bleed tint square, the mark filling about 66% of it.
write(
  "icon.png",
  svg(1024, `<rect width="1024" height="1024" fill="${TINT}"/>${centredMark(1024, 676)}`),
  1024,
);

// Android adaptive foreground: 108 dp canvas, visible area 72 dp (the safe zone), so the
// mark is 66% of 72 dp, as on the other platforms' tiles.
const FOREGROUND = 432;
const SAFE = FOREGROUND * (72 / 108);
write(
  "android-icon-foreground.png",
  svg(FOREGROUND, centredMark(FOREGROUND, SAFE * 0.66)),
  FOREGROUND,
);
write(
  "android-icon-monochrome.png",
  svg(FOREGROUND, centredMark(FOREGROUND, SAFE * 0.66, "#000000", "#000000")),
  FOREGROUND,
);

// Android launch image: 240 dp at 4×; Android shows a 160 dp circle of it, and the
// 110 dp tile's rounded corners stay inside that circle.
const ANDROID_SPLASH = 960;
const ANDROID_TILE = ANDROID_SPLASH * (110 / 240);
write(
  "splash-android.png",
  svg(
    ANDROID_SPLASH,
    whiteTile(
      (ANDROID_SPLASH - ANDROID_TILE) / 2,
      (ANDROID_SPLASH - ANDROID_TILE) / 2,
      ANDROID_TILE,
    ),
  ),
  ANDROID_SPLASH,
);

// iOS launch image: a 120 pt white tile with the 56 pt wordmark below, on a transparent
// 240 × 240 pt canvas (app.json sets imageWidth 240 and the tint background), at 4×.
const chrome =
  process.env["CHROME_PATH"] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) {
  throw new Error(`Chrome not found at ${chrome}. Set CHROME_PATH to draw splash.png.`);
}
const fonts = join(dirname(require.resolve("@fontsource/sora/package.json")), "files");
const css = readFileSync(resolve(here, "../../web/src/styles/brand.css"), "utf8").replaceAll(
  'url("/fonts/',
  `url("${pathToFileURL(fonts).href}/`,
);
const tileImage = `data:image/svg+xml,${encodeURIComponent(svg(120, whiteTile(0, 0, 120)))}`;
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
html, body { margin: 0; width: 240px; height: 240px; background: transparent; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
img { width: 120px; height: 120px; }
.wordmark { font-size: 44px; }
</style></head><body>
<img alt="" src="${tileImage}"><span class="wordmark">kine<span class="wordmark__o">o</span></span>
</body></html>`;
const work = mkdtempSync(join(tmpdir(), "kineo-splash-"));
try {
  const html = join(work, "splash.html");
  const shot = join(work, "splash.png");
  writeFileSync(html, page);
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      "--force-device-scale-factor=4",
      "--window-size=240,240",
      "--virtual-time-budget=2000",
      `--screenshot=${shot}`,
      pathToFileURL(html).href,
    ],
    { stdio: "ignore" },
  );
  copyFileSync(shot, join(assets, "splash.png"));
  process.stdout.write("Wrote assets/splash.png\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
