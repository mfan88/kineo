import type { PracticeData, PracticeWriter } from "@kineo/data";
import { Button, useToast } from "heroui-native";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ScreenLayout } from "@/components/screen";
import { Text } from "@/components/text";
import type { PracticeStore } from "./practice-store";
import { useSkeletonVisible } from "./use-skeleton-visible";

/** Shown once when a record couldn't be read and is missing from the screens (as on desktop). */
export const ROWS_LEFT_OUT =
  "Some of your records couldn't be shown. Restart Kineō; if this keeps happening, contact support.";

/** Null until the first read of the local database has finished. */
const DataContext = createContext<PracticeData | null>(null);
const WriterContext = createContext<PracticeWriter | null>(null);
const StoreContext = createContext<PracticeStore | null>(null);

/**
 * Gives every screen the practice from the local database, and the writer that
 * changes it. The first read may still be running when the tabs appear; screens
 * that need the data are wrapped in `PracticeGate`, which shows a skeleton in their
 * shape (tab bar and back arrow stay live) until it's done.
 */
export function PracticeDataProvider({
  store,
  children,
}: {
  store: PracticeStore;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const rowsLeftOut = useSyncExternalStore(store.subscribe, store.hasRowsLeftOut);
  const { toast } = useToast();
  const warned = useRef(false);
  useEffect(() => {
    // Once per session, and never which row (its contents can hold patient details).
    if (!rowsLeftOut || warned.current) return;
    warned.current = true;
    toast.show({ variant: "danger", label: ROWS_LEFT_OUT });
  }, [rowsLeftOut, toast]);

  if (state.status === "failed") return <PracticeUnavailable onRetry={() => store.start()} />;
  return (
    <StoreContext.Provider value={store}>
      <WriterContext.Provider value={store.writer}>
        <DataContext.Provider value={state.status === "ready" ? state.data : null}>
          {children}
        </DataContext.Provider>
      </WriterContext.Provider>
    </StoreContext.Provider>
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

/** The current data, or null until the first read has finished (for work that waits on it). */
export function usePracticeDataIfReady(): PracticeData | null {
  return useContext(DataContext);
}

/** The writer, for making changes (add a patient, save a note…). */
export function usePracticeWriter(): PracticeWriter {
  const writer = useContext(WriterContext);
  if (!writer) throw new Error("usePracticeWriter must be used inside PracticeDataProvider.");
  return writer;
}

const noSubscription = () => () => {};

/**
 * Whether an invoice hasn't reached the server yet; re-renders when that changes.
 * With made-up test data (no database) nothing is waiting.
 */
export function useInvoicePending(invoiceId: string): boolean {
  const store = useContext(StoreContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () =>
    store ? store.isInvoicePending(invoiceId) : false,
  );
}

/**
 * Shows `children` once the practice has been read, so they always get complete
 * data. Until then it shows `skeleton(false)`, the screen's frame alone, and after
 * 300 ms `skeleton(true)`, the frame with its blocks, kept at least 400 ms.
 */
export function PracticeGate({
  skeleton,
  children,
}: {
  skeleton: (showBlocks: boolean) => ReactNode;
  children: ReactNode;
}) {
  const ready = useContext(DataContext) !== null;
  const showBlocks = useSkeletonVisible(!ready);
  if (ready && !showBlocks) return children;
  return skeleton(showBlocks);
}

/** The database couldn't be opened or read: say so, and offer another go. */
function PracticeUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <ScreenLayout title="Can't open your records">
      <Text className="text-foreground">
        Kineō couldn't read the records saved on this phone. Try again; if this keeps happening,
        close the app and open it again.
      </Text>
      <Button onPress={onRetry} className="min-h-11 self-start">
        Try again
      </Button>
    </ScreenLayout>
  );
}
