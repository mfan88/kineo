import type { SyncStatusSummary } from "@kineo/shared";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstSyncGate } from "./FirstSyncGate";

function gateUi(status: SyncStatusSummary | null) {
  return (
    <FirstSyncGate status={status}>
      <p>The app</p>
    </FirstSyncGate>
  );
}

function renderGate(status: SyncStatusSummary | null) {
  const view = render(gateUi(status));
  return { update: (value: SyncStatusSummary | null) => view.rerender(gateUi(value)) };
}

describe("FirstSyncGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing special until the status is known", () => {
    renderGate(null);
    expect(screen.queryByText("The app")).toBeNull();
    expect(screen.queryByText("Getting your patients and invoices")).toBeNull();
    expect(screen.getByLabelText("Opening Kineō").getAttribute("aria-busy")).toBe("true");
  });

  it("shows the app straight away on a computer that has synced before", () => {
    renderGate({ hasSynced: true, connected: false });
    expect(screen.getByText("The app")).toBeTruthy();
  });

  it("explains the first sync, with the wordmark, then shows the app when it finishes", () => {
    const { update } = renderGate({ hasSynced: false, connected: true });
    expect(screen.getByRole("img", { name: "Kineō" })).toBeTruthy();
    const heading = screen.getByText("Getting your patients and invoices");
    expect(heading.closest("[role=status]")).not.toBeNull();
    expect(screen.getByText(/This only happens once on this computer/)).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();

    update({ hasSynced: true, connected: true });
    expect(screen.getByText("The app")).toBeTruthy();
    expect(screen.queryByText("Getting your patients and invoices")).toBeNull();
  });

  it("says to connect to the internet after 5 seconds without a connection", () => {
    renderGate({ hasSynced: false, connected: false });
    expect(screen.getByText("Getting your patients and invoices")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.queryByText("You're offline")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText(/Connect to the internet/)).toBeTruthy();
  });

  it("goes back to the first message when the connection returns", () => {
    const { update } = renderGate({ hasSynced: false, connected: false });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("You're offline")).toBeTruthy();
    update({ hasSynced: false, connected: true });
    expect(screen.getByText("Getting your patients and invoices")).toBeTruthy();
  });

  it("explains when the server refuses uploads, and clears once resolved", () => {
    const { update } = renderGate({
      hasSynced: false,
      connected: true,
      uploadRefused: true,
    });
    expect(screen.getByText("Kineō can't save to the server")).toBeTruthy();
    expect(
      screen.getByText(
        "It will keep trying. If this doesn't clear up in a few minutes, email support@fenna.tech.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Getting your patients and invoices")).toBeNull();

    update({ hasSynced: false, connected: true, uploadRefused: false });
    expect(screen.getByText("Getting your patients and invoices")).toBeTruthy();
    expect(screen.queryByText("Kineō can't save to the server")).toBeNull();

    update({ hasSynced: true, connected: true, uploadRefused: false });
    expect(screen.getByText("The app")).toBeTruthy();
    expect(screen.queryByText("Getting your patients and invoices")).toBeNull();
  });

  it("shows the app straight away on a computer that has synced before even if upload is refused", () => {
    renderGate({ hasSynced: true, connected: true, uploadRefused: true });
    expect(screen.getByText("The app")).toBeTruthy();
  });
});
