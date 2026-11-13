import { statusTagFor, statusTags } from "@kineo/tokens";
import { formatCad, formatInvoiceNumber, invoiceTotals, type Invoice } from "@kineo/shared";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";
import { StatusTag } from "../components/StatusTag";
import { usePracticeData } from "../data/PracticeStoreProvider";

/** Newest first: by when it was created, then by number. */
function newestFirst(a: Invoice, b: Invoice): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.number - a.number;
}

/** Every invoice, newest first. Opening one goes to its editor. */
export function Invoices() {
  const navigate = useNavigate();
  const { invoices, patients, lineItems, settings } = usePracticeData();

  const rows = useMemo(() => {
    const names = new Map(patients.map((patient) => [patient.id, patient.fullName]));
    return invoices.toSorted(newestFirst).map((invoice) => ({
      invoice,
      number: formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number),
      patientName: names.get(invoice.patientId) ?? "Unknown patient",
      total: formatCad(
        invoiceTotals(
          lineItems.filter((line) => line.invoiceId === invoice.id),
          invoice,
        ).totalCents,
      ),
    }));
  }, [invoices, patients, lineItems, settings.invoiceNumberPrefix]);

  return (
    <Screen back title="Invoices">
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-10 text-center shadow-surface">
          <p className="font-medium">No invoices yet</p>
          <p className="text-sm text-muted">
            Invoice a patient's visits from their page and they'll show up here.
          </p>
        </div>
      ) : (
        <ul
          aria-label="Invoices"
          className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
        >
          {rows.map(({ invoice, number, patientName, total }) => {
            return (
              <li key={invoice.id}>
                <button
                  type="button"
                  aria-label={`${number}, ${patientName}, ${total}, ${statusTags[statusTagFor(invoice.status)].label}`}
                  onClick={() => void navigate(`/invoices/${invoice.id}`)}
                  className="flex min-h-14 w-full items-center gap-4 px-4 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="w-24 text-sm text-muted tabular-nums">{number}</span>
                  <span className="flex-1 font-medium">{patientName}</span>
                  <span className="font-medium tabular-nums">{total}</span>
                  <StatusTag status={invoice.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
