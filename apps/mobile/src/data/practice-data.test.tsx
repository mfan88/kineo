import { describe, expect, it } from "@jest/globals";
import type { WriteEnvironment } from "@kineo/data";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { fakeDatabase } from "./fake-database";
import { PracticeDataProvider, usePracticeData, usePracticeWriter } from "./practice-data";
import { PracticeStore } from "./practice-store";

const ENV: WriteEnvironment = {
  ownerId: "owner_test",
  now: () => "2026-11-12T17:00:00.000Z",
  today: () => "2026-11-12",
  newId: () => "00000000-0000-4000-8000-000000000001",
};

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Probe() {
  const data = usePracticeData();
  const writer = usePracticeWriter();
  return (
    <Text>
      {data.patients.length} patients, writer {typeof writer.addPatient}
    </Text>
  );
}

async function renderProvider(options?: Parameters<typeof fakeDatabase>[0]) {
  const fake = fakeDatabase(options);
  const store = new PracticeStore(fake.db, ENV);
  store.start();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <PracticeDataProvider store={store}>
          <Probe />
        </PracticeDataProvider>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
  return fake;
}

describe("PracticeDataProvider", () => {
  it("shows a loading skeleton in Home's shape until the first read finishes", async () => {
    const fake = await renderProvider();
    expect(screen.getByLabelText("Loading your practice")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Who are you seeing?" })).toBeTruthy();
    expect(screen.queryByText(/patients, writer/)).toBeNull();

    await act(() => fake.answerAll());
    expect(screen.queryByLabelText("Loading your practice")).toBeNull();
    expect(screen.getByText("0 patients, writer function")).toBeTruthy();
  });

  it("says when the records can't be opened, and tries again", async () => {
    let works = false;
    const fake = await renderProvider({
      open: () => (works ? Promise.resolve() : Promise.reject(new Error("no disk"))),
    });
    expect(await screen.findByRole("header", { name: "Can't open your records" })).toBeTruthy();

    works = true;
    await fireEvent.press(screen.getByText("Try again"));
    expect(screen.getByLabelText("Loading your practice")).toBeTruthy();
    await act(() => fake.answerAll());
    expect(screen.getByText("0 patients, writer function")).toBeTruthy();
  });
});
