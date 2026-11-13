import { describe, expect, it, jest } from "@jest/globals";
import { colors, darkColors } from "@kineo/tokens";
import { render, screen } from "@testing-library/react-native";
import { FundingChip } from "./funding-chip";

// Which appearance is on screen; each test sets it before rendering.
let mockTheme = "light";
jest.mock("uniwind", () => ({
  ...jest.requireActual<Record<string, unknown>>("uniwind"),
  useUniwind: () => ({ theme: mockTheme }),
}));

describe("FundingChip", () => {
  it("shows its label, with the label read out as the chip's name", async () => {
    mockTheme = "light";
    await render(<FundingChip variant="funding" label="Autism Funding" />);
    expect(screen.getByText("Autism Funding")).toBeTruthy();
    expect(screen.getByTestId("funding-chip-funding").props.accessibilityLabel).toBe(
      "Autism Funding",
    );
  });

  it("keeps the label on one line", async () => {
    mockTheme = "light";
    await render(<FundingChip variant="selfPay" label="Self-pay" />);
    expect(screen.getByText("Self-pay").props.numberOfLines).toBe(1);
  });

  it("draws a solid outline, and a dashed one only for a funding that has ended", async () => {
    mockTheme = "light";
    await render(
      <>
        <FundingChip variant="funding" label="A" />
        <FundingChip variant="selfPay" label="B" />
        <FundingChip variant="ended" label="Ended 31 Mar 2027" />
      </>,
    );
    expect(screen.getByTestId("funding-chip-funding")).toHaveStyle({ borderStyle: "solid" });
    expect(screen.getByTestId("funding-chip-selfPay")).toHaveStyle({ borderStyle: "solid" });
    expect(screen.getByTestId("funding-chip-ended")).toHaveStyle({ borderStyle: "dashed" });
  });

  it("is a transparent, pill-shaped outline with 1px borders", async () => {
    mockTheme = "light";
    await render(<FundingChip variant="funding" label="A" />);
    const chip = screen.getByTestId("funding-chip-funding");
    expect(chip).toHaveStyle({ borderWidth: 1 });
    expect(chip.props.style.backgroundColor).toBeUndefined();
  });

  it.each([
    ["light", colors],
    ["dark", darkColors],
  ] as const)("takes its text and outline colours from the %s tokens", async (theme, palette) => {
    mockTheme = theme;
    await render(<FundingChip variant="ended" label="Ended 31 Mar 2027" />);
    expect(screen.getByText("Ended 31 Mar 2027")).toHaveStyle({ color: palette.chipText });
    expect(screen.getByTestId("funding-chip-ended")).toHaveStyle({
      borderColor: palette.inputEdge,
    });
  });
});
