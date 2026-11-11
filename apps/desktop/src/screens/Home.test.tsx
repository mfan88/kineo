import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const JORDAN = "5eed0000-0000-4000-8000-000000000203";
const RILEY = "5eed0000-0000-4000-8000-000000000204";
const DRAFT_INVOICE = "5eed0000-0000-4000-8000-000000000303";
const SENT_INVOICE = "5eed0000-0000-4000-8000-000000000302";

function group(name: string) {
  const heading = screen.getByRole("heading", { level: 3, name });
  const card = heading.closest("[data-slot='card']") ?? heading.parentElement?.parentElement;
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${name}`);
  return within(card);
}

describe("Home", () => {
  it("lists recent patients, most recently seen first", () => {
    renderApp();
    const chips = within(screen.getByRole("list", { name: "Recent patients" })).getAllByRole(
      "listitem",
    );
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Riley Placeholder",
      "Jordan Sample",
      "Casey Fictional",
      "Morgan Testcase",
    ]);
  });

  it("shows the three invoice groups from the demo data", () => {
    renderApp();
    const ready = group("Ready to invoice");
    expect(ready.getByText("Jordan Sample")).toBeTruthy();
    expect(ready.getByText("2 visits · Oct 28 – Nov 4")).toBeTruthy();
    expect(ready.getByText("1 visit · Nov 6")).toBeTruthy();

    const notSent = group("Not sent yet");
    expect(notSent.getByText("Casey Fictional")).toBeTruthy();
    expect(notSent.getByText("INV-0003 · Draft")).toBeTruthy();
    expect(notSent.getByText("$120.00")).toBeTruthy();

    const waiting = group("Waiting on payment");
    expect(waiting.getByText("Morgan Testcase")).toBeTruthy();
    // $190.00 + $15.00 = $205.00, plus 5% tax.
    expect(waiting.getByText("$215.25")).toBeTruthy();
    expect(screen.queryByText("INV-0001", { exact: false })).toBeNull();
  });

  it("finds patients as you type and replaces the recent chips", async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "jor");
    const results = within(screen.getByRole("list", { name: "Matching patients" }));
    expect(results.getAllByRole("listitem")).toHaveLength(1);
    expect(results.getByText("Jordan Sample")).toBeTruthy();
    expect(results.getByText("Shoulder rehab")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recent patients" })).toBeNull();
  });

  it("says when no patient matches", async () => {
    const { user } = renderApp();
    await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "  zed ");
    expect(screen.getByText("No patients match “zed”.")).toBeTruthy();
  });

  it("brings the recent chips back when the search is cleared", async () => {
    const { user } = renderApp();
    const search = screen.getByRole("searchbox", { name: "Search patients" });
    await user.type(search, "jor");
    await user.clear(search);
    expect(screen.getByRole("list", { name: "Recent patients" })).toBeTruthy();
  });

  describe("opening things", () => {
    it("opens a patient from the search results", async () => {
      const { user, router } = renderApp();
      await user.type(screen.getByRole("searchbox", { name: "Search patients" }), "jor");
      const results = within(screen.getByRole("list", { name: "Matching patients" }));
      await user.click(results.getByRole("button", { name: /^Jordan Sample/ }));
      expect(router.state.location.pathname).toBe(`/patients/${JORDAN}`);
      expect(screen.getByRole("heading", { level: 1, name: "Jordan Sample" })).toBeTruthy();
    });

    it("opens a patient from a recent patient chip", async () => {
      const { user, router } = renderApp();
      const chips = within(screen.getByRole("list", { name: "Recent patients" }));
      await user.click(chips.getByRole("button", { name: "Riley Placeholder" }));
      expect(router.state.location.pathname).toBe(`/patients/${RILEY}`);
    });

    it("opens the patient from Ready to invoice", async () => {
      const { user, router } = renderApp();
      await user.click(group("Ready to invoice").getByRole("button", { name: /^Jordan Sample/ }));
      expect(router.state.location.pathname).toBe(`/patients/${JORDAN}`);
    });

    it("opens the invoice from Not sent yet and Waiting on payment", async () => {
      const { user, router } = renderApp();
      await user.click(group("Not sent yet").getByRole("button", { name: /^Casey Fictional/ }));
      expect(router.state.location.pathname).toBe(`/invoices/${DRAFT_INVOICE}`);
      expect(screen.getByRole("heading", { level: 1, name: "Invoice INV-0003" })).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(
        group("Waiting on payment").getByRole("button", { name: /^Morgan Testcase/ }),
      );
      expect(router.state.location.pathname).toBe(`/invoices/${SENT_INVOICE}`);
    });
  });
});
