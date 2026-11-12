import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { createContext, useContext, useState, type ReactNode } from "react";

const PracticeDataContext = createContext<PracticeData | null>(null);

/**
 * The practice the screens show. For now the made-up demo practice (as desktop's
 * demo store was); the phone's local database replaces it later in Phase 3.
 */
export function PracticeDataProvider({
  data,
  children,
}: {
  data?: PracticeData;
  children: ReactNode;
}) {
  const [value] = useState(() => data ?? createDemoPractice());
  return <PracticeDataContext.Provider value={value}>{children}</PracticeDataContext.Provider>;
}

export function usePracticeData(): PracticeData {
  const data = useContext(PracticeDataContext);
  if (!data) throw new Error("usePracticeData must be used inside PracticeDataProvider.");
  return data;
}
