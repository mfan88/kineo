import type { WriteEnvironment } from "@kineo/data";
import { act, render } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import type { ReactElement } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { fakeDatabase } from "@/data/fake-database";
import { PracticeDataProvider } from "@/data/practice-data";
import { PracticeStore } from "@/data/practice-store";

export const TEST_NOW = "2026-11-12T17:00:00.000Z";
export const TEST_OWNER = "owner_test";
/** The ID the next new row gets. */
export const NEW_ID = "00000000-0000-4000-8000-000000000001";

const ENV: WriteEnvironment = {
  ownerId: TEST_OWNER,
  now: () => TEST_NOW,
  today: () => "2026-11-12",
  newId: () => NEW_ID,
};

// Safe area insets as on a phone (the provider renders nothing until it has some).
const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** A made-up patient as the local database stores it. */
export function patientRow(id: string, fullName: string, reasonForVisit: string | null = null) {
  return {
    id,
    owner_id: TEST_OWNER,
    full_name: fullName,
    reason_for_visit: reasonForVisit,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

/** A made-up visit as the local database stores it. */
export function visitRow(
  id: string,
  patientId: string,
  visitDate: string,
  note: string,
  invoiceId: string | null = null,
) {
  return {
    id,
    owner_id: TEST_OWNER,
    patient_id: patientId,
    visit_date: visitDate,
    note,
    note_edited_at: `${visitDate}T17:00:00.000Z`,
    invoice_id: invoiceId,
    created_at: `${visitDate}T17:00:00.000Z`,
    updated_at: `${visitDate}T17:00:00.000Z`,
  };
}

/**
 * Renders a screen as the app does, on a store over the fake database already
 * holding `rows`; `lookup` answers what a write reads first. `setRows` plays the database changing (as after a write or sync).
 */
export async function renderScreen(
  element: ReactElement,
  rows: Record<string, unknown[]> = {},
  lookup?: (sql: string, parameters: unknown[]) => unknown,
) {
  const fake = fakeDatabase(lookup ? { lookup } : {});
  const store = new PracticeStore(fake.db, ENV);
  store.start();
  fake.answerAll(rows);
  await render(
    // The root view is there for toasts, which can be swiped away.
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={METRICS}>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <PracticeDataProvider store={store}>{element}</PracticeDataProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
  return {
    writes: fake.writes,
    setRows: (next: Record<string, unknown[]>) => act(() => fake.answerAll(next)),
  };
}
