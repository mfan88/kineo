import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount whatever a test rendered so tests don't see each other's screens.
afterEach(() => {
  cleanup();
});
