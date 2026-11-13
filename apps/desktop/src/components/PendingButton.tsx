import { Button } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

/**
 * A button for an action that takes a moment ("Save profile" → "Saving…"). While
 * `pending` it keeps its width and colour, shows a spinner and `pendingLabel`, and
 * ignores clicks and Enter. The pending label is announced once, as a status.
 */
export function PendingButton({
  pending,
  pendingLabel,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "isPending" | "children"> & {
  pending: boolean;
  pendingLabel: string;
  /** The button's usual label. */
  children: ReactNode;
}) {
  return (
    <Button {...props} isPending={pending}>
      {/* Both labels take space in the same cell, so the button never changes width. */}
      <span className="inline-grid">
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center ${pending ? "invisible" : ""}`}
        >
          {children}
        </span>
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? "" : "invisible"}`}
        >
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
          {pending ? (
            <span role="status">{pendingLabel}</span>
          ) : (
            <span aria-hidden="true">{pendingLabel}</span>
          )}
        </span>
      </span>
    </Button>
  );
}
