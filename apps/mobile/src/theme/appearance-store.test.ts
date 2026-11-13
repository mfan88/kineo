import type { AppearanceSetting } from "@kineo/shared";
import { describe, expect, it } from "vitest";
import { createAppearanceStore, type AppearanceDevice } from "./appearance-store";

function fakeDevice(saved: string | null) {
  const applied: AppearanceSetting[] = [];
  const written: AppearanceSetting[] = [];
  const device: AppearanceDevice = {
    read: () => saved,
    write: (setting) => {
      written.push(setting);
    },
    apply: (setting) => {
      applied.push(setting);
    },
  };
  return { device, applied, written };
}

describe("createAppearanceStore", () => {
  it("matches the system when nothing is saved, and applies it at once", () => {
    const { device, applied } = fakeDevice(null);
    const store = createAppearanceStore(device);
    expect(store.get()).toBe("system");
    expect(applied).toEqual(["system"]);
  });

  it("starts with the saved choice", () => {
    const { device, applied } = fakeDevice("dark");
    expect(createAppearanceStore(device).get()).toBe("dark");
    expect(applied).toEqual(["dark"]);
  });

  it("ignores a saved value it doesn't know", () => {
    expect(createAppearanceStore(fakeDevice("sepia").device).get()).toBe("system");
  });

  it("saves, applies and announces a new choice", () => {
    const { device, applied, written } = fakeDevice(null);
    const store = createAppearanceStore(device);
    let calls = 0;
    store.subscribe(() => calls++);
    store.set("light");
    expect(store.get()).toBe("light");
    expect(written).toEqual(["light"]);
    expect(applied).toEqual(["system", "light"]);
    expect(calls).toBe(1);
  });

  it("keeps working when the saved file can't be read or written", () => {
    const applied: AppearanceSetting[] = [];
    const store = createAppearanceStore({
      read: () => {
        throw new Error("unreadable");
      },
      write: () => {
        throw new Error("read-only");
      },
      apply: (setting) => {
        applied.push(setting);
      },
    });
    expect(store.get()).toBe("system");
    store.set("dark");
    expect(store.get()).toBe("dark");
    expect(applied).toEqual(["system", "dark"]);
  });
});
