import { describe, expect, it } from "vitest";
import { applyColorScheme, followSystemAppearance, type AppearanceMedia } from "./appearance";

/** A stand-in for matchMedia's result whose `matches` can be flipped. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media: AppearanceMedia & { matches: boolean } = {
    matches,
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  const change = (next: boolean) => {
    media.matches = next;
    for (const listener of listeners) listener();
  };
  return { media, change, listeners };
}

describe("applyColorScheme", () => {
  it("sets HeroUI's theme attribute and class", () => {
    const root = document.createElement("html");
    applyColorScheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    applyColorScheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("light")).toBe(true);
  });
});

describe("followSystemAppearance", () => {
  it("starts with the system appearance and follows its changes", () => {
    const root = document.createElement("html");
    const { media, change } = fakeMedia(true);
    followSystemAppearance(root, media);
    expect(root.dataset.theme).toBe("dark");
    change(false);
    expect(root.dataset.theme).toBe("light");
  });

  it("stops following once cleaned up", () => {
    const root = document.createElement("html");
    const { media, change, listeners } = fakeMedia(false);
    const stop = followSystemAppearance(root, media);
    stop();
    expect(listeners.size).toBe(0);
    change(true);
    expect(root.dataset.theme).toBe("light");
  });
});
