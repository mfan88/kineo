import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  applyColorScheme,
  createAppearance,
  type AppearanceMedia,
  type AppearanceStorage,
} from "./appearance";

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
  return { media, change };
}

function fakeStorage(initial: Record<string, string> = {}): AppearanceStorage & {
  values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
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

describe("createAppearance", () => {
  it("matches the system by default and follows its changes", () => {
    const root = document.createElement("html");
    const { media, change } = fakeMedia(true);
    const appearance = createAppearance(root, media, fakeStorage());
    expect(appearance.get()).toEqual({ setting: "system", systemIsDark: true });
    expect(root.dataset.theme).toBe("dark");
    change(false);
    expect(root.dataset.theme).toBe("light");
  });

  it("uses the saved choice whatever the system shows", () => {
    const root = document.createElement("html");
    const { media, change } = fakeMedia(false);
    createAppearance(root, media, fakeStorage({ [APPEARANCE_STORAGE_KEY]: "dark" }));
    expect(root.dataset.theme).toBe("dark");
    change(true);
    change(false);
    expect(root.dataset.theme).toBe("dark");
  });

  it("saves a new choice, applies it and tells subscribers", () => {
    const root = document.createElement("html");
    const storage = fakeStorage();
    const appearance = createAppearance(root, fakeMedia(true).media, storage);
    let calls = 0;
    appearance.subscribe(() => calls++);
    appearance.set("light");
    expect(storage.values[APPEARANCE_STORAGE_KEY]).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(appearance.get().setting).toBe("light");
    expect(calls).toBe(1);
  });

  it("falls back to matching the system when storage can't be read or written", () => {
    const root = document.createElement("html");
    const broken: AppearanceStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const appearance = createAppearance(root, fakeMedia(true).media, broken);
    expect(appearance.get().setting).toBe("system");
    appearance.set("light");
    expect(root.dataset.theme).toBe("light");
  });
});
