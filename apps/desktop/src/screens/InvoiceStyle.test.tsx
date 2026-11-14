import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("No file input");
  return input;
}

function previewHtml(): string {
  return screen.getByTitle("Invoice style preview").getAttribute("srcdoc") ?? "";
}

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

  it("says who the style applies to, truthfully, and keeps Save style at the top right", () => {
    renderApp(PATH);
    expect(
      screen.getByText(/Applies to every invoice in Kineō, including ones already sent\./),
    ).toBeTruthy();
    expect(screen.getByText(/PDFs you've already shared don't change\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save style" }).getAttribute("form")).toBe(
      "invoice-style-form",
    );
    expect(screen.getAllByRole("button", { name: "Save style" })).toHaveLength(1);
  });

  it("shows header layout, accent and font as cards, each named", () => {
    renderApp(PATH);
    const groups = screen.getAllByRole("radiogroup").map((group) => group.textContent);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toContain("Header layout");
    expect(groups[1]).toContain("Accent colour");
    expect(groups[2]).toContain("Font");
    // The font cards show "Aa" in each font.
    expect(screen.getAllByText("Aa")).toHaveLength(3);
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
      showMadeWith: true,
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

  describe("live preview", () => {
    it("shows the latest invoice in the saved style", () => {
      renderApp(PATH);
      expect(screen.getByText("Preview with invoice INV-0003")).toBeTruthy();
      const html = previewHtml();
      expect(html).toContain("<title>Invoice INV-0003</title>");
      expect(html).toContain("Casey Fictional");
      expect(html).toContain("color: #0369A1");
    });

    it("updates as options change, before saving", async () => {
      const { user, store } = renderApp(PATH);
      await user.click(screen.getByRole("radio", { name: "Forest" }));
      await user.click(screen.getByRole("radio", { name: "Centred" }));
      await user.click(screen.getByRole("radio", { name: "Serif" }));
      const footer = screen.getByRole("textbox", { name: "Footer note (optional)" });
      await user.clear(footer);
      await user.type(footer, "New footer");

      const html = previewHtml();
      expect(html).toContain("color: #166534");
      expect(html).toContain('<header class="header centred">');
      expect(html).toContain("font-family: Georgia");
      expect(html).toContain('<p class="footer-note">New footer</p>');
      expect(screen.getByText(/not saved yet/)).toBeTruthy();
      expect(store.getState().invoiceStyle.accentColor).toBe("sky");
    });

    it("renders Nunito with the bundled font", async () => {
      const { user } = renderApp(PATH);
      await user.click(screen.getByRole("radio", { name: "Nunito" }));
      const html = previewHtml();
      expect(html).toContain('font-family: "Nunito Variable"');
      expect(html).toMatch(
        /@font-face \{ font-family: "Nunito Variable";[^}]*nunito-latin-wght-normal/,
      );
    });

    it("stops saying not saved once saved", async () => {
      const { user } = renderApp(PATH);
      await user.click(screen.getByRole("radio", { name: "Ocean" }));
      await user.click(screen.getByRole("button", { name: "Save style" }));
      expect(screen.queryByText(/not saved yet/)).toBeNull();
    });

    it("uses a made-up sample when there are no invoices", () => {
      const state = createDemoState();
      renderApp(PATH, new DemoStore({ ...state, invoices: [], lineItems: [] }));
      expect(screen.getByText("Preview with a sample invoice")).toBeTruthy();
      expect(previewHtml()).toContain("Sample Patient");
      expect(previewHtml()).toContain("Sample treatment");
    });
  });

  describe("Made with Kineō", () => {
    it("is on by default, and turning it off drops it from the preview and saves", async () => {
      const { user, store } = renderApp(PATH);
      const toggle = screen.getByRole("switch", { name: /Made with Kineō/ });
      expect(toggle).toHaveProperty("checked", true);
      expect(screen.getByText("Free to turn off during the beta.")).toBeTruthy();
      expect(previewHtml()).toContain("Made with");

      await user.click(toggle);
      expect(previewHtml()).not.toContain("Made with");
      expect(screen.getByText(/not saved yet/)).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Save style" }));
      expect(store.getState().invoiceStyle.showMadeWith).toBe(false);
    });
  });

  describe("logo", () => {
    // A made-up 1×1 PNG.
    const PNG_BYTES = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const png = () => new File([PNG_BYTES], "logo.png", { type: "image/png" });

    async function addLogo(
      user: ReturnType<typeof renderApp>["user"],
      slot: "Header logo" | "Footer logo",
    ) {
      await user.click(screen.getByRole("button", { name: "Add a logo" }));
      await user.click(await screen.findByRole("menuitem", { name: slot }));
      await user.upload(fileInput(), png());
    }

    it("says there's no branding and offers both slots from the + menu", async () => {
      const { user } = renderApp(PATH);
      expect(screen.getByText("Branding")).toBeTruthy();
      expect(screen.getByText(/· No branding/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Remove header logo" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Add a logo" }));
      expect(await screen.findByRole("menuitem", { name: "Header logo" })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: "Footer logo" })).toBeTruthy();
    });

    it("previews a chosen header logo on the page and the invoice, and saves it", async () => {
      const { user, store } = renderApp(PATH);
      await addLogo(user, "Header logo");

      const shown = await screen.findByRole("img", { name: "Header logo" });
      expect(shown.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
      expect(previewHtml()).toContain('<img class="logo" src="data:image/png;base64,');
      expect(screen.getByText(/not saved yet/)).toBeTruthy();
      expect(screen.queryByText(/· No branding/)).toBeNull();

      await user.click(screen.getByRole("button", { name: "Save style" }));
      expect(store.getState().invoiceStyle.logoPath).toMatch(/^data:image\/png;base64,/);
    });

    it("adds a footer logo, then the menu offers only the header logo", async () => {
      const { user, store } = renderApp(PATH);
      await addLogo(user, "Footer logo");

      expect(await screen.findByRole("img", { name: "Footer logo" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Remove footer logo" })).toBeTruthy();
      expect(previewHtml()).toContain("footer-logo");

      await user.click(screen.getByRole("button", { name: "Add a logo" }));
      expect(await screen.findByRole("menuitem", { name: "Header logo" })).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: "Footer logo" })).toBeNull();

      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Save style" }));
      expect(store.getState().invoiceStyle.footerLogoPath).toMatch(/^data:image\/png;base64,/);
      expect(store.getState().invoiceStyle.logoPath).toBeNull();
    });

    it("hides the + when both logos are set, and shows the hint once", async () => {
      const state = createDemoState();
      const store = new DemoStore({
        ...state,
        invoiceStyle: {
          ...state.invoiceStyle,
          logoPath: "data:image/png;base64,AAAA",
          footerLogoPath: "data:image/png;base64,AAAA",
        },
      });
      renderApp(PATH, store);
      expect(screen.queryByRole("button", { name: "Add a logo" })).toBeNull();
      expect(screen.getAllByText("PNG, JPEG or SVG, up to 1 MB.")).toHaveLength(1);
    });

    it("removes a logo slot", async () => {
      const state = createDemoState();
      const store = new DemoStore({
        ...state,
        invoiceStyle: {
          ...state.invoiceStyle,
          logoPath: "data:image/png;base64,AAAA",
          footerLogoPath: "data:image/png;base64,BBBB",
        },
      });
      const { user } = renderApp(PATH, store);
      await user.click(screen.getByRole("button", { name: "Remove header logo" }));
      expect(screen.queryByRole("img", { name: "Header logo" })).toBeNull();
      expect(screen.getByRole("img", { name: "Footer logo" })).toBeTruthy();
      expect(previewHtml()).not.toContain('class="logo"');
      await user.click(screen.getByRole("button", { name: "Save style" }));
      expect(store.getState().invoiceStyle.logoPath).toBeNull();
      expect(store.getState().invoiceStyle.footerLogoPath).toMatch(/^data:image/);
    });

    it("refuses the wrong type of file", async () => {
      const { store } = renderApp(PATH);
      const gif = new File(["GIF89a"], "logo.gif", { type: "image/gif" });
      // The picker's accept list hides other types, but a file can still be dropped in.
      fireEvent.change(fileInput(), { target: { files: [gif] } });
      await screen.findByRole("alert");
      expect(screen.getByRole("alert").textContent).toBe("Choose a PNG, JPEG or SVG image.");
      expect(screen.queryByRole("img", { name: "Header logo" })).toBeNull();
      expect(store.getState().invoiceStyle.logoPath).toBeNull();
    });

    it("refuses an image over 1 MB", async () => {
      const { user } = renderApp(PATH);
      const big = new File([new Uint8Array(1024 * 1024 + 1)], "big.png", { type: "image/png" });
      await user.upload(fileInput(), big);
      expect(screen.getByRole("alert").textContent).toBe("Choose an image of 1 MB or less.");
    });
  });
});
