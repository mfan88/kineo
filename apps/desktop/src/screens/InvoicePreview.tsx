import interLatinExtUrl from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import interLatinUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { Button } from "@heroui/react";
import { renderInvoiceHtml } from "@kineo/invoice-template";
import {
  InvoiceRuleError,
  PROFILE_FIELD_LABELS,
  formatInvoiceNumber,
  profileErrors,
} from "@kineo/shared";
import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { useDemoState, useStore } from "../data/DemoStoreProvider";

/** Inter, bundled with the app, so the "Clean" invoice font renders in the preview and PDF. */
const FONT_FACE_CSS = `
@font-face { font-family: "Inter Variable"; font-weight: 100 900; font-display: block;
  src: url("${interLatinUrl}") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Inter Variable"; font-weight: 100 900; font-display: block;
  src: url("${interLatinExtUrl}") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
`;

/** Invoice preview: exactly what the patient receives, and the place to send it. */
export function InvoicePreview() {
  const { invoiceId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { invoices, patients, visits, lineItems, profile, settings, invoiceStyle } = useDemoState();
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(800);

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);

  const html = useMemo(() => {
    if (!invoice) return "";
    return renderInvoiceHtml({
      invoice,
      lines: lineItems.filter((line) => line.invoiceId === invoice.id),
      patient: patients.find((candidate) => candidate.id === invoice.patientId) ?? null,
      visits: visits.filter((visit) => visit.invoiceId === invoice.id),
      profile,
      settings,
      style: invoiceStyle,
      fontFaceCss: FONT_FACE_CSS,
    });
  }, [invoice, lineItems, patients, visits, profile, settings, invoiceStyle]);

  if (!invoice) {
    return <Navigate to="/" replace />;
  }

  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const lineCount = lineItems.filter((line) => line.invoiceId === invoice.id).length;
  const missingProfile = profileErrors(profile);

  // Reasons the draft can't be sent yet, each saying what to do.
  const problems: string[] = [];
  if (invoice.status === "draft" && lineCount === 0) {
    problems.push("Add at least one line item before sending.");
  }
  if (invoice.status === "draft" && missingProfile.length > 0) {
    const fields = missingProfile.map((error) => PROFILE_FIELD_LABELS[error.field].toLowerCase());
    problems.push(`Fill in your ${fields.join(", ")} in Settings, or stop showing it on invoices.`);
  }

  function send() {
    if (!invoice) return;
    try {
      store.sendInvoice(invoice.id);
      notify("Invoice sent");
      void navigate(`/invoices/${invoice.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof InvoiceRuleError) {
        notifyError(caught.message);
        return;
      }
      throw caught;
    }
  }

  /** Opens the system print dialog for just the invoice; choose "Save as PDF" there. */
  function downloadPdf() {
    const view = frame.current?.contentWindow;
    if (!view) {
      notifyError("The invoice isn't ready yet. Try again in a moment.");
      return;
    }
    view.focus();
    view.print();
  }

  /** Grows the frame to fit the invoice, so the page scrolls instead of the frame. */
  function fitFrame() {
    const document = frame.current?.contentDocument;
    // The body, not the whole document: the document is at least as tall as the frame.
    if (document) setFrameHeight(Math.ceil(document.body.getBoundingClientRect().height));
  }

  return (
    <Screen back title="Preview" eyebrow={`Invoice ${number}`}>
      {problems.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-2xl bg-danger-soft p-4 text-danger"
        >
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      ) : null}

      <iframe
        ref={frame}
        title={`Invoice ${number} as the patient sees it`}
        srcDoc={html}
        onLoad={fitFrame}
        style={{ height: frameHeight }}
        className="w-full rounded-2xl border-0 bg-white shadow-surface"
      />

      <div className="flex flex-wrap items-center gap-2">
        {invoice.status === "draft" ? (
          <Button
            variant="primary"
            className="h-11 px-5"
            isDisabled={problems.length > 0}
            onPress={send}
          >
            Mark as sent
          </Button>
        ) : (
          <p className="text-muted">
            {invoice.status === "paid"
              ? "This invoice has been paid."
              : "This invoice has been sent."}
          </p>
        )}
        <Button variant="secondary" className="h-11" onPress={downloadPdf}>
          Download PDF
        </Button>
      </div>
    </Screen>
  );
}
