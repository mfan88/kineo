import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ownRowId } from "@kineo/data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { NEW_ID, renderScreen, TEST_NOW, TEST_OWNER } from "@/test/render-screen";
import { PriceList } from "./index";

const mockRouter = {
  canGoBack: jest.fn<() => boolean>(),
  back: jest.fn<() => void>(),
  replace: jest.fn<(href: unknown) => void>(),
};
// jest.mock is hoisted above mockRouter, so look it up when the screen uses it.
jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useIsFocused: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const P_VISIT = "cccccccc-0000-4000-8000-000000000001";
const P_TAPE = "cccccccc-0000-4000-8000-000000000002";
const OWN = "eeeeeeee-0000-4000-8000-000000000001";

function priceRow(id: string, name: string, cents: number) {
  return {
    id,
    owner_id: TEST_OWNER,
    name,
    unit_price_cents: cents,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
  };
}

const PRICES = [priceRow(P_VISIT, "Follow-up visit", 9500), priceRow(P_TAPE, "Taping", 1999)];
const SETTINGS = {
  id: OWN,
  owner_id: TEST_OWNER,
  default_tax_rate_basis_points: 500,
  invoice_number_prefix: "INV-",
  updated_at: TEST_NOW,
};
const ROWS = { price_items: PRICES, practice_settings: [SETTINGS] };

function lookup(sql: string, parameters: unknown[]): unknown {
  if (sql.includes("FROM price_items"))
    return PRICES.find((row) => row.id === parameters[0]) ?? null;
  if (sql.includes("FROM practice_settings")) return { id: OWN };
  return null;
}

/** The number in "Your next invoice will be …". */
function nextInvoice(): unknown {
  return screen.getByTestId("next-invoice-example").props.children;
}

/** Finds the item for the removal, then says it's gone, as the database would. */
function goneAfterRemoval(failRestore = false) {
  let reads = 0;
  return (sql: string, parameters: unknown[]) => {
    if (!sql.includes("FROM price_items")) return lookup(sql, parameters);
    reads += 1;
    if (reads === 1) return lookup(sql, parameters);
    if (failRestore) throw new Error("write failed");
    return null;
  };
}

describe("Price list and tax", () => {
  it("lists what you charge, with the tax rate and the next invoice number", async () => {
    await renderScreen(<PriceList />, ROWS);
    expect(screen.getByRole("header", { name: "Price list and tax" })).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(screen.getByText("Add item")).toBeTruthy();
    expect(within(screen.getByLabelText("Follow-up visit")).getByText("$95.00")).toBeTruthy();
    expect(within(screen.getByLabelText("Taping")).getByText("$19.99")).toBeTruthy();
    expect(screen.getByLabelText("Default tax rate (%)").props.value).toBe("5");
    expect(screen.getByLabelText("Prefix text (optional)").props.value).toBe("INV");
    expect(screen.getByLabelText("Next invoice number").props.value).toBe("1");
    expect(nextInvoice()).toBe("INV-0001");
  });

  it("explains that changing a price leaves made invoices alone, and has the tax helper", async () => {
    await renderScreen(<PriceList />, ROWS);
    expect(
      screen.getByText("Changing a price doesn't change invoices you've already made."),
    ).toBeTruthy();
    expect(
      screen.getByText("Used when you turn tax on for an invoice. Tax is off by default."),
    ).toBeTruthy();
  });

  it("adds an item from the New item sheet, in whole cents, and empties it", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    // (gorhom's test mock always renders the sheet's content, open or not.)
    expect(screen.getByText("New item")).toBeTruthy();
    expect(screen.getByLabelText("Item price in dollars").props.keyboardType).toBe("decimal-pad");
    await fireEvent.changeText(screen.getByLabelText("Item name"), " Initial assessment ");
    await fireEvent.changeText(screen.getByLabelText("Item price in dollars"), "120.5");
    await fireEvent.press(screen.getByText("Save item"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("INSERT INTO price_items");
    expect(writes[0]?.parameters.slice(0, 4)).toEqual([
      NEW_ID,
      TEST_OWNER,
      "Initial assessment",
      12050,
    ]);
    expect((await screen.findAllByText("Item added")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Item name").props.value).toBe("");
    expect(screen.getByLabelText("Item price in dollars").props.value).toBe("");
  });

  it("asks for a name and a readable price before adding", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.changeText(screen.getByLabelText("Item price in dollars"), "ten");
    await fireEvent.press(screen.getByText("Save item"));
    expect(await screen.findByText("Give the item a name.")).toBeTruthy();
    expect(screen.getByText("Enter a price in dollars, like 95 or 95.50.")).toBeTruthy();
    expect(writes).toEqual([]);

    // Each error goes once its own field is typed in.
    await fireEvent.changeText(screen.getByLabelText("Item name"), "Taping");
    await waitFor(() => expect(screen.queryByText("Give the item a name.")).toBeNull());
    expect(screen.getByText("Enter a price in dollars, like 95 or 95.50.")).toBeTruthy();
  });

  it("renames and reprices an item", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.press(screen.getByLabelText("Edit Follow-up visit"));
    const editing = within(screen.getByLabelText("Editing Follow-up visit"));
    expect(editing.getByLabelText("Name").props.value).toBe("Follow-up visit");
    expect(editing.getByLabelText("Name: price in dollars").props.value).toBe("95.00");

    await fireEvent.changeText(editing.getByLabelText("Name"), "Follow-up (30 min)");
    await fireEvent.changeText(editing.getByLabelText("Name: price in dollars"), "100");
    await fireEvent.press(editing.getByText("Save item"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("UPDATE price_items SET name = ?, unit_price_cents = ?");
    expect(writes[0]?.parameters).toEqual(["Follow-up (30 min)", 10000, TEST_NOW, P_VISIT]);
    expect((await screen.findAllByText("Item updated")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByLabelText("Editing Follow-up visit")).toBeNull());
  });

  it("keeps editing open on a bad price, and cancels without saving", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.press(screen.getByLabelText("Edit Taping"));
    const editing = within(screen.getByLabelText("Editing Taping"));
    await fireEvent.changeText(editing.getByLabelText("Name: price in dollars"), "-1");
    await fireEvent.press(editing.getByText("Save item"));
    expect(await editing.findByText("Enter a price in dollars, like 95 or 95.50.")).toBeTruthy();
    await fireEvent.press(editing.getByText("Cancel"));
    expect(screen.queryByLabelText("Editing Taping")).toBeNull();
    expect(writes).toEqual([]);
  });

  it("removes an item", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.press(screen.getByLabelText("Remove Taping"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toContain("DELETE FROM price_items");
    expect(writes[0]?.parameters).toEqual([P_TAPE]);
    expect((await screen.findAllByText("Item removed")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Undo").length).toBeGreaterThan(0);
  });

  it("puts a removed item back with Undo", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, goneAfterRemoval());
    await fireEvent.press(screen.getByLabelText("Remove Taping"));
    const [undo] = await screen.findAllByText("Undo");
    if (!undo) throw new Error("The toast has no Undo.");
    await fireEvent.press(undo);
    await waitFor(() =>
      expect(writes.some((write) => write.sql.startsWith("INSERT INTO price_items"))).toBe(true),
    );
    const insert = writes.find((write) => write.sql.startsWith("INSERT INTO price_items"));
    expect(insert?.parameters.slice(0, 4)).toEqual([P_TAPE, TEST_OWNER, "Taping", 1999]);
  });

  it("says what to do when a removed item can't be put back", async () => {
    await renderScreen(<PriceList />, ROWS, goneAfterRemoval(true));
    await fireEvent.press(screen.getByLabelText("Remove Taping"));
    const [undo] = await screen.findAllByText("Undo");
    if (!undo) throw new Error("The toast has no Undo.");
    await fireEvent.press(undo);
    expect(
      (await screen.findAllByText("The item couldn't be put back. Try again.")).length,
    ).toBeGreaterThan(0);
  });

  it("has Add item as a text button beside the Price list heading, and Save settings pinned", async () => {
    await renderScreen(<PriceList />, ROWS);
    expect(screen.getByRole("header", { name: "Price list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add item" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeTruthy();
  });

  it("goes back to Save settings and Save item once each has saved", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.changeText(screen.getByLabelText("Default tax rate (%)"), "6");
    await fireEvent.press(screen.getByText("Save settings"));
    await waitFor(() => expect(writes.length).toBe(1));
    await waitFor(() => expect(screen.queryAllByText("Saving…")).toHaveLength(0));
    expect(screen.getByRole("button", { name: "Save settings" })).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Edit Taping"));
    const editing = within(screen.getByLabelText("Editing Taping"));
    await fireEvent.changeText(editing.getByLabelText("Name"), "Taping, two areas");
    await fireEvent.press(editing.getByText("Save item"));
    await waitFor(() => expect(writes.length).toBe(2));
    await waitFor(() => expect(screen.queryAllByText("Saving…")).toHaveLength(0));
  });

  it("saves the tax rate in basis points and the invoice number format", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    const year = String(new Date().getFullYear());
    await fireEvent.changeText(screen.getByLabelText("Default tax rate (%)"), "12.5");
    await fireEvent.changeText(screen.getByLabelText("Prefix text (optional)"), " KIN ");
    await fireEvent.press(screen.getByRole("switch", { name: "Show year" }));
    await fireEvent.press(screen.getByLabelText("Move year earlier"));
    await fireEvent.press(screen.getByRole("radio", { name: "Slash" }));
    await fireEvent.press(screen.getByRole("radio", { name: "3 digits" }));
    await fireEvent.changeText(screen.getByLabelText("Next invoice number"), "1250");
    expect(nextInvoice()).toBe(`${year}/KIN/1250`);
    await fireEvent.press(screen.getByText("Save settings"));

    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toMatch(/^UPDATE practice_settings SET /);
    expect(writes[0]?.parameters).toEqual([
      1250,
      "KIN",
      "year,prefix,month,number",
      1,
      1,
      0,
      "/",
      3,
      1250,
      TEST_NOW,
      OWN,
    ]);
    expect((await screen.findAllByText("Settings saved")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Prefix text (optional)").props.value).toBe("KIN");
  });

  it("says what to enter for a next number it can't use, and saves nothing", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    await fireEvent.changeText(screen.getByLabelText("Next invoice number"), "abc");
    await fireEvent.press(screen.getByText("Save settings"));
    expect(await screen.findByText("Enter a whole number of at least 1.")).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("creates the settings row with the practitioner's fixed ID the first time", async () => {
    const { writes } = await renderScreen(<PriceList />);
    expect(
      screen.getByText("No items yet. Add what you charge for so you can put it on invoices."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Default tax rate (%)").props.value).toBe("0");
    await fireEvent.changeText(screen.getByLabelText("Default tax rate (%)"), "5");
    await fireEvent.press(screen.getByText("Save settings"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toMatch(/^INSERT INTO practice_settings \(id, owner_id, /);
    expect(writes[0]?.parameters.slice(0, 4)).toEqual([
      ownRowId("practice_settings", TEST_OWNER),
      TEST_OWNER,
      500,
      "",
    ]);
  });

  it("refuses a tax rate it can't read or over 100%, saying what to enter", async () => {
    const { writes } = await renderScreen(<PriceList />, ROWS, lookup);
    for (const typed of ["abc", "101", "-1", "5.555"]) {
      await fireEvent.changeText(screen.getByLabelText("Default tax rate (%)"), typed);
      await fireEvent.press(screen.getByText("Save settings"));
      expect(
        await screen.findByText("Enter a tax rate from 0 to 100, like 5 or 12.5."),
      ).toBeTruthy();
    }
    expect(writes).toEqual([]);
    // 0 and 100 are both allowed.
    await fireEvent.changeText(screen.getByLabelText("Default tax rate (%)"), "100");
    await fireEvent.press(screen.getByText("Save settings"));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.parameters[0]).toBe(10000);
  });
});
