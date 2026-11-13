import { Button } from "@heroui/react";
import {
  formatCad,
  formatInvoiceNumber,
  invoiceDetailLine,
  invoiceTaxLabel,
  invoiceTotals,
  invoiceVisitDates,
  localDateString,
  type Invoice,
} from "@kineo/shared";
import { useRef } from "react";
import { Screen } from "../components/Screen";
import { StatusTag } from "../components/StatusTag";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { InvoiceFrame } from "../invoice/InvoiceFrame";
import { printInvoice, useInvoiceHtml } from "../invoice/useInvoiceHtml";

/** Runs a change, turning a refused one into an error toast that says what to do. */
function attempt(change: () => Promise<unknown>): void {
  change().catch((caught: unknown) => {
    const message = userMessage(caught);
    if (message === null) throw caught;
    notifyError(message);
  });
}

/**
 * A sent or paid invoice: its tag, the total, who it's for and when it was sent (or
 * paid), its visits and tax, and Record payment while it's waiting. The invoice itself
 * sits beside it, as the patient received it, with Download PDF to send it again.
 */
export function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const store = useStore();
  const { patients, visits, lineItems, settings } = usePracticeData();
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useInvoiceHtml(invoice);

  const today = localDateString(new Date());
  const lines = lineItems.filter((line) => line.invoiceId === invoice.id);
  const totals = invoiceTotals(lines, invoice);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const patientName =
    patients.find((candidate) => candidate.id === invoice.patientId)?.fullName ?? "Unknown patient";

  function recordPayment() {
    attempt(async () => {
      await store.recordPayment(invoice.id);
      // Undo moves it back to sent (unpaid), even after leaving this screen.
      notify("Marked paid", () => attempt(() => store.undoPayment(invoice.id)));
    });
  }

  function downloadPdf() {
    if (!printInvoice(frame.current)) {
      notifyError("The invoice isn't ready yet. Try again in a moment.");
    }
  }

  return (
    <Screen
      back
      wide
      large
      eyebrow={<StatusTag status={invoice.status} size="md" />}
      title={formatCad(totals.totalCents)}
      subtitle={invoiceDetailLine(number, patientName, invoice, today)}
    >
      <div className="grid grid-cols-[2fr_3fr] items-start gap-8">
        <div className="flex flex-col items-start gap-4">
          <dl className="flex w-full flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface">
            <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2">
              <dt>Visits</dt>
              <dd className="text-right tabular-nums">
                {invoiceVisitDates(visits, invoice.id, today)}
              </dd>
            </div>
            <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2">
              <dt>Tax</dt>
              <dd className="text-right tabular-nums">
                {invoiceTaxLabel(invoice, totals.taxCents)}
              </dd>
            </div>
          </dl>
          {invoice.status === "sent" ? (
            <Button variant="primary" className="h-11 px-5" onPress={recordPayment}>
              Record payment
            </Button>
          ) : null}
        </div>

        <section aria-label="Invoice" className="flex flex-col items-start gap-3">
          <InvoiceFrame
            ref={frame}
            title={`Invoice ${number} as the patient sees it`}
            html={html}
          />
          <Button variant="secondary" className="h-11" onPress={downloadPdf}>
            Download PDF
          </Button>
        </section>
      </div>
    </Screen>
  );
}
