import { useSyncExternalStore } from "react";

/**
 * Where toasts sit: this far up from the bottom of the window, which is the top of the
 * screen-in-front's pinned primary button (or of the tab bar when it has none), plus a
 * small gap (storyboard: the toast sits just above the primary button). Screens measure
 * it (components/screen.tsx); the root layout hands it to HeroUI Native's toasts.
 *
 * Measured rather than fixed, because the tab bar and the button grow with the
 * phone's text size.
 */

/** Space between a toast and the button under it. */
export const TOAST_GAP = 8;

let bottom: number | null = null;
const listeners = new Set<() => void>();

/**
 * Records where the screen in front's pinned area starts: `top` is its y in the window,
 * `windowHeight` the window's height. Ignores measurements that make no sense (a screen
 * not laid out yet reports 0 or less).
 */
export function setToastAnchor(top: number, windowHeight: number): void {
  if (!(top > 0) || !(windowHeight > top)) return;
  const next = Math.round(windowHeight - top + TOAST_GAP);
  if (next === bottom) return;
  bottom = next;
  for (const listener of listeners) listener();
}

/** The toast's distance from the bottom of the window, or null until a screen has measured. */
export function toastBottom(): number | null {
  return bottom;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `toastBottom()`, re-rendering when a screen measures a new place. */
export function useToastBottom(): number | null {
  return useSyncExternalStore(subscribe, toastBottom, toastBottom);
}

/** For tests: forget the measured place. */
export function resetToastAnchor(): void {
  bottom = null;
  for (const listener of listeners) listener();
}
