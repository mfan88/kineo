import {
  formatCad,
  formatInvoiceNumber,
  invoiceLocks,
  invoiceTotals,
  lineTotalCents,
  notYetOnServerCopy,
} from "@kineo/shared";
import { Button, Card, Checkbox, Switch, useToast } from "heroui-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { StatusTag } from "@/components/status-tag";
import { openInvoicePreview } from "@/components/open-invoice";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { FormSkeleton } from "@/components/skeletons";
import {
  PracticeGate,
  useInvoicePending,
  usePracticeData,
  usePracticeWriter,
} from "@/data/practice-data";
import { editorLines, editorVisits, formatPaidDate, formatRate } from "@/utils/invoice-editor";
import { userMessage } from "@/utils/user-message";
import { formatVisitDate } from "@/utils/visits";

const CHANGE_FAILED = "That change couldn't be saved. Try again.";

/** Invoice editor: visits, line items, tax and totals. Locked once sent. */
function InvoiceScreen({ invoiceId }: { invoiceId: string }) {
  const writer = usePracticeWriter();
  const { invoices, patients, visits, lineItems, priceItems, settings } = usePracticeData();
  const { toast } = useToast();
  // Until it reaches the server, its number may still change (another device used it).
  const notOnServer = useInvoicePending(invoiceId);

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);
  const lines = useMemo(() => editorLines(lineItems, invoiceId), [lineItems, invoiceId]);

  if (!invoice) {
    return (
      <Screen back title="Invoice not found">
        <Text className="text-muted">
          This invoice isn't on this phone any more. Go back and pick one from Invoices.
        </Text>
      </Screen>
    );
  }

  /** Runs a change; a refused one becomes a toast that says what to do. */
  function attempt(change: () => Promise<unknown>): void {
    change().catch((caught: unknown) => {
      // A rule's own message is safe to show; anything else may hold patient details.
      const message =
        caught instanceof RangeError
          ? "Quantity must be a whole number of at least 1."
          : (userMessage(caught) ?? CHANGE_FAILED);
      toast.show({ variant: "danger", label: message });
    });
  }

  const locks = invoiceLocks(invoice.status);
  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const totals = invoiceTotals(lines, invoice);
  const waiting = invoice.status === "draft" && notOnServer;
  const offline = notYetOnServerCopy("phone");
  const shownVisits = editorVisits(visits, invoice, locks.visits);
  const taxRate = invoice.taxEnabled
    ? invoice.taxRateBasisPoints
    : settings.defaultTaxRateBasisPoints;

  return (
    <Screen
      back
      title={waiting ? offline.title : `Invoice ${number}`}
      eyebrow={patient?.fullName ?? null}
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusTag status={invoice.status} size="md" />
        {locks.lineItems ? (
          <Text className="text-sm text-muted">Sent invoices can't be changed.</Text>
        ) : null}
      </View>
      {waiting ? (
        <View className="gap-1">
          <Text accessibilityRole="alert" className="text-sm text-foreground">
            {offline.status}
          </Text>
          <Text className="text-sm text-foreground">
            <Text className="text-muted">{offline.numberLabel}: </Text>
            {offline.numberValue}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
          Visits
        </Text>
        {shownVisits.length === 0 ? (
          <Text className="text-sm text-muted">
            {locks.visits ? "No visits are on this invoice." : "This patient has no visits to add."}
          </Text>
        ) : (
          <View accessibilityLabel="Visits">
            {shownVisits.map((visit) => {
              const date = formatVisitDate(visit.visitDate);
              const selected = visit.invoiceId === invoice.id;
              const toggle = () =>
                attempt(() => writer.setVisitOnInvoice(invoice.id, visit.id, !selected));
              return (
                // The whole row is the target; the box inside only shows the state.
                <Pressable
                  key={visit.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={date}
                  accessibilityState={{ checked: selected, disabled: locks.visits }}
                  disabled={locks.visits}
                  onPress={toggle}
                  className="min-h-11 flex-row items-center gap-3"
                >
                  <Checkbox
                    isSelected={selected}
                    isDisabled={locks.visits}
                    onSelectedChange={toggle}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text className="text-foreground">{date}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View className="gap-3">
        <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
          Line items
        </Text>
        {lines.length === 0 ? (
          <Text className="text-sm text-muted">
            {locks.lineItems
              ? "No line items are on this invoice."
              : "No line items yet. Add one from your price list."}
          </Text>
        ) : (
          <View accessibilityLabel="Line items">
            {lines.map((line, index) => (
              <View
                key={line.id}
                accessibilityLabel={line.name}
                className={`gap-1 py-3 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="shrink font-medium text-foreground">{line.name}</Text>
                  <Text className="font-medium text-foreground tabular-nums">
                    {formatCad(lineTotalCents(line))}
                  </Text>
                </View>
                {locks.lineItems ? (
                  <Text className="text-sm text-muted tabular-nums">
                    {formatCad(line.unitPriceCents)} each · Qty {line.quantity}
                  </Text>
                ) : (
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="shrink text-sm text-muted tabular-nums">
                      {formatCad(line.unitPriceCents)} each
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Button
                        isIconOnly
                        variant="secondary"
                        className="size-11"
                        accessibilityLabel={`One fewer ${line.name}`}
                        isDisabled={line.quantity <= 1}
                        onPress={() =>
                          attempt(() => writer.setLineQuantity(line.id, line.quantity - 1))
                        }
                      >
                        <Button.Label>−</Button.Label>
                      </Button>
                      <Text
                        accessibilityLabel={`Quantity of ${line.name}: ${line.quantity}`}
                        className="min-w-8 text-center font-medium text-foreground"
                      >
                        {line.quantity}
                      </Text>
                      <Button
                        isIconOnly
                        variant="secondary"
                        className="size-11"
                        accessibilityLabel={`One more ${line.name}`}
                        onPress={() =>
                          attempt(() => writer.setLineQuantity(line.id, line.quantity + 1))
                        }
                      >
                        <Button.Label>+</Button.Label>
                      </Button>
                      <Button
                        variant="ghost"
                        className="-mr-3 min-h-11"
                        accessibilityLabel={`Remove ${line.name}`}
                        onPress={() => attempt(() => writer.removeLine(line.id))}
                      >
                        Remove
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {locks.lineItems ? null : priceItems.length === 0 ? (
          <Text className="text-sm text-muted">
            Your price list is empty. Add items in Settings, under Price list and tax.
          </Text>
        ) : (
          <Card accessibilityLabel="Add from your price list" className="px-4 py-2">
            <Text className="pt-2 text-sm text-muted">Add from your price list</Text>
            {priceItems.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.name}, ${formatCad(item.unitPriceCents)}`}
                onPress={() => attempt(() => writer.addLine(invoice.id, item.id))}
                className={`min-h-11 flex-row items-center justify-between gap-3 py-2 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
              >
                <Text className="shrink text-foreground">{item.name}</Text>
                <Text className="text-muted tabular-nums">{formatCad(item.unitPriceCents)}</Text>
              </Pressable>
            ))}
          </Card>
        )}
      </View>

      <Card accessibilityLabel="Totals" className="gap-3 p-4">
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={`Add tax (${formatRate(taxRate)})`}
          accessibilityState={{ checked: invoice.taxEnabled, disabled: locks.tax }}
          disabled={locks.tax}
          onPress={() => attempt(() => writer.setTax(invoice.id, !invoice.taxEnabled))}
          className="min-h-11 flex-row items-center justify-between gap-3"
        >
          <Text className="shrink text-foreground">Add tax ({formatRate(taxRate)})</Text>
          <Switch
            isSelected={invoice.taxEnabled}
            isDisabled={locks.tax}
            onSelectedChange={(enabled) => attempt(() => writer.setTax(invoice.id, enabled))}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
        <View className="gap-1">
          <TotalRow label="Subtotal" amount={formatCad(totals.subtotalCents)} />
          {invoice.taxEnabled ? (
            <TotalRow
              label={`Tax (${formatRate(invoice.taxRateBasisPoints)})`}
              amount={formatCad(totals.taxCents)}
            />
          ) : null}
          <TotalRow label="Total" amount={formatCad(totals.totalCents)} strong />
        </View>
      </Card>

      {invoice.status === "draft" ? (
        <View className="gap-2">
          {waiting ? <Text className="text-sm text-foreground">{offline.explanation}</Text> : null}
          <Button
            className="min-h-11 self-start"
            isDisabled={waiting}
            onPress={() => openInvoicePreview(invoice.id)}
          >
            Preview and send
          </Button>
        </View>
      ) : invoice.status === "sent" ? (
        <Button
          className="min-h-11 self-start"
          onPress={() =>
            attempt(async () => {
              await writer.recordPayment(invoice.id);
              // Undo moves it back to sent (unpaid), even after leaving this screen.
              // Stays until used or swiped away: it may be the only way back (design brief).
              toast.show({
                label: "Marked paid",
                duration: "persistent",
                actionLabel: "Undo",
                onActionPress: ({ hide }) => {
                  hide();
                  attempt(() => writer.undoPayment(invoice.id));
                },
              });
            })
          }
        >
          Record payment
        </Button>
      ) : (
        <Text className="text-muted">
          Paid on {invoice.paidAt ? formatPaidDate(invoice.paidAt) : "an unknown date"}. Kept for
          your tax records.
        </Text>
      )}
    </Screen>
  );
}

function TotalRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <View accessibilityLabel={`${label}: ${amount}`} className="flex-row justify-between gap-3">
      <Text className={strong ? "font-semibold text-foreground" : "text-muted"}>{label}</Text>
      <Text
        className={`tabular-nums ${strong ? "font-semibold text-foreground" : "text-foreground"}`}
      >
        {amount}
      </Text>
    </View>
  );
}

/** Invoice, behind a skeleton in its shape until the practice has been read. */
export function Invoice({ invoiceId }: { invoiceId: string }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Invoice" showBlocks={showBlocks} />}
    >
      <InvoiceScreen invoiceId={invoiceId} />
    </PracticeGate>
  );
}
