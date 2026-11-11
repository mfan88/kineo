import { toast } from "@heroui/react";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine, so it lacks ResizeObserver, which HeroUI's toast
// region uses to measure toasts. Sizes don't matter in tests; observe nothing.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;

// Unmount whatever a test rendered and drop queued toasts (the queue is global), so
// tests don't see each other's screens.
afterEach(() => {
  toast.clear();
  cleanup();
});
