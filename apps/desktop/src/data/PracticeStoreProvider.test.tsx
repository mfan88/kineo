import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoPracticeStore } from "./demoPracticeStore";
import { PracticeGate, PracticeStoreProvider, usePracticeData } from "./PracticeStoreProvider";
import { DemoStore } from "./store";

function PatientCount() {
  return <p>{usePracticeData().patients.length} patients</p>;
}

const skeleton = (showBlocks: boolean) => (
  <main aria-busy="true" aria-label="Loading test screen">
    {showBlocks ? <p>Blocks</p> : null}
  </main>
);

/** The demo store, but with no data until `read()` is called. */
function storeNotReadYet() {
  const demo = new DemoStore();
  const listeners = new Set<() => void>();
  let ready = false;
  class NotReadYet extends DemoPracticeStore {
    override getState = () => (ready ? demo.getState() : null);
    override subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
  }
  return {
    demo,
    store: new NotReadYet(demo),
    read: () => {
      act(() => {
        ready = true;
        for (const listener of listeners) listener();
      });
    },
  };
}

function renderGate() {
  const practice = storeNotReadYet();
  render(
    <PracticeStoreProvider store={practice.store}>
      <PracticeGate skeleton={skeleton}>
        <PatientCount />
      </PracticeGate>
    </PracticeStoreProvider>,
  );
  return practice;
}

describe("PracticeGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the screen's frame at once, its blocks after 300 ms, and the screen once read", () => {
    const { demo, read } = renderGate();
    expect(screen.getByLabelText("Loading test screen").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Blocks")).toBeNull();
    expect(screen.queryByText(/patients$/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Blocks")).toBeTruthy();

    // Read after 100 ms of skeleton: it stays for 300 ms more (400 ms in all).
    act(() => {
      vi.advanceTimersByTime(100);
    });
    read();
    expect(screen.getByText("Blocks")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByLabelText("Loading test screen")).toBeNull();
    expect(screen.getByText(`${demo.getState().patients.length} patients`)).toBeTruthy();
  });

  it("never shows blocks when the data arrives within 300 ms", () => {
    const { demo, read } = renderGate();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    read();
    expect(screen.queryByText("Blocks")).toBeNull();
    expect(screen.queryByLabelText("Loading test screen")).toBeNull();
    expect(screen.getByText(`${demo.getState().patients.length} patients`)).toBeTruthy();
  });

  it("shows the screen straight away when the data is already there", () => {
    const demo = new DemoStore();
    render(
      <PracticeStoreProvider store={new DemoPracticeStore(demo)}>
        <PracticeGate skeleton={skeleton}>
          <PatientCount />
        </PracticeGate>
      </PracticeStoreProvider>,
    );
    expect(screen.queryByLabelText("Loading test screen")).toBeNull();
    expect(screen.getByText(`${demo.getState().patients.length} patients`)).toBeTruthy();
  });
});
