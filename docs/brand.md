# Kineō brand guide

## Idea

The ō is the whole brand: a joint (the ring) with the line of movement above it (the macron). Calm, clear, out of the way.

- Tagline: "Simple notes and invoicing for physiotherapists."
- Headline: "Less paperwork, more patients."

## Wordmark

- Lowercase **kineō**, Sora 600, letter-spacing -0.02em, line-height 1.
- Built as "kine" + "o", with the macron drawn as a separate rounded bar. Never use the font's built-in ō glyph.
  - Bar: inset 10% of the o's width on the left and right, top 0.12em, height 0.085em, fully rounded.
- Colours:
  - On light: text `#075985`, bar `#0284C7`
  - On dark (`#0B2A3C`): text `#FFFFFF`, bar `#38BDF8`
  - On brand blue (`#0284C7`): text `#FFFFFF`, bar `#BAE6FD`
- Minimum height 20 px. Clear space: one ō-width on every side.

## Icon

- Tile: `#E0F2FE` with a 1px `#BAE6FD` edge.
- Mark (100×100 viewBox, round line caps):

  ```svg
  <svg viewBox="0 0 100 100" fill="none" stroke-linecap="round">
    <circle cx="50" cy="61" r="19" stroke="#075985" stroke-width="12"/>
    <path d="M36 26 H64" stroke="#0284C7" stroke-width="8"/>
  </svg>
  ```

- The mark fills about 66% of the tile.
- Dark variant: tile `#0B2A3C`, ring `#FFFFFF`, bar `#38BDF8`.
- Android themed (monochrome): `#0C4A6E` mark on `#BAE6FD`.
- Platform shapes:
  - **iOS:** full-bleed 1024 px square with no rounded corners (iOS applies the mask).
  - **macOS:** 1024 px canvas with an ~824 px rounded tile and a soft shadow.
  - **Windows:** lightly rounded tile; `.ico` with 16, 24, 32, 48, 64 and 256 px sizes.
  - **Android:** adaptive icon with a 108 dp foreground (mark within the 72 dp safe zone), a `#E0F2FE` background layer and a monochrome layer.

## Lockup

Icon tile and wordmark side by side. Gap ≈ 0.28 × wordmark size; tile ≈ 1.15 × wordmark size. Default for the website header, About screen and documents.

## Colour

| Name             | Hex       | Use                                   |
| ---------------- | --------- | ------------------------------------- |
| Deep             | `#075985` | Wordmark, ring, headings              |
| Sky              | `#0284C7` | Macron, icons, focus rings (not text) |
| Sky strong       | `#0369A1` | Buttons and links (4.5:1 for text)    |
| Sky strong hover | `#075985` | Pressed and hover states              |
| Light sky        | `#38BDF8` | Accents on dark                       |
| Tint             | `#E0F2FE` | Icon tile, highlights                 |
| Mist             | `#F7FBFF` | App background                        |
| Ink              | `#11181C` | Body text                             |
| Night            | `#0B2A3C` | Dark surfaces                         |

Supporting: `#BAE6FD` (tile edge, bar on blue), `#075985` (text on tint), `#71717A` (muted text), `#E4E4E7` (borders), `#B42318` (errors).

## Typography

- Brand and marketing: Sora 600.
- App UI: Inter 400 and 600.

## Usage

- **Launch screen:** pale sky (`#E0F2FE`) background, icon on a white tile, wordmark below.
- **Desktop app:** "Kineō" in the title bar; the wordmark (24 px) pinned in the window's top-left corner with 24 px padding on every screen except Settings. In Settings and its screens it moves to the bottom middle (20 px), with Terms and Privacy links underneath that open getkineo.work in the browser. No icon tile inside the app.
- **Invoices:** the practitioner's name and branding lead; Kineō appears only as a small "Made with kineō" footer.
- **App stores:** pale icon, title "Kineō", subtitle "Notes and invoicing for physios", category Medical.
- **Social and GitHub avatar:** the mark on a `#E0F2FE` circle.
- **Website:** lockup in the header, Sora headline on the tint background.

## Avoid

- Using the font's built-in ō instead of the drawn bar.
- Colours outside the palette.
- Stretching or squashing the logo.
- The deep-blue ring on a sky-blue tile (low contrast).
