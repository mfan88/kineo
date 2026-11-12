import { useEffect, useState } from "react";
import { useStore } from "./PracticeStoreProvider";

/**
 * An image source for a saved logo path: null while it loads, when there's no logo,
 * or if it couldn't be loaded (invoices then show the practitioner's name alone).
 */
export function useLogoSrc(logoPath: string | null): string | null {
  const store = useStore();
  const [loaded, setLoaded] = useState<{ path: string; src: string | null } | null>(null);

  useEffect(() => {
    if (logoPath === null) return undefined;
    let current = true;
    store.logoSrc(logoPath).then(
      (src) => {
        if (current) setLoaded({ path: logoPath, src });
      },
      () => {
        if (current) setLoaded({ path: logoPath, src: null });
      },
    );
    return () => {
      current = false;
    };
  }, [store, logoPath]);

  return logoPath !== null && loaded?.path === logoPath ? loaded.src : null;
}
