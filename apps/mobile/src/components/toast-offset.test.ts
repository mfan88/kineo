import { beforeEach, describe, expect, it } from "vitest";
import { resetToastAnchor, setToastAnchor, TOAST_GAP, toastBottom } from "./toast-offset";

beforeEach(() => resetToastAnchor());

describe("setToastAnchor", () => {
  it("starts unmeasured", () => {
    expect(toastBottom()).toBeNull();
  });

  it("puts toasts the gap above the pinned area's top", () => {
    // A 874 pt window whose pinned button starts 146 pt from the bottom.
    setToastAnchor(728, 874);
    expect(toastBottom()).toBe(146 + TOAST_GAP);
  });

  it("rounds to whole points", () => {
    setToastAnchor(727.6, 874);
    expect(toastBottom()).toBe(Math.round(874 - 727.6 + TOAST_GAP));
  });

  it("ignores a screen that isn't laid out yet", () => {
    setToastAnchor(700, 874);
    setToastAnchor(0, 874);
    setToastAnchor(-20, 874);
    expect(toastBottom()).toBe(174 + TOAST_GAP);
  });

  it("ignores an anchor at or below the window's bottom", () => {
    setToastAnchor(874, 874);
    setToastAnchor(900, 874);
    expect(toastBottom()).toBeNull();
  });

  it("follows the screen in front as it changes", () => {
    setToastAnchor(728, 874);
    setToastAnchor(790, 874);
    expect(toastBottom()).toBe(84 + TOAST_GAP);
  });
});
