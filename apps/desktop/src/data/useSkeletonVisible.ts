import { createSkeletonGate, type SkeletonGate } from "@kineo/shared";
import { useEffect, useRef, useState } from "react";

/**
 * Whether a loading skeleton should be on screen: only once `loading` has lasted
 * 300 ms, and then for at least 400 ms (rules in `createSkeletonGate`).
 */
export function useSkeletonVisible(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const gate = useRef<SkeletonGate | null>(null);
  useEffect(() => {
    const created = createSkeletonGate(setVisible);
    gate.current = created;
    return () => {
      created.dispose();
      gate.current = null;
    };
  }, []);
  useEffect(() => {
    gate.current?.setLoading(loading);
  }, [loading]);
  return visible;
}
