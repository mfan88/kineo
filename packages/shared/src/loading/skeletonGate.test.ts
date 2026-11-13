import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSkeletonGate } from "./skeletonGate";

function setup() {
  const changes: boolean[] = [];
  const gate = createSkeletonGate((visible) => changes.push(visible), { now: () => Date.now() });
  return { gate, changes };
}

describe("createSkeletonGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts hidden", () => {
    expect(setup().gate.isVisible()).toBe(false);
  });

  it("stays hidden when loading finishes within 300 ms", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    vi.advanceTimersByTime(299);
    expect(gate.isVisible()).toBe(false);
    gate.setLoading(false);
    vi.advanceTimersByTime(1000);
    expect(gate.isVisible()).toBe(false);
    expect(changes).toEqual([]);
  });

  it("shows after 300 ms of waiting", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    vi.advanceTimersByTime(300);
    expect(gate.isVisible()).toBe(true);
    expect(changes).toEqual([true]);
  });

  it("keeps a shown skeleton for at least 400 ms", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(100);
    gate.setLoading(false);
    expect(gate.isVisible()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(gate.isVisible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(gate.isVisible()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("hides at once when it has already been shown long enough", () => {
    const { gate } = setup();
    gate.setLoading(true);
    vi.advanceTimersByTime(300 + 400);
    gate.setLoading(false);
    expect(gate.isVisible()).toBe(false);
  });

  it("stays visible if loading starts again while the skeleton is held", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    vi.advanceTimersByTime(300);
    gate.setLoading(false);
    gate.setLoading(true);
    vi.advanceTimersByTime(2000);
    expect(gate.isVisible()).toBe(true);
    expect(changes).toEqual([true]);
  });

  it("ignores repeated calls with the same value", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    gate.setLoading(true);
    vi.advanceTimersByTime(300);
    expect(changes).toEqual([true]);
  });

  it("does nothing after dispose", () => {
    const { gate, changes } = setup();
    gate.setLoading(true);
    gate.dispose();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it("accepts other timings", () => {
    const changes: boolean[] = [];
    const gate = createSkeletonGate((v) => changes.push(v), {
      showAfterMs: 50,
      minVisibleMs: 10,
      now: () => Date.now(),
    });
    gate.setLoading(true);
    vi.advanceTimersByTime(50);
    gate.setLoading(false);
    vi.advanceTimersByTime(10);
    expect(changes).toEqual([true, false]);
  });
});
