import { useEffect, useState } from "react";

/** False at first, true once `ms` milliseconds have passed while `active` is true. */
export function useElapsed(ms: number, active = true): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    setElapsed(false);
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms, active]);
  return elapsed;
}
