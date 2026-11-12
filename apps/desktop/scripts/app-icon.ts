/**
 * Draws the desktop app icon from docs/brand.md and renders it to
 * src-tauri/icons/app-icon.png (1024 px); `pnpm --filter @kineo/desktop icon` then
 * runs `tauri icon` on it to write every size the desktop app needs (the output is
 * committed) and removes the Android and iOS sets it also writes (the phone app is
 * Expo, with its own icons).
 *
 * macOS shape: a 1024 px canvas with an ~824 px rounded tile and a soft shadow; the
 * mark (ring + macron bar) fills about 66% of the tile.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../src-tauri/icons/app-icon.png");

// Brand palette (docs/brand.md).
const DEEP = "#075985";
const SKY = "#0284C7";
const TINT = "#E0F2FE";
const TILE_EDGE = "#BAE6FD";

const CANVAS = 1024;
const TILE = 824;
const OFFSET = (CANVAS - TILE) / 2;
const RADIUS = TILE * 0.2237;
const MARK = TILE * 0.66;
const MARK_OFFSET = OFFSET + (TILE - MARK) / 2;

/** The mark in its 100×100 box, exactly as in docs/brand.md. */
const mark = `<circle cx="50" cy="61" r="19" stroke="${DEEP}" stroke-width="12" fill="none"/>
<path d="M36 26 H64" stroke="${SKY}" stroke-width="8" stroke-linecap="round" fill="none"/>`;

export const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
<defs>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0B2A3C" flood-opacity="0.18"/>
  </filter>
</defs>
<rect x="${OFFSET + 2}" y="${OFFSET + 2}" width="${TILE - 4}" height="${TILE - 4}" rx="${RADIUS}" fill="${TINT}" stroke="${TILE_EDGE}" stroke-width="4" filter="url(#shadow)"/>
<g transform="translate(${MARK_OFFSET} ${MARK_OFFSET}) scale(${MARK / 100})">${mark}</g>
</svg>`;

const png = new Resvg(appIconSvg, {
  fitTo: { mode: "width", value: CANVAS },
  font: { loadSystemFonts: false },
})
  .render()
  .asPng();
writeFileSync(output, png);
process.stdout.write(`Wrote ${output}\n`);
