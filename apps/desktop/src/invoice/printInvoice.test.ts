import { renderInvoiceHtml } from "@kineo/invoice-template";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "../data/store";
import { clearPrintedInvoice, printInvoice, shadowCss } from "./printInvoice";

const INVOICE = `<!doctype html><html><head><title>Invoice INV-0007</title>
<style>@font-face { font-family: "Nunito"; src: url("nunito.woff2"); }
@page { size: letter; margin: 0.6in; }
html, body { margin: 0; color: #11181C; }
body { font-size: 14px; }
.header { display: flex; }</style></head>
<body><main class="page"><header class="header"><p>Made-up Patient</p></header></main></body></html>`;

// In the Tauri window the page asks the app to save the PDF (src-tauri/src/pdf.rs).
const tauri = vi.hoisted(() => ({
  inApp: false,
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => tauri.inApp,
  invoke: tauri.invoke,
}));

beforeEach(() => {
  tauri.inApp = false;
  tauri.invoke.mockReset();
});

afterEach(() => {
  clearPrintedInvoice();
  vi.restoreAllMocks();
  document.title = "Kineō";
});

function printCopy() {
  const container = document.getElementById("kineo-print");
  return { container, root: container?.shadowRoot ?? null };
}

describe("printInvoice", () => {
  it("prints a copy of the invoice, named for the PDF, kept apart from the app's styles", async () => {
    const seen: string[] = [];
    vi.spyOn(window, "print").mockImplementation(() => {
      seen.push(document.title);
    });
    document.title = "Kineō";

    await printInvoice(INVOICE, "Invoice INV-0007");

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["Invoice INV-0007"]);
    expect(document.title).toBe("Kineō");

    const { container, root } = printCopy();
    expect(container?.parentElement).toBe(document.body);
    // Off screen and out of reach until it prints.
    expect(container?.style.visibility).toBe("hidden");
    expect(container?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.querySelector(".kineo-invoice main.page")?.textContent).toBe("Made-up Patient");

    // Page size and fonts go on the page; the rest stays inside the copy.
    const pageStyle = document.getElementById("kineo-print-style")?.textContent ?? "";
    expect(pageStyle).toContain("@page { size: letter; margin: 0.6in; }");
    expect(pageStyle).toContain('@font-face { font-family: "Nunito"');
    expect(pageStyle).toContain("body > :not(#kineo-print) { display: none !important; }");
    expect(pageStyle).not.toContain(".header");
    expect(root?.querySelector("style")?.textContent).toContain(".header { display: flex; }");
  });

  it("replaces the copy on the next print instead of adding another", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    await printInvoice(INVOICE, "Invoice INV-0007");
    await printInvoice(INVOICE.replace("Made-up Patient", "Another Example"), "Invoice INV-0008");
    expect(document.querySelectorAll("#kineo-print")).toHaveLength(1);
    expect(document.querySelectorAll("#kineo-print-style")).toHaveLength(1);
    expect(printCopy().root?.textContent).toContain("Another Example");
    expect(printCopy().root?.textContent).not.toContain("Made-up Patient");
  });

  it("passes on a failure to print, and puts the title back", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("no printer");
    });
    document.title = "Kineō";
    await expect(printInvoice(INVOICE, "Invoice INV-0007")).rejects.toThrow("no printer");
    expect(document.title).toBe("Kineō");
  });

  it("removes the copy when cleared", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    await printInvoice(INVOICE, "Invoice INV-0007");
    clearPrintedInvoice();
    expect(document.getElementById("kineo-print")).toBeNull();
    expect(document.getElementById("kineo-print-style")).toBeNull();
  });
});

describe("printInvoice in the Mac app", () => {
  beforeEach(() => {
    tauri.inApp = true;
    vi.spyOn(window, "print").mockImplementation(() => {});
  });

  it("saves through the Save panel, with the copy in place, instead of printing", async () => {
    tauri.invoke.mockImplementation(() => {
      // The copy is ready by the time the app turns the page into a PDF.
      expect(printCopy().root?.textContent).toContain("Made-up Patient");
      return Promise.resolve("saved");
    });
    await expect(printInvoice(INVOICE, "Invoice INV-0007")).resolves.toBe("saved");
    expect(tauri.invoke).toHaveBeenCalledWith("save_pdf", { title: "Invoice INV-0007" });
    expect(window.print).not.toHaveBeenCalled();
  });

  it("does nothing more when the Save panel is closed", async () => {
    tauri.invoke.mockResolvedValue("cancelled");
    await expect(printInvoice(INVOICE, "Invoice INV-0007")).resolves.toBe("cancelled");
    expect(window.print).not.toHaveBeenCalled();
  });

  it("opens the print dialog where the app can't save directly", async () => {
    tauri.invoke.mockResolvedValue("unsupported");
    await expect(printInvoice(INVOICE, "Invoice INV-0007")).resolves.toBe("printed");
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("passes on a failed save", async () => {
    tauri.invoke.mockRejectedValue(new Error("The PDF couldn't be saved."));
    await expect(printInvoice(INVOICE, "Invoice INV-0007")).rejects.toThrow(
      "The PDF couldn't be saved.",
    );
  });
});

describe("shadowCss", () => {
  it("moves the template's html and body rules onto the wrapper, and resets what the app passes down", () => {
    const css = shadowCss(
      "@page { size: letter; }\nhtml, body { margin: 0; }\nbody { font-size: 14px; }\n.body-text { color: red; }",
    );
    expect(css).toContain(":host { all: initial; display: block; }");
    expect(css).toContain(".kineo-invoice { margin: 0; }");
    expect(css).toContain(".kineo-invoice { font-size: 14px; }");
    // Only whole selectors change, not class names that merely contain "body".
    expect(css).toContain(".body-text { color: red; }");
    expect(css).not.toContain("@page");
  });

  it("leaves no html or body rule in the real template's CSS", () => {
    const state = createDemoState();
    const invoice = state.invoices[0];
    if (!invoice) throw new Error("No demo invoice");
    const html = renderInvoiceHtml({
      invoice,
      lines: state.lineItems.filter((line) => line.invoiceId === invoice.id),
      patient: state.patients.find((patient) => patient.id === invoice.patientId) ?? null,
      visits: state.visits.filter((visit) => visit.invoiceId === invoice.id),
      profile: state.profile,
      settings: state.settings,
      style: state.invoiceStyle,
      logoSrc: null,
    });
    const templateCss = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("style")?.textContent;
    const css = shadowCss(templateCss ?? "");
    expect(css).toContain(".kineo-invoice {");
    expect(css).not.toMatch(/(^|[\s},])(html|body)\s*[,{]/);
  });
});
