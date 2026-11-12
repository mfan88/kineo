import { Button } from "@heroui/react";
import { renderInvoiceHtml } from "@kineo/invoice-template";
import { PROFILE_FIELD_LABELS, formatInvoiceNumber, profileErrors } from "@kineo/shared";
import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { useInvoicePending, usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { useLogoSrc } from "../data/useLogoSrc";
import { INVOICE_FONT_FACE_CSS } from "../invoice/fonts";
import { InvoiceFrame } from "../invoice/InvoiceFrame";

/** Invoice preview: exactly what the patient receives, and the place to send it. */
export function InvoicePreview() {
  const { invoiceId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { invoices, patients, visits, lineItems, profile, settings, invoiceStyle } =
    usePracticeData();
  const frame = useRef<HTMLIFrameElement>(null);
  const logoSrc = useLogoSrc(invoiceStyle.logoPath);
  // Until it reaches the server, its number may still change (another device used it).
  const pending = useInvoicePending(invoiceId);
  const [sending, setSending] = useState(false);

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
      logoSrc,
      fontFaceCss: INVOICE_FONT_FACE_CSS,
    });
  }, [invoice, lineItems, patients, visits, profile, settings, invoiceStyle, logoSrc]);

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
  if (invoice.status === "draft" && pending) {
    problems.push(
      "This invoice hasn't reached the server yet, so its number isn't final. Connect to the internet; you can send it once it's synced.",
    );
  }

  async function send() {
    if (!invoice) return;
    setSending(true);
    try {
      await store.sendInvoice(invoice.id);
      notify("Invoice sent");
      void navigate(`/invoices/${invoice.id}`, { replace: true });
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSending(false);
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

      <InvoiceFrame ref={frame} title={`Invoice ${number} as the patient sees it`} html={html} />

      <div className="flex flex-wrap items-center gap-2">
        {invoice.status === "draft" ? (
          <Button
            variant="primary"
            className="h-11 px-5"
            isDisabled={problems.length > 0}
            isPending={sending}
            onPress={() => void send()}
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
        <Button
          variant="secondary"
          className="h-11"
          // A PDF goes to the patient, so not before the number is final.
          isDisabled={invoice.status === "draft" && pending}
          onPress={downloadPdf}
        >
          Download PDF
        </Button>
      </div>
    </Screen>
  );
}
