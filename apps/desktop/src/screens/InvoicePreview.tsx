import { Button } from "@heroui/react";
import {
  InvoiceRuleError,
  PROFILE_FIELD_LABELS,
  formatCad,
  formatInvoiceNumber,
  invoiceProfileLines,
  invoiceTotals,
  lineTotalCents,
  profileErrors,
} from "@kineo/shared";
import { invoiceAccents, invoiceFonts } from "@kineo/tokens";
import { Navigate, useNavigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { useDemoState, useStore } from "../data/DemoStoreProvider";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}

/** 500 → "5%". Display only. */
function formatRate(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

/** Invoice preview: exactly what the patient receives, and the place to send it. */
export function InvoicePreview() {
  const { invoiceId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { invoices, patients, visits, lineItems, profile, settings, invoiceStyle } = useDemoState();

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);
  if (!invoice) {
    return <Navigate to="/" replace />;
  }

  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const lines = lineItems
    .filter((line) => line.invoiceId === invoice.id)
    .toSorted((a, b) => a.position - b.position);
  const visitDates = visits
    .filter((visit) => visit.invoiceId === invoice.id)
    .map((visit) => visit.visitDate)
    .toSorted();
  const totals = invoiceTotals(lines, invoice);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const issued = invoice.sentAt ?? invoice.createdAt;
  const fromLines = invoiceProfileLines(profile);
  const missingProfile = profileErrors(profile);
  const accent = invoiceAccents[invoiceStyle.accentColor].hex;
  const fontStack = invoiceFonts[invoiceStyle.font].stack;
  const centred = invoiceStyle.headerLayout === "centred";

  // Reasons the draft can't be sent yet, each saying what to do.
  const problems: string[] = [];
  if (invoice.status === "draft" && lines.length === 0) {
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

      <article
        aria-label={`Invoice ${number} as the patient sees it`}
        className="flex flex-col gap-6 rounded-2xl bg-white p-8 text-[#11181C] shadow-surface"
        style={{ fontFamily: fontStack }}
      >
        <div
          className={
            centred
              ? "flex flex-col items-center gap-3 text-center"
              : "flex items-start justify-between gap-6"
          }
        >
          <div className={centred ? "flex flex-col items-center gap-1" : "flex flex-col gap-1"}>
            {invoiceStyle.logoPath ? (
              <img src={invoiceStyle.logoPath} alt="" className="mb-2 h-12 w-auto object-contain" />
            ) : null}
            {fromLines.map((line, index) => (
              <p
                key={line.field}
                className={index === 0 ? "text-lg font-semibold" : "text-sm text-[#52525B]"}
              >
                {line.value}
              </p>
            ))}
          </div>
          <div className={centred ? "flex flex-col items-center" : "flex flex-col items-end"}>
            <p className="text-2xl font-semibold" style={{ color: accent }}>
              Invoice
            </p>
            <p className="text-sm">{number}</p>
            <p className="text-sm text-[#52525B]">{dateFormat.format(new Date(issued))}</p>
          </div>
        </div>

        <div className="h-0.5 rounded-full" style={{ background: accent }} />

        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#52525B]">Bill to</p>
          <p className="font-medium">{patient?.fullName ?? "Unknown patient"}</p>
          {visitDates.length > 0 ? (
            <p className="text-sm text-[#52525B]">
              {visitDates.length === 1 ? "Visit on " : "Visits on "}
              {visitDates.map(formatVisitDate).join(", ")}
            </p>
          ) : null}
        </div>

        <table className="w-full text-left tabular-nums">
          <thead>
            <tr className="text-sm" style={{ color: accent }}>
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Price</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="border-t border-[#E4E4E7] py-3 text-[#52525B]">
                  No line items
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.id} className="border-t border-[#E4E4E7]">
                  <td className="py-2">{line.name}</td>
                  <td className="py-2 text-right">{line.quantity}</td>
                  <td className="py-2 text-right">{formatCad(line.unitPriceCents)}</td>
                  <td className="py-2 text-right">{formatCad(lineTotalCents(line))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-y-1 tabular-nums">
          <dt className="text-[#52525B]">Subtotal</dt>
          <dd className="text-right">{formatCad(totals.subtotalCents)}</dd>
          {invoice.taxEnabled ? (
            <>
              <dt className="text-[#52525B]">Tax ({formatRate(invoice.taxRateBasisPoints)})</dt>
              <dd className="text-right">{formatCad(totals.taxCents)}</dd>
            </>
          ) : null}
          <dt className="font-semibold" style={{ color: accent }}>
            Total
          </dt>
          <dd className="text-right font-semibold">{formatCad(totals.totalCents)}</dd>
        </dl>

        {invoiceStyle.footerNote.trim() !== "" ? (
          <p className="border-t border-[#E4E4E7] pt-4 text-center text-sm text-[#52525B]">
            {invoiceStyle.footerNote}
          </p>
        ) : null}
      </article>

      {invoice.status === "draft" ? (
        <div>
          <Button
            variant="primary"
            className="h-11 px-5"
            isDisabled={problems.length > 0}
            onPress={send}
          >
            Mark as sent
          </Button>
        </div>
      ) : (
        <p className="text-muted">
          {invoice.status === "paid"
            ? "This invoice has been paid."
            : "This invoice has been sent."}
        </p>
      )}
    </Screen>
  );
}
