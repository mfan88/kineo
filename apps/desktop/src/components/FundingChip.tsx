import { fundingChipIcons } from "@kineo/tokens";

/** A funder (a building), self-pay (a person) or a funding that has ended (a dashed ring). */
export type FundingChipVariant = keyof typeof fundingChipIcons;

/**
 * A small outlined pill saying who a patient is billed through: the funder's name,
 * "Self-pay", or "Ended 31 Mar 2027" (dashed outline). The icon and word mean it never
 * depends on colour alone. Colours follow light and dark through `--chip-text` and
 * `--field-border` (@kineo/tokens); the label stays on one line.
 */
export function FundingChip({ variant, label }: { variant: FundingChipVariant; label: string }) {
  const icon = fundingChipIcons[variant];
  return (
    <span
      data-chip={variant}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-[3px] pr-2.5 pl-2 text-[13px] font-medium ${
        variant === "ended" ? "border-dashed" : "border-solid"
      }`}
      style={{ color: "var(--chip-text)", borderColor: "var(--field-border)" }}
    >
      <svg
        aria-hidden="true"
        width={14}
        height={14}
        viewBox={icon.viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={icon.viewBox === "0 0 24 24" ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon.paths.map((d) => (
          <path key={d} d={d} />
        ))}
        {icon.circles.map((circle) => (
          <circle
            key={`${circle.cx}-${circle.cy}`}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            strokeDasharray={circle.dashed ? "2 2" : undefined}
          />
        ))}
      </svg>
      {label}
    </span>
  );
}
