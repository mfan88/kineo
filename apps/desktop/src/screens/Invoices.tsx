import { statusTagFor, statusTags } from "@kineo/tokens";
import {
  formatCad,
  invoiceNumberLabel,
  initialInvoiceGroup,
  invoiceGroupPill,
  invoiceGroups,
  invoiceTotals,
  parseInvoiceGroup,
  type InvoiceGroupKey,
} from "@kineo/shared";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Screen } from "../components/Screen";
import { StatusTag } from "../components/StatusTag";
import { usePracticeData } from "../data/PracticeStoreProvider";

/** What an empty group says. */
const EMPTY: Record<InvoiceGroupKey, { title: string; body: string }> = {
  notSent: { title: "Nothing to send", body: "Invoices you haven't sent yet show up here." },
  waiting: {
    title: "You're all caught up",
    body: "Sent invoices waiting on payment show up here.",
  },
  paid: { title: "No paid invoices yet", body: "Invoices you mark paid show up here." },
  cancelled: {
    title: "No cancelled invoices",
    body: "Invoices you cancel stay here as a record.",
  },
};

/**
 * Invoices in four groups, picked with pills: Not sent yet, Waiting on payment, Paid
 * and Cancelled, each with its count, newest first. The group shown is kept in the address
 * (`?group=waiting`), so Home's Waiting on payment card can open that one.
 */
export function Invoices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { invoices, patients, lineItems, settings } = usePracticeData();

  const groups = useMemo(() => invoiceGroups(invoices), [invoices]);
  const rows = useMemo(() => {
    const names = new Map(patients.map((patient) => [patient.id, patient.fullName]));
    return new Map(
      invoices.map((invoice) => [
        invoice.id,
        {
          invoice,
          number: invoiceNumberLabel(invoice, settings.invoiceNumberFormat),
          patientName: names.get(invoice.patientId) ?? "Unknown patient",
          total: formatCad(
            invoiceTotals(
              lineItems.filter((line) => line.invoiceId === invoice.id),
              invoice,
            ).totalCents,
          ),
        },
      ]),
    );
  }, [invoices, patients, lineItems, settings.invoiceNumberFormat]);

  if (invoices.length === 0) {
    return (
      <Screen back title="Invoices">
        <div className="rounded-2xl bg-surface px-6 py-10 text-center shadow-surface">
          <p className="font-medium">No invoices yet</p>
          <p className="text-sm text-muted">
            Invoice a patient's visits from their page and they'll show up here.
          </p>
        </div>
      </Screen>
    );
  }

  const shownKey = initialInvoiceGroup(groups, parseInvoiceGroup(searchParams.get("group")));
  const shown = groups.find((group) => group.key === shownKey);
  const shownRows = (shown?.invoices ?? []).flatMap((invoice) => rows.get(invoice.id) ?? []);

  return (
    <Screen back title="Invoices">
      <div role="tablist" aria-label="Invoice groups" className="-mt-2 flex flex-wrap gap-2">
        {groups.map((group) => {
          const pill = invoiceGroupPill(group);
          const selected = group.key === shownKey;
          return (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={pill.accessibilityLabel}
              onClick={() => setSearchParams({ group: group.key }, { replace: true })}
              className={`flex h-11 items-center rounded-full px-4 font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                selected
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface hover:bg-surface-hover"
              }`}
            >
              {pill.text}
            </button>
          );
        })}
      </div>

      {shownRows.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-10 text-center shadow-surface">
          <p className="font-medium">{EMPTY[shownKey].title}</p>
          <p className="text-sm text-muted">{EMPTY[shownKey].body}</p>
        </div>
      ) : (
        <ul
          aria-label={`Invoices: ${shown?.label ?? ""}`}
          className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
        >
          {shownRows.map(({ invoice, number, patientName, total }) => (
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
          ))}
        </ul>
      )}
    </Screen>
  );
}
