import { describe, expect, it } from "vitest";
import nativeCss from "../src/heroui-native.css?raw";
import css from "../src/heroui.css?raw";
import {
  colors,
  themeColors,
  themeStatusTags,
  statusTagIcons,
  statusTagFor,
  darkColors,
  darkStatusTags,
  font,
  fundingChipIcons,
  invoiceAccents,
  invoiceFonts,
  nativeFontFaces,
  radius,
  shadows,
  statusTags,
} from "../src/index";

/** The value of a CSS custom property in a theme file, lower-cased and trimmed. */
function cssVarIn(source: string, file: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(source);
  if (!match?.[1]) throw new Error(`--${name} is missing from ${file}`);
  return match[1].replace(/\s+/g, " ").trim().toLowerCase();
}

/** The part of a theme file from `start` up to `end` (or the end of the file). */
function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`${start} is missing`);
  const to = end === undefined ? source.length : source.indexOf(end, from);
  if (to < 0) throw new Error(`${end} is missing after ${start}`);
  return source.slice(from, to);
}

const lightCss = section(css, ":root,", ".dark,");
const darkCss = section(css, ".dark,", "body {");
const lightNativeCss = section(nativeCss, "@variant light", "@variant dark");
const darkNativeCss = section(nativeCss, "@variant dark");

const cssVar = (name: string) => cssVarIn(lightCss, "heroui.css (light)", name);
const darkCssVar = (name: string) => cssVarIn(darkCss, "heroui.css (dark)", name);
const nativeVar = (name: string) =>
  cssVarIn(
    name.startsWith("font-") || name.includes("radius") ? nativeCss : lightNativeCss,
    "heroui-native.css (light)",
    name,
  );
const darkNativeVar = (name: string) => cssVarIn(darkNativeCss, "heroui-native.css (dark)", name);

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("design brief palette", () => {
  it("matches docs/design-brief.md, with darker shades for text contrast", () => {
    expect(colors).toMatchObject({
      primary: "#0284C7",
      primaryStrong: "#0369A1",
      primaryStrongHover: "#075985",
      placeholder: "#67676F",
      textOnTint: "#075985",
      tint: "#E0F2FE",
      pageBackground: "#F7FBFF",
      text: "#11181C",
      mutedText: "#71717A",
      border: "#E4E4E7",
      inputFill: "#F4F4F5",
      error: "#B42318",
    });
  });

  it("uses 12–16px corners and Inter", () => {
    expect(radius.md).toBeGreaterThanOrEqual(12);
    expect(radius.lg).toBeLessThanOrEqual(16);
    expect(font.family).toBe("Inter");
  });
});

describe("HeroUI theme matches the tokens", () => {
  it.each([
    ["accent", colors.primaryStrong],
    ["accent-hover", colors.primaryStrongHover],
    ["link", colors.primaryStrong],
    ["field-placeholder", colors.placeholder],
    ["accent-foreground", colors.onPrimary],
    ["accent-soft", colors.tint],
    ["accent-soft-foreground", colors.textOnTint],
    ["focus", colors.primary],
    ["background", colors.pageBackground],
    ["foreground", colors.text],
    ["surface", colors.surface],
    ["overlay", colors.surface],
    ["muted", colors.mutedText],
    ["border", colors.border],
    ["separator", colors.border],
    ["field-background", colors.inputFill],
    ["field-focus", colors.surface],
    ["field-border", colors.inputEdge],
    ["switch-control-bg", colors.controlTrack],
    ["field-border-focus", colors.primary],
    ["danger", colors.error],
    ["danger-foreground", colors.onError],
  ])("--%s is %s", (name, value) => {
    expect(cssVar(name)).toBe(value.toLowerCase());
  });

  it.each([
    ["accent", darkColors.primaryStrong],
    ["accent-hover", darkColors.primaryStrongHover],
    ["accent-foreground", darkColors.onPrimary],
    ["accent-soft", darkColors.tint],
    ["accent-soft-foreground", darkColors.textOnTint],
    ["focus", darkColors.primary],
    ["background", darkColors.pageBackground],
    ["foreground", darkColors.text],
    ["surface", darkColors.surface],
    ["overlay", darkColors.surface],
    ["muted", darkColors.mutedText],
    ["border", darkColors.border],
    ["separator", darkColors.border],
    ["link", darkColors.primaryStrong],
    ["field-background", darkColors.inputFill],
    ["field-placeholder", darkColors.placeholder],
    ["field-focus", darkColors.surface],
    ["field-border", darkColors.inputEdge],
    ["field-border-focus", darkColors.primary],
    ["danger", darkColors.error],
    ["danger-foreground", darkColors.onError],
  ])("dark --%s is %s", (name, value) => {
    expect(darkCssVar(name)).toBe(value.toLowerCase());
  });

  it.each([
    ["default", darkColors.inputFill],
    ["default-hover", darkColors.border],
    ["default-foreground", darkColors.text],
    ["switch-control-bg", darkColors.controlTrack],
  ])("dark neutral --%s is %s", (name, value) => {
    expect(darkCssVar(name)).toBe(value.toLowerCase());
  });

  it("gives dark surfaces a 1px ring instead of a shadow", () => {
    expect(darkCssVar("surface-shadow")).toBe(`0 0 0 1px ${darkColors.inputFill.toLowerCase()}`);
    expect(darkCssVar("overlay-shadow")).toBe(`0 0 0 1px ${darkColors.border.toLowerCase()}`);
  });

  it("uses the token radius", () => {
    expect(cssVar("radius")).toBe(`${radius.md / 16}rem`);
    expect(cssVar("field-radius")).toBe(`${radius.md / 16}rem`);
  });

  it("uses the token font stack and shadows", () => {
    expect(cssVarIn(css, "heroui.css", "font-sans")).toBe(font.stack.toLowerCase());
    expect(cssVar("surface-shadow")).toBe(shadows.card.toLowerCase());
    expect(cssVar("overlay-shadow")).toBe(shadows.overlay.replace("0.10)", "0.1)").toLowerCase());
  });
});

describe("HeroUI Native theme matches the tokens", () => {
  it.each([
    ["accent", colors.primaryStrong],
    ["accent-foreground", colors.onPrimary],
    ["focus", colors.primary],
    ["link", colors.primaryStrong],
    ["background", colors.pageBackground],
    ["foreground", colors.text],
    ["surface", colors.surface],
    ["surface-foreground", colors.text],
    ["overlay", colors.surface],
    ["overlay-foreground", colors.text],
    ["muted", colors.mutedText],
    ["border", colors.border],
    ["separator", colors.border],
    ["field-background", colors.inputFill],
    ["field-foreground", colors.text],
    ["field-placeholder", colors.placeholder],
    ["field-border", colors.inputEdge],
    ["danger", colors.error],
    ["danger-foreground", colors.onError],
  ])("--%s is %s", (name, value) => {
    expect(nativeVar(name)).toBe(value.toLowerCase());
  });

  it.each([
    ["accent", darkColors.primaryStrong],
    ["accent-foreground", darkColors.onPrimary],
    ["focus", darkColors.primary],
    ["link", darkColors.primaryStrong],
    ["background", darkColors.pageBackground],
    ["foreground", darkColors.text],
    ["surface", darkColors.surface],
    ["surface-foreground", darkColors.text],
    ["overlay", darkColors.surface],
    ["overlay-foreground", darkColors.text],
    ["muted", darkColors.mutedText],
    ["border", darkColors.border],
    ["separator", darkColors.border],
    ["field-background", darkColors.inputFill],
    ["field-foreground", darkColors.text],
    ["field-placeholder", darkColors.placeholder],
    ["field-border", darkColors.inputEdge],
    ["danger", darkColors.error],
    ["danger-foreground", darkColors.onError],
    ["default", darkColors.inputFill],
    ["default-foreground", darkColors.text],
  ])("dark --%s is %s", (name, value) => {
    expect(darkNativeVar(name)).toBe(value.toLowerCase());
  });

  it("gives dark surfaces a 1px ring instead of a shadow", () => {
    expect(darkNativeVar("surface-shadow")).toBe(`0 0 0 1px ${darkColors.inputFill.toLowerCase()}`);
    expect(darkNativeVar("overlay-shadow")).toBe(`0 0 0 1px ${darkColors.border.toLowerCase()}`);
  });

  it("uses the token radius and shadows", () => {
    // Inputs 12px; cards and buttons (HeroUI Native's 3xl and 4xl sizes) 16px.
    expect(nativeVar("field-radius")).toBe(`${radius.md / 16}rem`);
    expect(nativeVar("radius-3xl")).toBe(`${radius.lg / 16}rem`);
    expect(nativeVar("radius-4xl")).toBe(`${radius.lg / 16}rem`);
    expect(nativeVar("surface-shadow")).toBe(shadows.card.toLowerCase());
    expect(nativeVar("overlay-shadow")).toBe(
      shadows.overlay.replace("0.10)", "0.1)").toLowerCase(),
    );
  });

  it("uses Inter under the names the app loads it as", () => {
    expect(nativeVar("font-normal")).toBe(`"${nativeFontFaces.normal}"`.toLowerCase());
    expect(nativeVar("font-medium")).toBe(`"${nativeFontFaces.medium}"`.toLowerCase());
    expect(nativeVar("font-semibold")).toBe(`"${nativeFontFaces.semibold}"`.toLowerCase());
    expect(nativeVar("font-bold")).toBe(`"${nativeFontFaces.bold}"`.toLowerCase());
  });

  it("has every colour as a plain hex value, never a copy of another theme", () => {
    const colourVars = [...nativeCss.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map((m) =>
      m[2]?.toUpperCase(),
    );
    const tokenValues = new Set(
      [...Object.values(colors), ...Object.values(darkColors)].map((v) => v.toUpperCase()),
    );
    expect(colourVars.length).toBeGreaterThan(10);
    for (const value of colourVars) expect(tokenValues.has(value ?? "")).toBe(true);
  });
});

describe("text contrast is at least 4.5:1", () => {
  it.each([
    ["text on page", colors.text, colors.pageBackground],
    ["muted text on page", colors.mutedText, colors.pageBackground],
    ["placeholder on input fill", colors.placeholder, colors.inputFill],
    ["text on tint", colors.textOnTint, colors.tint],
    ["button text on primary", colors.onPrimary, colors.primaryStrong],
    ["button text on primary hover", colors.onPrimary, colors.primaryStrongHover],
    ["error on page", colors.error, colors.pageBackground],
    ["link on page", colors.primaryStrong, colors.pageBackground],
    ["link on card", colors.primaryStrong, colors.surface],
    ["error on error tint", colors.error, colors.errorTint],
  ])("%s", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("input edge, switch track and funding chip", () => {
  const palettes = [
    ["light", colors],
    ["dark", darkColors],
  ] as const;

  it.each(palettes)("%s input border reaches 3:1 on every surface an input sits on", (_n, p) => {
    for (const background of [p.surface, p.inputFill, p.pageBackground]) {
      expect(contrast(p.inputEdge, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(palettes)("%s funding chip text reaches 4.5:1 on page and surface", (_n, p) => {
    for (const background of [p.surface, p.pageBackground]) {
      expect(contrast(p.chipText, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["light", colors, "#FFFFFF"],
    ["dark", darkColors, darkColors.text],
  ] as const)("%s switch knob reaches 3:1 on the off track", (_n, p, knob) => {
    expect(contrast(knob, p.controlTrack)).toBeGreaterThanOrEqual(3);
  });

  it.each(palettes)("%s switch off track reaches 3:1 on a card", (_n, p) => {
    expect(contrast(p.controlTrack, p.surface)).toBeGreaterThanOrEqual(3);
  });

  it("uses one edge colour for inputs and switches", () => {
    expect(colors.controlTrack).toBe(colors.inputEdge);
    expect(darkColors.controlTrack).toBe(darkColors.inputEdge);
  });

  it("draws the funding chip icons as stroke paths", () => {
    expect(Object.keys(fundingChipIcons)).toEqual(["funding", "selfPay", "ended"]);
    expect(fundingChipIcons.funding.paths).toHaveLength(1);
    expect(fundingChipIcons.selfPay.circles).toEqual([{ cx: 12, cy: 8, r: 4, dashed: false }]);
    expect(fundingChipIcons.ended.viewBox).toBe("0 0 16 16");
    expect(fundingChipIcons.ended.circles.every((circle) => circle.dashed)).toBe(true);
  });
});

describe("status tags", () => {
  it("covers visit and invoice states plus errors", () => {
    expect(Object.keys(statusTags)).toEqual([
      "notInvoiced",
      "draft",
      "sent",
      "paid",
      "cancelled",
      "error",
    ]);
  });

  it.each(Object.values(statusTags))("$label text reaches 4.5:1 on its tag", (tag) => {
    expect(contrast(tag.text, tag.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("tells Cancelled from Not invoiced by its word and icon as well as its grey", () => {
    expect(statusTags.cancelled.label).toBe("Cancelled");
    expect(statusTagIcons.cancelled).not.toEqual(statusTagIcons.notInvoiced);
    expect(darkStatusTags.cancelled.background).not.toBe(darkStatusTags.notInvoiced.background);
  });

  it("gives each tag its own background", () => {
    const backgrounds = Object.values(statusTags).map((tag) => tag.background);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });
});

describe("dark palette", () => {
  it("has every role the light palette has", () => {
    expect(Object.keys(darkColors).toSorted()).toEqual(Object.keys(colors).toSorted());
    expect(Object.keys(darkStatusTags)).toEqual(Object.keys(statusTags));
  });

  it.each([
    ["text on page", darkColors.text, darkColors.pageBackground],
    ["text on card", darkColors.text, darkColors.surface],
    ["muted text on page", darkColors.mutedText, darkColors.pageBackground],
    ["muted text on card", darkColors.mutedText, darkColors.surface],
    ["placeholder on input fill", darkColors.placeholder, darkColors.inputFill],
    ["text on tint", darkColors.textOnTint, darkColors.tint],
    ["button text on primary", darkColors.onPrimary, darkColors.primaryStrong],
    ["button text on primary hover", darkColors.onPrimary, darkColors.primaryStrongHover],
    ["error on card", darkColors.error, darkColors.surface],
    ["error on error tint", darkColors.error, darkColors.errorTint],
    ["text on error", darkColors.onError, darkColors.error],
    ["link on page", darkColors.primaryStrong, darkColors.pageBackground],
    ["link on card", darkColors.primaryStrong, darkColors.surface],
  ])("%s reaches 4.5:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["focus ring on card", darkColors.primary, darkColors.surface],
    ["focus ring on input fill", darkColors.primary, darkColors.inputFill],
    ["primary button on page", darkColors.primaryStrong, darkColors.pageBackground],
    ["switch track on card", darkColors.controlTrack, darkColors.surface],
  ])("%s reaches 3:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.values(darkStatusTags))("$label text reaches 4.5:1 on its tag", (tag) => {
    expect(contrast(tag.text, tag.background)).toBeGreaterThanOrEqual(4.5);
  });
});

const tagCssName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("status tags and toasts in the desktop theme", () => {
  it.each(Object.entries(statusTags))("light %s tag matches statusTags", (key, tag) => {
    expect(cssVar(`tag-${tagCssName(key)}-fg`)).toBe(tag.text.toLowerCase());
    expect(cssVar(`tag-${tagCssName(key)}-bg`)).toBe(tag.background.toLowerCase());
  });

  it.each(Object.entries(darkStatusTags))("dark %s tag matches darkStatusTags", (key, tag) => {
    expect(darkCssVar(`tag-${tagCssName(key)}-fg`)).toBe(tag.text.toLowerCase());
    expect(darkCssVar(`tag-${tagCssName(key)}-bg`)).toBe(tag.background.toLowerCase());
  });

  it("makes toasts inverse, with a readable action, in both modes", () => {
    expect(cssVar("toast-bg")).toBe(colors.text.toLowerCase());
    expect(cssVar("toast-fg")).toBe(colors.pageBackground.toLowerCase());
    expect(cssVar("toast-action")).toBe(darkColors.primaryStrong.toLowerCase());
    expect(cssVar("toast-action-fg")).toBe(darkColors.onPrimary.toLowerCase());
    expect(darkCssVar("toast-bg")).toBe(darkColors.text.toLowerCase());
    expect(darkCssVar("toast-fg")).toBe(darkColors.pageBackground.toLowerCase());
    expect(darkCssVar("toast-action")).toBe(colors.primaryStrong.toLowerCase());
    expect(darkCssVar("toast-action-fg")).toBe(colors.onPrimary.toLowerCase());
    expect(contrast(colors.pageBackground, colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColors.primaryStrong, colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.primaryStrong, darkColors.text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("statusTagFor", () => {
  it("maps each state to its tag", () => {
    expect(statusTagFor("uninvoiced")).toBe("notInvoiced");
    expect(statusTagFor("draft")).toBe("draft");
    expect(statusTagFor("sent")).toBe("sent");
    expect(statusTagFor("paid")).toBe("paid");
    expect(statusTagFor("cancelled")).toBe("cancelled");
  });
});

describe("inverse toasts on the phone", () => {
  it("draws toasts in the text colour with page-coloured words", () => {
    const toastCss = section(nativeCss, "@layer components");
    expect(toastCss).toMatch(/\.toast__root \{\s*background-color: var\(--color-foreground\);/);
    for (const variant of ["default", "accent", "success", "warning", "danger"]) {
      expect(toastCss).toContain(`.toast__label--variant-${variant}`);
    }
    expect(toastCss).toContain("color: var(--color-background);");
  });
});

describe("status tag icons", () => {
  it("gives every tag an icon", () => {
    expect(Object.keys(statusTagIcons)).toEqual(Object.keys(statusTags));
    for (const icon of Object.values(statusTagIcons)) {
      expect(icon.circle !== null || icon.path !== null).toBe(true);
    }
  });
});

describe("theme lookup", () => {
  it("maps each appearance to its palette and tags", () => {
    expect(themeColors.light).toBe(colors);
    expect(themeColors.dark).toBe(darkColors);
    expect(themeStatusTags.light).toBe(statusTags);
    expect(themeStatusTags.dark).toBe(darkStatusTags);
  });
});

describe("invoice style", () => {
  it("has the five accents from the design brief", () => {
    expect(Object.values(invoiceAccents).map((accent) => accent.label)).toEqual([
      "Sky",
      "Forest",
      "Ocean",
      "Plum",
      "Charcoal",
    ]);
  });

  it.each(Object.values(invoiceAccents))("$label text reaches 4.5:1 on a white page", ({ hex }) => {
    expect(contrast(hex, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("has the three fonts from the design brief, Clean being the app's Inter", () => {
    expect(Object.values(invoiceFonts).map((f) => f.label)).toEqual(["Clean", "Serif", "Nunito"]);
    expect(invoiceFonts.clean.stack).toBe(font.stack);
    expect(invoiceFonts.nunito.stack.startsWith('"Nunito Variable"')).toBe(true);
  });
});
