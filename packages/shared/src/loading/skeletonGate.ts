// Timers exist in every place this runs (browser, Hermes, Node), but this package's
// type libraries don't include them, so say what we use.
declare function setTimeout(handler: () => void, milliseconds: number): number;
declare function clearTimeout(timer: number): void;

/** Show a loading skeleton only once the wait has lasted this long (design brief, States). */
export const SKELETON_SHOW_AFTER_MS = 300;
/** Once a skeleton is showing, keep it at least this long so it never flickers. */
export const SKELETON_MIN_VISIBLE_MS = 400;

export interface SkeletonGateOptions {
  showAfterMs?: number;
  minVisibleMs?: number;
  /** Clock in milliseconds; tests can pass their own. */
  now?: () => number;
}

export interface SkeletonGate {
  /** Tell the gate whether the screen is still waiting for its data. */
  setLoading(loading: boolean): void;
  /** Whether the skeleton should be on screen right now. */
  isVisible(): boolean;
  /** Stop any pending timers. Call when the screen goes away. */
  dispose(): void;
}

/**
 * Decides when a loading skeleton shows. Local reads usually finish in a few
 * milliseconds, so the skeleton appears only if the wait passes `showAfterMs`
 * (300 ms), and once it appears it stays for at least `minVisibleMs` (400 ms).
 * `onChange` is called each time the answer changes.
 */
export function createSkeletonGate(
  onChange: (visible: boolean) => void,
  options: SkeletonGateOptions = {},
): SkeletonGate {
  const showAfterMs = options.showAfterMs ?? SKELETON_SHOW_AFTER_MS;
  const minVisibleMs = options.minVisibleMs ?? SKELETON_MIN_VISIBLE_MS;
  const now = options.now ?? Date.now;

  let loading = false;
  let visible = false;
  let shownAt = 0;
  let showTimer: number | null = null;
  let hideTimer: number | null = null;

  const clearShow = () => {
    if (showTimer !== null) clearTimeout(showTimer);
    showTimer = null;
  };
  const clearHide = () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    onChange(next);
  };

  return {
    setLoading(next) {
      if (next === loading) return;
      loading = next;
      if (next) {
        // Waiting again while a skeleton is still held: keep showing it.
        clearHide();
        if (!visible && showTimer === null) {
          showTimer = setTimeout(() => {
            showTimer = null;
            shownAt = now();
            setVisible(true);
          }, showAfterMs);
        }
        return;
      }
      // Finished before the skeleton ever appeared: it never will.
      clearShow();
      if (!visible) return;
      const remaining = minVisibleMs - (now() - shownAt);
      if (remaining <= 0) {
        setVisible(false);
        return;
      }
      clearHide();
      hideTimer = setTimeout(() => {
        hideTimer = null;
        setVisible(false);
      }, remaining);
    },
    isVisible: () => visible,
    dispose() {
      clearShow();
      clearHide();
    },
  };
}
