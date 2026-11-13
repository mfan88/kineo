import type { ColorScheme } from "@kineo/tokens";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The parts of `matchMedia`'s result this uses. */
export interface AppearanceMedia {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/** Sets HeroUI's theme attribute (and class) on the root element. */
export function applyColorScheme(root: HTMLElement, scheme: ColorScheme): void {
  root.dataset.theme = scheme;
  root.classList.toggle("dark", scheme === "dark");
  root.classList.toggle("light", scheme === "light");
}

/**
 * Keeps the app's light or dark theme in step with the system appearance, now and
 * whenever it changes. Returns a function that stops following it.
 */
export function followSystemAppearance(
  root: HTMLElement = document.documentElement,
  media: AppearanceMedia = window.matchMedia(DARK_QUERY),
): () => void {
  const update = () => applyColorScheme(root, media.matches ? "dark" : "light");
  update();
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
