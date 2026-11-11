import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { DemoStore, type DemoState } from "./store";

const StoreContext = createContext<DemoStore | null>(null);

/** Makes a demo store available to every screen. Tests pass their own store. */
export function DemoStoreProvider({ store, children }: { store?: DemoStore; children: ReactNode }) {
  const [value] = useState(() => store ?? new DemoStore());
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The store, for calling actions. */
export function useStore(): DemoStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside DemoStoreProvider.");
  return store;
}

/** The current state; re-renders the screen whenever it changes. */
export function useDemoState(): DemoState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
