import type { PracticeData } from "@kineo/data";
import { Skeleton } from "@heroui/react";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { PracticeStore } from "./practiceStore";

const StoreContext = createContext<PracticeStore | null>(null);
const DataContext = createContext<PracticeData | null>(null);

/**
 * Makes the store available to every screen, and shows a loading skeleton until
 * its data has first been read, so screens always get complete data.
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
      {data ? (
        <DataContext.Provider value={data}>{children}</DataContext.Provider>
      ) : (
        <LoadingPractice />
      )}
    </StoreContext.Provider>
  );
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

/** A calm placeholder in Home's shape while the local database is first read. */
function LoadingPractice() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your practice"
      className="min-h-screen bg-background"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 pt-6 pb-12">
        <div className="h-11" />
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
