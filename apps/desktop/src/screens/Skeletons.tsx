import { Skeleton } from "@heroui/react";
import { Screen } from "../components/Screen";

/**
 * What each screen shows while the practice is first read from the local database
 * (design brief, States): the screen's own frame (back arrow, wordmark, heading
 * where it's known) with grey blocks in the shape of what's coming. `showBlocks`
 * is false for the first 300 ms, so a quick read never flashes a skeleton.
 */
interface SkeletonProps {
  showBlocks: boolean;
}

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function Busy({
  label,
  showBlocks,
  children,
}: {
  label: string;
  showBlocks: boolean;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-6">
      {showBlocks ? (
        <div aria-hidden="true" className="flex flex-col gap-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Home: the real heading, then the search field, Recent rows and to-do cards. */
export function HomeSkeleton({ showBlocks }: SkeletonProps) {
  return (
    <Screen eyebrow={longDate.format(new Date())} title="Who are you seeing?">
      <Busy label="Loading Home" showBlocks={showBlocks}>
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-12 rounded-full" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      </Busy>
    </Screen>
  );
}

/** Patient: a bar for the name (not known yet), the note card on the left, visits on the right. */
export function PatientSkeleton({ showBlocks }: SkeletonProps) {
  return (
    <Screen back wide title={showBlocks ? <Skeleton className="h-8 w-56 rounded-xl" /> : null}>
      <Busy label="Loading patient" showBlocks={showBlocks}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </Busy>
    </Screen>
  );
}

/** Invoices: list rows, each with a number, a name, an amount and a tag-shaped pill. */
export function InvoicesSkeleton({ showBlocks }: SkeletonProps) {
  return (
    <Screen back title="Invoices">
      <Busy label="Loading invoices" showBlocks={showBlocks}>
        <div className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex min-h-14 items-center gap-4 px-4 py-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </Busy>
    </Screen>
  );
}

/** Any other screen that needs the practice: its heading, then a few field-shaped blocks. */
export function FormSkeleton({
  title,
  showBlocks,
  wide = false,
}: SkeletonProps & { title: string; wide?: boolean }) {
  return (
    <Screen back wide={wide} title={title}>
      <Busy label={`Loading ${title.toLowerCase()}`} showBlocks={showBlocks}>
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </Busy>
    </Screen>
  );
}
