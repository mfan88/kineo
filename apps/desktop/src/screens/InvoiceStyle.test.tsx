import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

const PATH = "/settings/invoice-style";

describe("Invoice style", () => {
  it("opens from Settings", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Invoice style/ }));
    expect(router.state.location.pathname).toBe(PATH);
    expect(screen.getByRole("heading", { level: 1, name: "Invoice style" })).toBeTruthy();
  });

  it("shows every option with the current style selected", () => {
    renderApp(PATH);
    for (const name of [
      "Sky",
      "Forest",
      "Ocean",
      "Plum",
      "Charcoal",
      "Clean",
      "Serif",
      "Nunito",
      "Logo left",
      "Centred",
    ]) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
    expect(screen.getByRole("radio", { name: "Sky" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "Clean" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "Logo left" })).toHaveProperty("checked", true);
    expect(screen.getByRole("textbox", { name: "Footer note (optional)" })).toHaveProperty(
      "value",
      "Thank you. Please keep this receipt for your insurance claim.",
    );
  });

  it("lists fonts with Clean first", () => {
    renderApp(PATH);
    const fonts = screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"));
    expect(fonts.filter((v) => ["clean", "serif", "nunito"].includes(v ?? ""))).toEqual([
      "clean",
      "serif",
      "nunito",
    ]);
  });

  it("saves the chosen style and confirms", async () => {
    const { user, store } = renderApp(PATH);
    await user.click(screen.getByRole("radio", { name: "Plum" }));
    await user.click(screen.getByRole("radio", { name: "Serif" }));
    await user.click(screen.getByRole("radio", { name: "Centred" }));
    const footer = screen.getByRole("textbox", { name: "Footer note (optional)" });
    await user.clear(footer);
    await user.type(footer, "  See you next time.  ");
    await user.click(screen.getByRole("button", { name: "Save style" }));

    expect(store.getState().invoiceStyle).toMatchObject({
      accentColor: "plum",
      font: "serif",
      headerLayout: "centred",
      footerNote: "See you next time.",
      logoPath: null,
    });
    expect(await screen.findByText("Style saved")).toBeTruthy();
  });

  it("doesn't save until Save style is pressed", async () => {
    const { user, store } = renderApp(PATH);
    await user.click(screen.getByRole("radio", { name: "Ocean" }));
    expect(store.getState().invoiceStyle.accentColor).toBe("sky");
  });

  it("counts footer characters and blocks saving over 500", async () => {
    const { user, store } = renderApp(PATH);
    const footer = screen.getByRole("textbox", { name: "Footer note (optional)" });
    await user.clear(footer);
    expect(screen.getByText("0 of 500 characters")).toBeTruthy();
    await user.click(footer);
    await user.paste("x".repeat(501));
    expect(screen.getByText("501 of 500 characters")).toBeTruthy();
    expect(screen.getByText("Keep the footer note to 500 characters or fewer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save style" })).toHaveProperty("disabled", true);
    expect(store.getState().invoiceStyle.footerNote).toMatch(/^Thank you/);
  });

  it("lets the footer note be empty", async () => {
    const { user, store } = renderApp(PATH);
    await user.clear(screen.getByRole("textbox", { name: "Footer note (optional)" }));
    await user.click(screen.getByRole("button", { name: "Save style" }));
    expect(store.getState().invoiceStyle.footerNote).toBe("");
  });
});
