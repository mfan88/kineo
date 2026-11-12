import type { PracticeData, PracticeWriter } from "@kineo/data";
import { Button, Skeleton } from "heroui-native";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import type { PracticeStore } from "./practice-store";

const DataContext = createContext<PracticeData | null>(null);
const WriterContext = createContext<PracticeWriter | null>(null);

/**
 * Gives every screen the practice from the local database, and the writer that
 * changes it. Until the first read finishes it shows a loading skeleton in Home's
 * shape instead of the screens, so screens always get complete data.
 */
export function PracticeDataProvider({
  store,
  children,
}: {
  store: PracticeStore;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  if (state.status === "loading") return <LoadingPractice />;
  if (state.status === "failed") return <PracticeUnavailable onRetry={() => store.start()} />;
  return (
    <WriterContext.Provider value={store.writer}>
      <DataContext.Provider value={state.data}>{children}</DataContext.Provider>
    </WriterContext.Provider>
  );
}

/** For screen tests only: shows the screens fixed, made-up data, with no database. */
export function DemoPracticeProvider({
  data,
  children,
}: {
  data: PracticeData;
  children: ReactNode;
}) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

/** The current data; re-renders the screen whenever it changes. */
export function usePracticeData(): PracticeData {
  const data = useContext(DataContext);
  if (!data) throw new Error("usePracticeData must be used inside PracticeDataProvider.");
  return data;
}

/** The writer, for making changes (add a patient, save a note…). */
export function usePracticeWriter(): PracticeWriter {
  const writer = useContext(WriterContext);
  if (!writer) throw new Error("usePracticeWriter must be used inside PracticeDataProvider.");
  return writer;
}

/** A calm placeholder in Home's shape while the local database is first read. */
function LoadingPractice() {
  return (
    <Screen title="Who are you seeing?">
      <View accessibilityLabel="Loading your practice" accessibilityState={{ busy: true }}>
        <View className="gap-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-11 w-2/3 rounded-full" />
        </View>
        <View className="gap-4 pt-10">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </View>
      </View>
    </Screen>
  );
}

/** The database couldn't be opened or read: say so, and offer another go. */
function PracticeUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen title="Can't open your records">
      <Text className="text-foreground">
        Kineō couldn't read the records saved on this phone. Try again; if this keeps happening,
        close the app and open it again.
      </Text>
      <Button onPress={onRetry} className="min-h-11 self-start">
        Try again
      </Button>
    </Screen>
  );
}
