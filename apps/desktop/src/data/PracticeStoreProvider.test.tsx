import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoPracticeStore } from "./demoPracticeStore";
import { PracticeStoreProvider, usePracticeData } from "./PracticeStoreProvider";
import { DemoStore } from "./store";

function PatientCount() {
  return <p>{usePracticeData().patients.length} patients</p>;
}

describe("PracticeStoreProvider", () => {
  it("shows a loading skeleton until the data has been read, then the screens", () => {
    const demo = new DemoStore();
    const listeners = new Set<() => void>();
    let ready = false;
    // The demo store, but with no data until "read".
    class NotReadYet extends DemoPracticeStore {
      override getState = () => (ready ? demo.getState() : null);
      override subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
    }
    const store = new NotReadYet(demo);
    render(
      <PracticeStoreProvider store={store}>
        <PatientCount />
      </PracticeStoreProvider>,
    );
    expect(screen.getByLabelText("Loading your practice").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText(/patients$/)).toBeNull();

    act(() => {
      ready = true;
      for (const listener of listeners) listener();
    });
    expect(screen.queryByLabelText("Loading your practice")).toBeNull();
    expect(screen.getByText(`${demo.getState().patients.length} patients`)).toBeTruthy();
  });
});
