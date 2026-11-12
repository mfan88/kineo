import { colors } from "@kineo/tokens";

/**
 * The Kineō wordmark (docs/brand.md): lowercase "kine" + "o" in Sora 600, with the
 * macron drawn as a separate rounded bar, never the font's built-in ō. `size` is
 * the font size in px; the brand minimum height is 20.
 */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Kineō"
      className="inline-block select-none"
      style={{
        fontFamily: '"Sora", system-ui, sans-serif',
        fontWeight: 600,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        fontSize: size,
        color: colors.textOnTint,
      }}
    >
      kine
      <span className="relative inline-block">
        o
        {/* The macron: inset 10% of the o's width each side, 0.12em from the top, 0.085em tall. */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: "10%",
            right: "10%",
            top: "0.12em",
            height: "0.085em",
            background: colors.primary,
          }}
        />
      </span>
    </span>
  );
}
