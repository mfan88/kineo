import type { VisitItemDraft } from "@kineo/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { VisitItemsField } from "./VisitItemsField";

const assessment = { id: "p1", name: "Initial assessment", unitPriceCents: 12000 };
const treatment = { id: "p2", name: "Follow-up treatment", unitPriceCents: 9500 };

function Harness({
  initial = [],
  priceItems = [assessment, treatment],
}: {
  initial?: VisitItemDraft[];
  priceItems?: (typeof assessment)[];
}) {
  const [items, setItems] = useState(initial);
  return (
    <MemoryRouter>
      <VisitItemsField items={items} onChange={setItems} priceItems={priceItems} />
    </MemoryRouter>
  );
}

describe("VisitItemsField", () => {
  it("lists the price list with prices and adds the chosen item", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Items (optional)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ Add item" }));
    expect(
      await screen.findByRole("menuitem", { name: "Follow-up treatment · $95.00" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Initial assessment · $120.00" }));
    expect(screen.getByText("Initial assessment")).toBeTruthy();
    expect(screen.getByText("$120.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Add item" })).toBeTruthy();
  });

  it("raises the quantity, never below 1, and removes a row", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { priceItemId: "p1", name: "Initial assessment", unitPriceCents: 12000, quantity: 1 },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Fewer Initial assessment" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("button", { name: "More Initial assessment" }));
    expect(screen.getByLabelText("Quantity 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fewer Initial assessment" }));
    expect(screen.getByLabelText("Quantity 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove Initial assessment" }));
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("shows the hint and a Price list link when the price list is empty", () => {
    render(<Harness priceItems={[]} />);
    expect(
      screen.getByText(/Add items to your price list to bill them with a note\./),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Price list" }).getAttribute("href")).toBe(
      "/settings/price-list",
    );
    expect(screen.queryByRole("button", { name: "+ Add item" })).toBeNull();
  });
});
