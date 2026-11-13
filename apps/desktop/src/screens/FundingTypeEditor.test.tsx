import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo data (see @kineo/data/demo): Autism Funding has one patient; ICBC has none.
const AUTISM = "5eed0000-0000-4000-8000-000000000701";
const ICBC = "5eed0000-0000-4000-8000-000000000703";
const NEW = "/settings/funding-types/new";

const field = (name: string) => screen.getByRole("textbox", { name });
const paper = () => within(screen.getByTestId("paper"));

describe("Funding type editor, new", () => {
  it("starts from a common type with every field filled in", () => {
    renderApp(`${NEW}?preset=autism-funding`);
    expect(screen.getByRole("heading", { level: 1, name: "Autism Funding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to Funding types" })).toBeTruthy();
    expect(field("Type name")).toHaveProperty("value", "Autism Funding");
    expect(field("Recipient name")).toHaveProperty(
      "value",
      "Autism Funding Branch, Ministry of Children and Family Development",
    );
    expect(field("Recipient address")).toHaveProperty(
      "value",
      "PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5",
    );
    expect(field("Name of detail 1")).toHaveProperty("value", "Billing number");
    expect(screen.getByRole("combobox", { name: "Kind for Billing number" })).toHaveProperty(
      "value",
      "text",
    );
    expect(screen.getByRole("switch", { name: "Show Billing number on invoice" })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("starts blank for an unknown or missing starting point, titled New funding type", () => {
    renderApp(`${NEW}?preset=nonsense`);
    expect(screen.getByRole("heading", { level: 1, name: "New funding type" })).toBeTruthy();
    expect(field("Type name")).toHaveProperty("value", "");
    expect(screen.queryByRole("textbox", { name: "Name of detail 1" })).toBeNull();
  });

  it("hints that a recipient is needed before sending, until one is typed", async () => {
    const { user } = renderApp(`${NEW}?preset=icbc`);
    const hint = "Required before you can send an invoice to this funder.";
    expect(screen.getByText(hint)).toBeTruthy();
    await user.type(field("Recipient name"), "ICBC Claims");
    expect(screen.queryByText(hint)).toBeNull();
  });

  it("previews how it prints, with each shown detail's label in brackets", () => {
    renderApp(`${NEW}?preset=autism-funding`);
    expect(screen.getByRole("heading", { name: "How it prints" })).toBeTruthy();
    expect(paper().getByText("[Billing number]")).toBeTruthy();
    expect(paper().getByText("Billing number")).toBeTruthy();
    expect(paper().getByText("[Patient name]")).toBeTruthy();
    expect(
      paper().getByText("Autism Funding Branch, Ministry of Children and Family Development"),
    ).toBeTruthy();
    expect(paper().getByText("PO Box 9776 STN PROV GOVT")).toBeTruthy();
    expect(paper().getByText("Services, dates and totals appear here.")).toBeTruthy();
    expect(screen.getByText("Details that are off stay in Kineō and don't print.")).toBeTruthy();
    // The practice's own details and the next invoice number, from the demo practice.
    expect(paper().getByText("Example Physiotherapy")).toBeTruthy();
    expect(paper().getByText("INV-0004")).toBeTruthy();
  });

  it("uses placeholders in the preview for what isn't filled in yet", () => {
    renderApp(NEW);
    expect(paper().getByText("[Recipient name]")).toBeTruthy();
    expect(paper().getByText("[Recipient address]")).toBeTruthy();
  });

  it("keeps the paper white, whatever the mode", () => {
    renderApp(NEW);
    const sheet = screen.getByTestId("paper");
    expect(sheet.style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("takes a detail off the preview when Show on invoice is switched off", async () => {
    const { user } = renderApp(`${NEW}?preset=autism-funding`);
    const toggle = screen.getByRole("switch", { name: "Show Billing number on invoice" });
    await user.click(toggle);
    expect(toggle).toHaveProperty("checked", false);
    expect(paper().queryByText("[Billing number]")).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveProperty("checked", true);
    expect(paper().getByText("[Billing number]")).toBeTruthy();
  });

  it("follows what's typed in the preview and the heading", async () => {
    const { user } = renderApp(NEW);
    await user.type(field("Type name"), "Example Funder");
    await user.type(field("Recipient name"), "Example Ministry");
    expect(screen.getByRole("heading", { level: 1, name: "Example Funder" })).toBeTruthy();
    expect(paper().getByText("Example Ministry")).toBeTruthy();
  });

  it("adds a detail that takes focus, and removes one", async () => {
    const { user } = renderApp(`${NEW}?preset=autism-funding`);
    await user.click(screen.getByRole("button", { name: "Add detail" }));
    const added = field("Name of detail 2");
    expect(document.activeElement).toBe(added);
    expect(added).toHaveProperty("value", "");
    await user.type(added, "Authorization number");
    expect(paper().getByText("[Authorization number]")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove Authorization number" }));
    expect(screen.queryByRole("textbox", { name: "Name of detail 2" })).toBeNull();
  });

  it("changes a detail's kind", async () => {
    const { user } = renderApp(`${NEW}?preset=autism-funding`);
    const kind = screen.getByRole("combobox", { name: "Kind for Billing number" });
    await user.selectOptions(kind, "date");
    expect(kind).toHaveProperty("value", "date");
  });

  it("stops offering Add detail at 20 details", async () => {
    const { user } = renderApp(NEW);
    for (let i = 0; i < 20; i += 1) {
      await user.click(screen.getByRole("button", { name: "Add detail" }));
    }
    expect(screen.queryByRole("button", { name: "Add detail" })).toBeNull();
  });

  it("asks for a name under the field, focuses it, and saves nothing", async () => {
    const { user, store } = renderApp(NEW);
    const before = store.getState().fundingTypes.length;
    expect(screen.queryByText("Add a name for this funding type.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Add a name for this funding type.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Type name"));
    expect(store.getState().fundingTypes).toHaveLength(before);
  });

  it("says when two details have the same name, and focuses the second", async () => {
    const { user, store } = renderApp(`${NEW}?preset=autism-funding`);
    await user.click(screen.getByRole("button", { name: "Add detail" }));
    await user.type(field("Name of detail 2"), " billing number ");
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Two details can't have the same name.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Name of detail 2"));
    expect(store.getState().fundingTypes).toHaveLength(2);
  });

  it("asks for a blank detail's name", async () => {
    const { user } = renderApp(`${NEW}?preset=autism-funding`);
    await user.click(screen.getByRole("button", { name: "Add detail" }));
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Name this detail, or remove it.")).toBeTruthy();
  });

  it("saves a new type, goes to the list and says so", async () => {
    const { user, store, router } = renderApp(`${NEW}?preset=icbc`);
    await user.type(field("Recipient name"), "ICBC Claims");
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Funding type saved")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings/funding-types");
    const types = store.getState().fundingTypes;
    expect(types).toHaveLength(3);
    expect(types.at(-1)).toMatchObject({
      name: "ICBC",
      recipientName: "ICBC Claims",
      details: [{ label: "Claim number", kind: "text", showOnInvoice: true }],
    });
  });

  it("saves a type with no recipient yet", async () => {
    const { user, store } = renderApp(`${NEW}?preset=icbc`);
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Funding type saved")).toBeTruthy();
    expect(store.getState().fundingTypes.at(-1)).toMatchObject({ recipientName: "" });
  });
});

describe("Funding type editor, existing", () => {
  it("opens a type with its values and saves changes to it", async () => {
    const { user, store } = renderApp(`/settings/funding-types/${AUTISM}`);
    expect(screen.getByRole("heading", { level: 1, name: "Autism Funding" })).toBeTruthy();
    expect(field("Name of detail 1")).toHaveProperty("value", "Billing number");
    await user.clear(field("Type name"));
    await user.type(field("Type name"), "Autism Funding (old)");
    await user.click(screen.getByRole("button", { name: "Save funding type" }));
    expect(await screen.findByText("Funding type saved")).toBeTruthy();
    expect(store.getState().fundingTypes.find((t) => t.id === AUTISM)?.name).toBe(
      "Autism Funding (old)",
    );
    expect(store.getState().fundingTypes).toHaveLength(2);
  });

  it("says when the type isn't there", () => {
    renderApp("/settings/funding-types/gone");
    expect(screen.getByRole("heading", { name: "Funding type not found" })).toBeTruthy();
  });

  it("can't delete a type a patient is billed through, and says who is using it", () => {
    renderApp(`/settings/funding-types/${AUTISM}`);
    const button = screen.getByRole("button", { name: "Delete funding type" });
    expect(button).toHaveProperty("disabled", true);
    const hint = screen.getByText("Used by 1 patient. Move them to another type first.");
    expect(button.getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("deletes an unused type after asking, then says so", async () => {
    const { user, store, router } = renderApp(`/settings/funding-types/${ICBC}`);
    const button = screen.getByRole("button", { name: "Delete funding type" });
    expect(button).toHaveProperty("disabled", false);
    expect(screen.queryByText(/^Used by/)).toBeNull();
    await user.click(button);
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Delete ICBC?")).toBeTruthy();
    expect(
      dialog.getByText(
        "Ended fundings of this type are hidden from patients. Invoices already made keep their details.",
      ),
    ).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Delete funding type" }));
    expect(await screen.findByText("Funding type deleted")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/settings/funding-types");
    expect(store.getState().fundingTypes.map((t) => t.id)).toEqual([AUTISM]);
  });

  it("keeps the type when the delete dialog is cancelled", async () => {
    const { user, store } = renderApp(`/settings/funding-types/${ICBC}`);
    await user.click(screen.getByRole("button", { name: "Delete funding type" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(store.getState().fundingTypes).toHaveLength(2);
  });

  it("says 2 patients for a type two patients use", () => {
    const state = createDemoState();
    const [first] = state.patientFundings;
    if (!first) throw new Error("The demo has no patient funding.");
    const store = new DemoStore({
      ...state,
      patientFundings: [
        first,
        {
          ...first,
          id: "5eed0000-0000-4000-8000-000000000802",
          patientId: state.patients[0]?.id ?? "",
        },
      ],
    });
    renderApp(`/settings/funding-types/${AUTISM}`, store);
    expect(screen.getByText("Used by 2 patients. Move them to another type first.")).toBeTruthy();
  });

  it("has no Delete on a new type", () => {
    renderApp(NEW);
    expect(screen.queryByRole("button", { name: "Delete funding type" })).toBeNull();
  });
});
