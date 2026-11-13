import type { PracticeData } from "@kineo/data";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { PracticeStore } from "./practiceStore";
import { useSkeletonVisible } from "./useSkeletonVisible";

const StoreContext = createContext<PracticeStore | null>(null);
const DataContext = createContext<PracticeData | null>(null);

/**
 * Makes the store available to every screen. Its data may not have been read yet;
 * screens that need it are wrapped in `PracticeGate`, which shows a skeleton in
 * their shape (the back arrow and wordmark stay live) until it has.
 */
export function PracticeStoreProvider({
  store,
  children,
}: {
  store: PracticeStore;
  children: ReactNode;
}) {
  const data = useSyncExternalStore(store.subscribe, store.getState);
  return (
    <StoreContext.Provider value={store}>
      <DataContext.Provider value={data}>{children}</DataContext.Provider>
    </StoreContext.Provider>
  );
}

/**
 * Shows `children` once the practice data has been read, so they always get
 * complete data. Until then it shows `skeleton(false)`, the screen's frame alone,
 * and after 300 ms `skeleton(true)`, the frame with its blocks, kept at least 400 ms.
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

/** The store, for calling actions. */
export function useStore(): PracticeStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside PracticeStoreProvider.");
  return store;
}

/** The current data; re-renders the screen whenever it changes. */
export function usePracticeData(): PracticeData {
  const data = useContext(DataContext);
  if (!data) throw new Error("usePracticeData must be used inside PracticeStoreProvider.");
  return data;
}

/** Whether an invoice hasn't reached the server yet; re-renders when that changes. */
export function useInvoicePending(invoiceId: string): boolean {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.isInvoicePending(invoiceId));
}
