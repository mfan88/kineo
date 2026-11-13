import {
  statusTagFor,
  statusTagIcons,
  statusTags,
  type StatusTagToken,
  type TaggedStatus,
} from "@kineo/tokens";

/** CSS name of a tag's theme variables (`--tag-not-invoiced-fg` and so on). */
const cssName = (tag: StatusTagToken) => tag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * A pill with an icon and a word for a visit's or invoice's state (or an error).
 * Colours come from the theme (`--tag-*` in @kineo/tokens), so they follow light and
 * dark; the icon and word mean status never depends on colour alone.
 */
export function StatusTag({
  status,
  size = "sm",
}: {
  status: TaggedStatus | "error";
  size?: "sm" | "md";
}) {
  const tag: StatusTagToken = status === "error" ? "error" : statusTagFor(status);
  const icon = statusTagIcons[tag];
  const name = cssName(tag);
  return (
    <span
      data-tag={tag}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      style={{ color: `var(--tag-${name}-fg)`, backgroundColor: `var(--tag-${name}-bg)` }}
    >
      <svg
        aria-hidden="true"
        width={size === "sm" ? 12 : 14}
        height={size === "sm" ? 12 : 14}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon.circle ? (
          <circle
            cx={8}
            cy={8}
            r={6}
            strokeDasharray={icon.circle === "dashed" ? "2 2" : undefined}
          />
        ) : null}
        {icon.path ? <path d={icon.path} /> : null}
      </svg>
      {statusTags[tag].label}
    </span>
  );
}
