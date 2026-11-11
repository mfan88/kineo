import { TrashBin } from "@gravity-ui/icons";
import { Button, Checkbox, Chip, Label, ListBox, NumberField, Select, Switch } from "@heroui/react";
import {
  InvoiceRuleError,
  formatCad,
  formatInvoiceNumber,
  invoiceLocks,
  invoiceTotals,
  lineTotalCents,
  type Visit,
} from "@kineo/shared";
import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { useDemoState, useStore } from "../data/DemoStoreProvider";
import { StoreError } from "../data/store";

const visitDateFormat = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timestampFormat = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return visitDateFormat.format(new Date(year, month - 1, day));
}

/** 500 → "5%", 1250 → "12.5%". Display only. */
function formatRate(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

const STATUS_TAGS = {
  draft: { label: "Draft", color: "warning" },
  sent: { label: "Sent", color: "accent" },
  paid: { label: "Paid", color: "success" },
} as const;

function newestFirst(a: Visit, b: Visit): number {
  if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Runs a change, turning a refused one into an error toast that says what to do. */
function attempt(change: () => void): void {
  try {
    change();
  } catch (caught) {
    if (caught instanceof InvoiceRuleError || caught instanceof StoreError) {
      notifyError(caught.message);
      return;
    }
    if (caught instanceof RangeError) {
      notifyError("Quantity must be a whole number of at least 1.");
      return;
    }
    throw caught;
  }
}

/** Invoice editor: visits, line items, tax and totals. Locked once sent. */
export function Invoice() {
  const { invoiceId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { invoices, patients, visits, lineItems, priceItems, settings } = useDemoState();

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);
  const lines = useMemo(
    () =>
      lineItems
        .filter((line) => line.invoiceId === invoiceId)
        .toSorted((a, b) => a.position - b.position),
    [lineItems, invoiceId],
  );

  if (!invoice) {
    return <Navigate to="/" replace />;
  }

  const locks = invoiceLocks(invoice.status);
  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const totals = invoiceTotals(lines, invoice);
  const tag = STATUS_TAGS[invoice.status];
  // A draft can take any of the patient's visits not on another invoice; once sent,
  // only the visits on it are shown.
  const shownVisits = visits
    .filter(
      (visit) =>
        visit.patientId === invoice.patientId &&
        (visit.invoiceId === invoice.id || (!locks.visits && visit.invoiceId === null)),
    )
    .toSorted(newestFirst);

  return (
    <Screen back title={`Invoice ${number}`} eyebrow={patient?.fullName ?? null}>
      <div className="flex items-center gap-2">
        <Chip variant="soft" color={tag.color}>
          {tag.label}
        </Chip>
        {locks.lineItems ? (
          <span className="text-sm text-muted">Sent invoices can't be changed.</span>
        ) : null}
      </div>

      <section aria-labelledby="visits-heading" className="flex flex-col gap-2">
        <h2 id="visits-heading" className="text-lg font-semibold">
          Visits
        </h2>
        {shownVisits.length === 0 ? (
          <p className="text-sm text-muted">
            {locks.visits ? "No visits are on this invoice." : "This patient has no visits to add."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shownVisits.map((visit) => (
              <li key={visit.id} className="flex min-h-11 items-center">
                <Checkbox
                  className="flex flex-row items-center gap-3"
                  isSelected={visit.invoiceId === invoice.id}
                  isDisabled={locks.visits}
                  onChange={(selected) =>
                    attempt(() => store.setVisitOnInvoice(invoice.id, visit.id, selected))
                  }
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>
                    <Label>{formatVisitDate(visit.visitDate)}</Label>
                  </Checkbox.Content>
                </Checkbox>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lines-heading" className="flex flex-col gap-3">
        <h2 id="lines-heading" className="text-lg font-semibold">
          Line items
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">No line items yet. Add one from your price list.</p>
        ) : (
          <ul aria-label="Line items" className="flex flex-col divide-y divide-separator">
            {lines.map((line) => (
              <li
                key={line.id}
                aria-label={line.name}
                className="flex min-h-14 items-center justify-between gap-4 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{line.name}</span>
                  <span className="text-sm text-muted">{formatCad(line.unitPriceCents)} each</span>
                </div>
                <div className="flex flex-row items-center gap-3">
                  {locks.lineItems ? (
                    <span className="text-sm text-muted">Qty {line.quantity}</span>
                  ) : (
                    <NumberField
                      aria-label={`Quantity of ${line.name}`}
                      value={line.quantity}
                      minValue={1}
                      step={1}
                      onChange={(value) => {
                        if (Number.isNaN(value)) return;
                        attempt(() => store.setLineQuantity(line.id, value));
                      }}
                      className="w-32"
                    >
                      <NumberField.Group className="h-11">
                        <NumberField.DecrementButton />
                        <NumberField.Input />
                        <NumberField.IncrementButton />
                      </NumberField.Group>
                    </NumberField>
                  )}
                  <span className="w-24 text-right font-medium tabular-nums">
                    {formatCad(lineTotalCents(line))}
                  </span>
                  {locks.lineItems ? null : (
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label={`Remove ${line.name}`}
                      className="size-11 min-w-11"
                      onPress={() => attempt(() => store.removeLine(line.id))}
                    >
                      <TrashBin width={18} height={18} aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {locks.lineItems ? null : priceItems.length === 0 ? (
          <p className="text-sm text-muted">
            Your price list is empty. Add items in Settings, under Price list and tax.
          </p>
        ) : (
          <Select
            aria-label="Add a line item"
            placeholder="Add a line item"
            selectedKey={null}
            onSelectionChange={(key) => {
              if (typeof key === "string") attempt(() => store.addLine(invoice.id, key));
            }}
            className="max-w-sm"
          >
            <Select.Trigger className="h-11">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox aria-label="Price list">
                {priceItems.map((item) => (
                  <ListBox.Item
                    key={item.id}
                    id={item.id}
                    textValue={item.name}
                    className="flex min-h-11 justify-between gap-4"
                  >
                    <span>{item.name}</span>
                    <span className="text-muted tabular-nums">
                      {formatCad(item.unitPriceCents)}
                    </span>
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}
      </section>

      <section
        aria-labelledby="totals-heading"
        className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-surface"
      >
        <h2 id="totals-heading" className="sr-only">
          Totals
        </h2>
        <Switch
          className="flex flex-row items-center gap-3"
          isSelected={invoice.taxEnabled}
          isDisabled={locks.tax}
          onChange={(enabled) => attempt(() => store.setTax(invoice.id, enabled))}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>
              Add tax (
              {formatRate(
                invoice.taxEnabled
                  ? invoice.taxRateBasisPoints
                  : settings.defaultTaxRateBasisPoints,
              )}
              )
            </Label>
          </Switch.Content>
        </Switch>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right">{formatCad(totals.subtotalCents)}</dd>
          {invoice.taxEnabled ? (
            <>
              <dt className="text-muted">Tax ({formatRate(invoice.taxRateBasisPoints)})</dt>
              <dd className="text-right">{formatCad(totals.taxCents)}</dd>
            </>
          ) : null}
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{formatCad(totals.totalCents)}</dd>
        </dl>
      </section>

      <div>
        {invoice.status === "draft" ? (
          <Button
            variant="primary"
            className="h-11 px-5"
            onPress={() => void navigate(`/invoices/${invoice.id}/preview`)}
          >
            Preview and send
          </Button>
        ) : invoice.status === "sent" ? (
          <Button
            variant="primary"
            className="h-11 px-5"
            onPress={() =>
              attempt(() => {
                store.recordPayment(invoice.id);
                notify("Marked paid");
              })
            }
          >
            Record payment
          </Button>
        ) : (
          <p className="text-muted">
            Paid on{" "}
            {invoice.paidAt ? timestampFormat.format(new Date(invoice.paidAt)) : "an unknown date"}.
            Kept for your tax records.
          </p>
        )}
      </div>
    </Screen>
  );
}
