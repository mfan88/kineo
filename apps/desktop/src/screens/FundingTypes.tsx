import { ChevronRight, CircleExclamation, CircleInfo, Plus } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import {
  FUNDING_PRESETS,
  fundingNotice,
  fundingTypeRow,
  fundingTypeUsage,
  localDateString,
} from "@kineo/shared";
import { fundingChipIcons } from "@kineo/tokens";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";
import { usePracticeData } from "../data/PracticeStoreProvider";

/** The building drawn for a funder, the same shape as on the funding chip. */
function BuildingIcon() {
  const [path] = fundingChipIcons.funding.paths;
  return (
    <svg
      aria-hidden="true"
      width={20}
      height={20}
      viewBox={fundingChipIcons.funding.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Funding types, from Settings: who you bill besides the patient. Each type sets the
 * recipient and the details that print on the invoice. Starting points for common funders
 * open the editor filled in; nothing is saved until you save there.
 */
export function FundingTypes() {
  const navigate = useNavigate();
  const { fundingTypes, patientFundings } = usePracticeData();
  const today = localDateString(new Date());
  const sorted = useMemo(
    () => fundingTypes.toSorted((a, b) => a.name.localeCompare(b.name)),
    [fundingTypes],
  );
  const notice = fundingNotice(fundingTypes, today);

  /** A link that moves within the app, without the window trying to load a page. */
  const go = (path: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void navigate(path);
  };

  return (
    <Screen
      back
      backLabel="Back to Settings"
      title="Funding types"
      action={
        <Button
          variant="primary"
          className="h-11 px-5"
          onPress={() => void navigate("/settings/funding-types/new")}
        >
          Add funding type
        </Button>
      }
    >
      <p className="max-w-[560px] text-[15px] text-muted">
        Who you bill besides the patient. A type sets the recipient and the details that print on
        the invoice.
      </p>

      <div className="rounded-2xl bg-surface shadow-surface">
        {sorted.length === 0 ? (
          <p className="p-5 text-[15px] text-muted">
            No funding types yet. Add one, or start from a common type below.
          </p>
        ) : (
          <ul aria-label="Funding types" className="flex flex-col divide-y divide-separator">
            {sorted.map((type) => {
              const row = fundingTypeRow(type, fundingTypeUsage(type.id, patientFundings, today));
              const path = `/settings/funding-types/${type.id}`;
              return (
                <li key={type.id}>
                  <a
                    href={path}
                    onClick={go(path)}
                    className="flex min-h-[76px] items-center gap-4 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl hover:bg-background focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent"
                    >
                      <BuildingIcon />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">{type.name}</span>
                      {row.problem === null ? (
                        <span className="text-sm text-muted">{row.billTo}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-danger">
                          <CircleExclamation width={14} height={14} aria-hidden />
                          {row.problem}
                        </span>
                      )}
                      <span className="text-sm text-muted">{row.counts}</span>
                    </span>
                    <ChevronRight width={16} height={16} aria-hidden className="text-muted" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <section aria-labelledby="presets-heading" className="flex flex-col gap-3">
        <h2 id="presets-heading" className="text-[15px] font-semibold text-muted">
          Start from a common type
        </h2>
        <div className="flex flex-wrap gap-2">
          {FUNDING_PRESETS.map((preset) => {
            const path = `/settings/funding-types/new?preset=${preset.key}`;
            return (
              <a
                key={preset.key}
                href={path}
                onClick={go(path)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                style={{ color: "var(--chip-text)", borderColor: "var(--field-border)" }}
              >
                <Plus width={16} height={16} aria-hidden />
                {preset.chipLabel}
              </a>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">
          Starting points only. Check each funder's current requirements before you bill. You can
          change everything.
        </p>
      </section>

      {notice === null ? null : (
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3.5 text-sm text-accent-soft-foreground"
        >
          <CircleInfo width={18} height={18} aria-hidden className="mt-px flex-none" />
          <p>{notice}</p>
        </div>
      )}
    </Screen>
  );
}
