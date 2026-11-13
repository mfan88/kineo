import { ChevronDown, TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, Checkbox, Dropdown, Label, NumberField, Switch } from "@heroui/react";
import {
  billToProblems,
  formatCad,
  formatDayMonth,
  invoiceNumberLabel,
  invoiceTotals,
  lineTotalCents,
  localDateString,
  notYetOnServerCopy,
  resolvedBillTo,
  sendProblems,
  sentenceLabel,
  type Visit,
} from "@kineo/shared";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { BillToCard } from "../components/BillToCard";
import { PendingButton } from "../components/PendingButton";
import { PriceItemDialog } from "../components/PriceItemDialog";
import { Screen } from "../components/Screen";
import { StatusTag } from "../components/StatusTag";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { useInvoicePending, usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { InvoiceFrame } from "../invoice/InvoiceFrame";
import { downloadInvoicePdf, useClearPrintedInvoice } from "../invoice/printInvoice";
import { useInvoiceHtml } from "../invoice/useInvoiceHtml";
import { InvoiceDetail } from "./InvoiceDetail";

/** The price list menu's last entry, which opens the New item dialog. */
const NEW_ITEM = "new-price-list-item";

/** 500 → "5%", 1250 → "12.5%". Display only. */
function formatRate(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

function newestFirst(a: Visit, b: Visit): number {
  if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Runs a change, turning a refused one into an error toast that says what to do. */
function attempt(change: () => Promise<unknown>): void {
  change().catch((caught: unknown) => {
    if (caught instanceof RangeError) {
      notifyError("Quantity must be a whole number of at least 1.");
      return;
    }
    const message = userMessage(caught);
    if (message === null) throw caught;
    notifyError(message);
  });
}

/**
 * An invoice. A draft opens in the editor: one page with the visit checklist, line
 * items, tax and total on the left and the live preview on the right, with Send
 * invoice at the top right. Sent and paid invoices open their detail.
 */
export function Invoice() {
  const { invoiceId = "" } = useParams();
  const { invoices } = usePracticeData();
  const invoice = invoices.find((candidate) => candidate.id === invoiceId);

  if (!invoice) {
    return <Navigate to="/" replace />;
  }
  if (invoice.status !== "draft") {
    return <InvoiceDetail invoice={invoice} />;
  }
  return <DraftEditor invoiceId={invoice.id} />;
}

/** Takes the person to the field a problem is about. */
function focusField(attribute: "data-detail-id" | "data-line-id", id: string) {
  document.querySelector<HTMLElement>(`[${attribute}="${id}"]`)?.focus();
}

/** A small text button inside the problem alert that takes you to the field to fix. */
function FieldButton({ onPress, children }: { onPress: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}

function DraftEditor({ invoiceId }: { invoiceId: string }) {
  const store = useStore();
  const navigate = useNavigate();
  const { invoices, patients, visits, lineItems, priceItems, profile, settings } =
    usePracticeData();
  // Until it reaches the server, its number may still change (another device used it).
  const notOnServer = useInvoicePending(invoiceId);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [newItem, setNewItem] = useState(false);

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);
  const html = useInvoiceHtml(invoice);
  useClearPrintedInvoice();
  const lines = useMemo(
    () =>
      lineItems
        .filter((line) => line.invoiceId === invoiceId)
        .toSorted((a, b) => a.position - b.position),
    [lineItems, invoiceId],
  );

  if (!invoice) return null;

  const today = localDateString(new Date());
  const patientName =
    patients.find((candidate) => candidate.id === invoice.patientId)?.fullName ?? "Unknown patient";
  const number = invoiceNumberLabel(invoice, settings.invoiceNumberFormat);
  const totals = invoiceTotals(lines, invoice);
  const offline = notYetOnServerCopy("computer");
  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const billTo = resolvedBillTo(invoice, patient ?? null);
  const funded = billTo.kind === "funding";
  const visitDates = visits
    .filter((visit) => visit.invoiceId === invoice.id)
    .map((visit) => visit.visitDate)
    .toSorted();
  const dateChoices = [...new Set(visitDates)];
  const billProblems = billToProblems({ billTo, lines, visitDates });
  // Not being on the server yet is explained under the title, so the alert leaves it out.
  const problems = sendProblems({
    invoice,
    lineCount: lines.length,
    profile,
    pending: false,
    billing: { billTo, lines, visitDates },
  });
  const blocked = problems.length > 0 || notOnServer;
  // A draft can take any of the patient's visits not on another invoice.
  const shownVisits = visits
    .filter(
      (visit) =>
        visit.patientId === invoice.patientId &&
        (visit.invoiceId === invoice.id || visit.invoiceId === null),
    )
    .toSorted(newestFirst);

  /** The label of one of the invoice's Bill to details. */
  const detailLabel = (id: string): string =>
    (billTo.kind === "funding" ? billTo.details.find((detail) => detail.id === id)?.label : null) ??
    "detail";

  async function markSent() {
    if (!invoice) return;
    setSending(true);
    try {
      await store.sendInvoice(invoice.id);
      setConfirming(false);
      // This page now shows the sent invoice's detail.
      notify("Invoice sent");
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSending(false);
    }
  }

  const sendActions = (
    <div className="flex items-center gap-1">
      <Button
        variant="primary"
        className="h-11 px-5"
        isDisabled={blocked}
        onPress={() => setConfirming(true)}
      >
        Send invoice
      </Button>
      <Dropdown>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="More ways to send"
          className="size-11 min-w-11"
          isDisabled={blocked}
        >
          <ChevronDown width={18} height={18} aria-hidden />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            aria-label="More ways to send"
            onAction={(key) => {
              if (key === "download") downloadInvoicePdf(html, number);
              else setConfirming(true);
            }}
          >
            <Dropdown.Item id="download" textValue="Download PDF" className="min-h-11">
              Download PDF
            </Dropdown.Item>
            <Dropdown.Item id="mark-sent" textValue="Mark as sent" className="min-h-11">
              Mark as sent
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );

  return (
    <Screen
      back
      wide
      title={notOnServer ? offline.title : number}
      aside={
        <>
          <StatusTag status={invoice.status} size="md" />
          <span role="status" className="text-[13px] text-muted">
            {notOnServer ? offline.status : "Saved on this device"}
          </span>
        </>
      }
      action={sendActions}
    >
      {notOnServer ? (
        <div className="-mt-4 flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted">{offline.numberLabel}: </span>
            {offline.numberValue}
          </p>
          <p className="max-w-xl">{offline.explanation}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 items-start gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {patient ? (
            <BillToCard invoice={invoice} patient={patient} problems={billProblems} />
          ) : null}

          <section aria-labelledby="visits-heading" className="flex flex-col gap-2">
            <h2 id="visits-heading" className="text-[15px] font-semibold text-muted">
              Visits for {patientName}
            </h2>
            {shownVisits.length === 0 ? (
              <p className="text-sm text-muted">This patient has no visits to add.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface">
                {shownVisits.map((visit) => (
                  <li key={visit.id} className="flex min-h-12 items-center px-4">
                    <Checkbox
                      isSelected={visit.invoiceId === invoice.id}
                      onChange={(selected) =>
                        attempt(() => store.setVisitOnInvoice(invoice.id, visit.id, selected))
                      }
                      className="w-full"
                    >
                      {/* Content is the clickable label, so the box goes inside it. Keyboard
                          focus rings the whole row, from its input's :focus-visible (HeroUI's
                          ring on the box never shows here: the row isn't marked focus-visible).
                          An empty box gets a muted border (3:1 on the card); a ticked one keeps
                          its fill. */}
                      <Checkbox.Content className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] flex-row items-center gap-3 rounded-xl px-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-solid">
                        <Checkbox.Control className="border-muted in-data-[selected=true]:border-transparent">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Label>{formatDayMonth(visit.visitDate, today)}</Label>
                      </Checkbox.Content>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="lines-heading" className="flex flex-col gap-2">
            <h2 id="lines-heading" className="text-[15px] font-semibold text-muted">
              Line items
            </h2>
            <div className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface">
              {lines.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">No line items yet.</p>
              ) : (
                <ul aria-label="Line items" className="flex flex-col divide-y divide-separator">
                  {lines.map((line) => (
                    <li
                      key={line.id}
                      aria-label={line.name}
                      className="flex min-h-14 items-center justify-between gap-3 py-2 pr-1 pl-4"
                    >
                      {funded ? (
                        <select
                          aria-label={`Visit date for ${line.name}`}
                          data-line-id={line.id}
                          value={line.serviceDate ?? ""}
                          onChange={(event) =>
                            attempt(() =>
                              store.setLineServiceDate(line.id, event.target.value || null),
                            )
                          }
                          {...(!line.serviceDate ? { "aria-invalid": true } : {})}
                          className="h-11 w-28 flex-none rounded-xl bg-field-background px-2 text-[15px] text-foreground"
                        >
                          <option value="">Pick a date</option>
                          {dateChoices.map((date) => (
                            <option key={date} value={date}>
                              {formatDayMonth(date, today)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{line.name}</span>
                        <span className="text-[13px] text-muted tabular-nums">
                          {formatCad(line.unitPriceCents)} each
                        </span>
                      </div>
                      <div className="flex flex-row items-center gap-2">
                        <NumberField
                          aria-label={`Quantity of ${line.name}`}
                          value={line.quantity}
                          minValue={1}
                          step={1}
                          onChange={(value) => {
                            if (Number.isNaN(value)) return;
                            attempt(() => store.setLineQuantity(line.id, value));
                          }}
                          className="w-28"
                        >
                          <NumberField.Group className="h-11">
                            <NumberField.DecrementButton />
                            <NumberField.Input />
                            <NumberField.IncrementButton />
                          </NumberField.Group>
                        </NumberField>
                        <span className="w-20 text-right font-medium tabular-nums">
                          {formatCad(lineTotalCents(line))}
                        </span>
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label={`Remove ${line.name}`}
                          className="size-11 min-w-11"
                          onPress={() => attempt(() => store.removeLine(line.id))}
                        >
                          <TrashBin width={18} height={18} aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Dropdown>
                <Button
                  variant="ghost"
                  className="h-12 w-full justify-start rounded-t-none rounded-b-2xl px-4 font-medium text-accent"
                >
                  + Add from price list
                </Button>
                <Dropdown.Popover placement="bottom start" className="min-w-80">
                  <Dropdown.Menu
                    aria-label="Price list"
                    onAction={(key) => {
                      if (key === NEW_ITEM) {
                        setNewItem(true);
                      } else if (typeof key === "string") {
                        attempt(() => store.addLine(invoice.id, key));
                      }
                    }}
                  >
                    {priceItems.map((item) => (
                      <Dropdown.Item
                        key={item.id}
                        id={item.id}
                        textValue={item.name}
                        className="flex min-h-11 justify-between gap-4"
                      >
                        <span>{item.name}</span>
                        <span className="text-muted tabular-nums">
                          {formatCad(item.unitPriceCents)}
                        </span>
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Item
                      id={NEW_ITEM}
                      textValue="+ New price list item"
                      className="min-h-11 font-medium text-accent"
                    >
                      + New price list item
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          </section>

          <section
            aria-labelledby="totals-heading"
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-surface"
          >
            <h2 id="totals-heading" className="sr-only">
              Totals
            </h2>
            <Switch
              isSelected={invoice.taxEnabled}
              onChange={(enabled) => attempt(() => store.setTax(invoice.id, enabled))}
            >
              {/* Content is the clickable label, so the switch goes inside it. */}
              <Switch.Content className="flex min-h-11 w-full flex-row items-center justify-between gap-3">
                <Label>
                  {invoice.taxEnabled
                    ? `Add tax (${formatRate(invoice.taxRateBasisPoints)})`
                    : `Add tax (${formatRate(settings.defaultTaxRateBasisPoints)} from Settings)`}
                </Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t border-separator pt-3 tabular-nums">
              {invoice.taxEnabled ? (
                <>
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="text-right text-muted">{formatCad(totals.subtotalCents)}</dd>
                  <dt className="text-muted">Tax ({formatRate(invoice.taxRateBasisPoints)})</dt>
                  <dd className="text-right text-muted">{formatCad(totals.taxCents)}</dd>
                </>
              ) : null}
              <dt className="text-lg font-bold">Total</dt>
              <dd className="text-right text-lg font-bold">{formatCad(totals.totalCents)}</dd>
            </dl>
          </section>
        </div>

        <section aria-labelledby="preview-heading" className="flex min-w-0 flex-col gap-2">
          <h2 id="preview-heading" className="text-[15px] font-semibold text-muted">
            Live preview
          </h2>
          <InvoiceFrame title={`Invoice ${number} as the patient sees it`} html={html} />
          <p className="text-sm text-muted">
            Visit dates and services only. Notes never appear on invoices.
          </p>
          {problems.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {problems.map((problem) => (
                <p key={problem.message}>
                  {problem.message}
                  {problem.target?.kind === "detail" || problem.target?.kind === "lineDate"
                    ? " "
                    : null}
                  {problem.target?.kind === "detail" ? (
                    <FieldButton
                      onPress={() => {
                        const target = problem.target;
                        if (target?.kind !== "detail") return;
                        focusField("data-detail-id", target.detailId);
                      }}
                    >
                      {`Fill in ${sentenceLabel(detailLabel(problem.target.detailId))}`}
                    </FieldButton>
                  ) : null}
                  {problem.target?.kind === "lineDate" ? (
                    <FieldButton
                      onPress={() => {
                        const target = problem.target;
                        if (target?.kind !== "lineDate") return;
                        focusField("data-line-id", target.lineId);
                      }}
                    >
                      Pick the dates
                    </FieldButton>
                  ) : null}
                  {problem.inProfile ? " " : null}
                  {problem.inProfile ? (
                    <a
                      href="/settings/profile"
                      className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                      onClick={(event) => {
                        event.preventDefault();
                        void navigate("/settings/profile");
                      }}
                    >
                      Open Your profile
                    </a>
                  ) : null}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <PriceItemDialog
        isOpen={newItem}
        onOpenChange={setNewItem}
        onAdded={(item) => attempt(() => store.addLine(invoice.id, item.id))}
      />

      <AlertDialog.Backdrop isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Send {number}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Download the PDF and send it to {patientName}. Once it's marked as sent, it can't be
                changed.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="secondary"
                className="h-11"
                onPress={() => downloadInvoicePdf(html, number)}
              >
                Download PDF
              </Button>
              <PendingButton
                variant="primary"
                className="h-11"
                autoFocus
                pending={sending}
                pendingLabel="Sending…"
                onPress={() => void markSent()}
              >
                Mark as sent
              </PendingButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </Screen>
  );
}
