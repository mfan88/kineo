import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { Text } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { FirstSyncGate } from "./first-sync-gate";

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Status = { hasSynced: boolean; connected: boolean } | null;

function Wrapper({ status }: { status: Status }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <FirstSyncGate status={status}>
          <Text>The app</Text>
        </FirstSyncGate>
      </HeroUINativeProvider>
    </SafeAreaProvider>
  );
}

async function renderGate(status: Status) {
  const view = await render(<Wrapper status={status} />);
  return { update: (next: Status) => view.rerender(<Wrapper status={next} />) };
}

describe("FirstSyncGate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a blank page until the status is known", async () => {
    await renderGate(null);
    expect(screen.queryByText("The app")).toBeNull();
    expect(screen.getByLabelText("Opening Kineō")).toBeTruthy();
  });

  it("shows the app at once on a phone that has synced before", async () => {
    await renderGate({ hasSynced: true, connected: false });
    expect(screen.getByText("The app")).toBeTruthy();
  });

  it("explains the first sync, then shows the app when it finishes", async () => {
    const { update } = await renderGate({ hasSynced: false, connected: true });
    expect(screen.getByLabelText("Kineō")).toBeTruthy();
    expect(screen.getByText("Getting your patients and invoices")).toBeTruthy();
    expect(screen.getByText(/This only happens once on this phone/)).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();

    await update({ hasSynced: true, connected: true });
    expect(screen.getByText("The app")).toBeTruthy();
  });

  it("says to connect to the internet after 5 seconds without a connection", async () => {
    await renderGate({ hasSynced: false, connected: false });
    expect(screen.queryByText("You're offline")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText(/Connect to the internet/)).toBeTruthy();
  });
});
