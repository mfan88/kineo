import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundingChip } from "./FundingChip";

describe("FundingChip", () => {
  it("shows its label on one line, with the icon hidden from screen readers", () => {
    const { container } = render(<FundingChip variant="funding" label="Autism Funding" />);
    const chip = screen.getByText("Autism Funding");
    expect(chip.className).toContain("whitespace-nowrap");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws a solid outline, and a dashed one only for a funding that has ended", () => {
    render(
      <>
        <FundingChip variant="funding" label="A" />
        <FundingChip variant="selfPay" label="B" />
        <FundingChip variant="ended" label="Ended 31 Mar 2027" />
      </>,
    );
    expect(screen.getByText("A").className).toContain("border-solid");
    expect(screen.getByText("B").className).toContain("border-solid");
    expect(screen.getByText("Ended 31 Mar 2027").className).toContain("border-dashed");
  });

  it("takes its colours from the theme's variables, not fixed values", () => {
    render(<FundingChip variant="selfPay" label="Self-pay" />);
    const chip = screen.getByText("Self-pay");
    expect(chip.style.color).toBe("var(--chip-text)");
    expect(chip.style.borderColor).toBe("var(--field-border)");
  });

  it("draws each icon from the shared shapes", () => {
    const { container, rerender } = render(<FundingChip variant="funding" label="X" />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
    rerender(<FundingChip variant="selfPay" label="X" />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    rerender(<FundingChip variant="ended" label="X" />);
    expect(container.querySelector("circle")?.getAttribute("stroke-dasharray")).toBe("2 2");
  });
});
