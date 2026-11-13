import {
  billToProblems,
  countLabel,
  formatCad,
  formatDayMonth,
  formatInvoiceNumber,
  formatTodayTitle,
  invoiceTotals,
  lineDateLabel,
  lineTotalCents,
  notYetOnServerCopy,
  resolvedBillTo,
  type LineItem,
} from "@kineo/shared";
import { router } from "expo-router";
import { BottomSheet, Button, Card, Checkbox, Switch, useToast } from "heroui-native";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, findNodeHandle, Pressable, View } from "react-native";
import { StatusTag } from "@/components/status-tag";
import { openInvoicePreview } from "@/components/open-invoice";
import { PriceItemSheet } from "@/components/price-item-sheet";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { FormSkeleton } from "@/components/skeletons";
import {
  PracticeGate,
  useInvoicePending,
  usePracticeData,
  usePracticeWriter,
} from "@/data/practice-data";
import { editorLines, editorVisits, formatRate } from "@/utils/invoice-editor";
import { localDate } from "@/utils/local-date";
import { userMessage } from "@/utils/user-message";
import { useThemeColors } from "@/theme/theme-colors";
import { BillToCard, type BillToFocus } from "./bill-to-card";
import { InvoiceDetail } from "./detail";

const CHANGE_FAILED = "That change couldn't be saved. Try again.";

/**
 * An invoice. A draft opens in the editor, kept short: who it's for and how many
 * visits (open to change them), one collapsed row per line (open one to change its
 * quantity or remove it), "+ Add line item" from the price list, the tax switch and
 * the totals, with Preview and send pinned. Sent and paid invoices open their detail.
 */
function InvoiceScreen({ invoiceId, today = new Date() }: { invoiceId: string; today?: Date }) {
  const writer = usePracticeWriter();
  const {
    invoices,
    patients,
    visits,
    lineItems,
    priceItems,
    settings,
    fundingTypes,
    patientFundings,
  } = usePracticeData();
  const { toast } = useToast();
  const colors = useThemeColors();
  // Until it reaches the server, its number may still change (another device used it).
  const notOnServer = useInvoicePending(invoiceId);
  const [showVisits, setShowVisits] = useState(false);
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [newItem, setNewItem] = useState(false);
  // Asks one line to take screen-reader focus (`n` makes a repeat request count).
  const [focusLine, setFocusLine] = useState<{ lineId: string; n: number } | null>(null);
  const focus = useRef<BillToFocus>({ details: {}, alert: { current: null } });

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

  if (invoice.status !== "draft") {
    return <InvoiceDetail invoice={invoice} today={today} />;
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

  const todayDate = localDate(today);
  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const totals = invoiceTotals(lines, invoice);
  const waiting = notOnServer;
  const offline = notYetOnServerCopy("phone");
  const shownVisits = editorVisits(visits, invoice, false);
  const visitsOnIt = shownVisits.filter((visit) => visit.invoiceId === invoice.id).length;
  const summary = `${patient?.fullName ?? "Unknown patient"} · ${countLabel(visitsOnIt, "visit")}`;
  const taxRate = invoice.taxEnabled
    ? invoice.taxRateBasisPoints
    : settings.defaultTaxRateBasisPoints;

  const visitDate = (date: string) =>
    date === todayDate ? formatTodayTitle(todayDate) : formatDayMonth(date, todayDate);

  function addLine(priceItemId: string) {
    if (!invoice) return;
    setAddingLine(false);
    attempt(() => writer.addLine(invoice.id, priceItemId));
  }

  /** "+ New price list item": the line sheet gives way to the new-item sheet. */
  function startNewItem() {
    setAddingLine(false);
    setNewItem(true);
  }

  function saveDraft() {
    // Every change is already saved on this phone; this only confirms it and leaves.
    toast.show("Draft saved");
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  // What stops this invoice being sent that the phone can show next to its field: a missing
  // recipient, detail or line date. (A blank patient name can't be fixed here.)
  const billTo = resolvedBillTo(invoice, patient ?? null);
  const visitDates = visits
    .filter((visit) => visit.invoiceId === invoice.id)
    .map((visit) => visit.visitDate);
  const problems = billToProblems({ billTo, lines, visitDates }).filter(
    (problem) => problem.target.kind !== "patientName",
  );
  const funded = billTo.kind === "funding";
  const pillDates = [...new Set(visitDates)].toSorted();
  const dateProblemLineId = problems.find((problem) => problem.target.kind === "lineDate")?.target;

  /** Preview and send: opens the preview, or shows the first Bill to problem and goes to it. */
  function previewAndSend() {
    if (!invoice) return;
    const [first] = problems;
    if (!first) {
      openInvoicePreview(invoice.id);
      return;
    }
    if (first.target.kind === "detail") {
      focus.current.details[first.target.detailId]?.focus();
    } else if (first.target.kind === "lineDate") {
      // Open the line, and its date choices take focus once they're on screen.
      setOpenLineId(first.target.lineId);
      setFocusLine((current) => ({
        lineId: first.target.kind === "lineDate" ? first.target.lineId : "",
        n: (current?.n ?? 0) + 1,
      }));
    } else {
      const node = findNodeHandle(focus.current.alert.current);
      if (node !== null && node !== undefined) AccessibilityInfo.setAccessibilityFocus(node);
    }
  }

  const footer = (
    <View className="gap-1">
      {waiting ? <Text className="pb-1 text-sm text-foreground">{offline.explanation}</Text> : null}
      <Button className="min-h-12 w-full" isDisabled={waiting} onPress={previewAndSend}>
        Preview and send
      </Button>
      <Button variant="ghost" className="min-h-11 w-full" onPress={saveDraft}>
        Save draft
      </Button>
    </View>
  );

  return (
    <Screen
      back
      title={waiting ? offline.title : number}
      aside={<StatusTag status={invoice.status} size="md" />}
      footer={footer}
    >
      <View className="-mt-4 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="shrink text-sm text-muted">{summary}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showVisits }}
            onPress={() => setShowVisits((shown) => !shown)}
            className="min-h-11 justify-center active:opacity-70"
          >
            <Text className="text-sm font-medium text-link">
              {showVisits ? "Done" : "Change visits"}
            </Text>
          </Pressable>
        </View>
        {waiting ? (
          <>
            <Text accessibilityRole="alert" className="text-sm text-foreground">
              {offline.status}
            </Text>
            <Text className="text-sm text-foreground">
              <Text className="text-muted">{offline.numberLabel}: </Text>
              {offline.numberValue}
            </Text>
          </>
        ) : null}
      </View>

      {patient ? (
        <BillToCard
          key={billTo.kind === "funding" ? (billTo.patientFundingId ?? "funding") : "patient"}
          invoice={invoice}
          billTo={billTo}
          patient={patient}
          fundings={patientFundings}
          types={fundingTypes}
          today={todayDate}
          problems={problems}
          focus={focus}
        />
      ) : null}

      {showVisits ? (
        shownVisits.length === 0 ? (
          <Text className="text-sm text-muted">This patient has no visits to add.</Text>
        ) : (
          <Card accessibilityLabel="Visits" className="px-4 py-0">
            {shownVisits.map((visit, index) => {
              const date = visitDate(visit.visitDate);
              const selected = visit.invoiceId === invoice.id;
              const toggle = () =>
                attempt(() => writer.setVisitOnInvoice(invoice.id, visit.id, !selected));
              return (
                // The whole row is the target; the box inside only shows the state.
                <Pressable
                  key={visit.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={date}
                  accessibilityState={{ checked: selected }}
                  onPress={toggle}
                  className={`min-h-13 flex-row items-center gap-3 py-2 ${index > 0 ? "border-t border-separator" : ""}`}
                >
                  <Checkbox
                    isSelected={selected}
                    onSelectedChange={toggle}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text className="text-foreground">{date}</Text>
                </Pressable>
              );
            })}
          </Card>
        )
      ) : null}

      <Card accessibilityLabel="Line items" className="px-4 py-0">
        {lines.length === 0 ? (
          <Text className="py-4 text-sm text-muted">No line items yet.</Text>
        ) : (
          lines.map((line, index) => (
            <LineRow
              key={line.id}
              line={line}
              first={index === 0}
              dates={
                funded
                  ? {
                      label: lineDateLabel(line.serviceDate),
                      choices: pillDates.map((date) => ({
                        date,
                        label: visitDate(date),
                        selected: line.serviceDate === date,
                      })),
                      problem:
                        dateProblemLineId?.kind === "lineDate" &&
                        dateProblemLineId.lineId === line.id,
                      focus: focusLine?.lineId === line.id ? focusLine.n : 0,
                      onPick: (date) => attempt(() => writer.setLineServiceDate(line.id, date)),
                    }
                  : null
              }
              open={openLineId === line.id}
              onToggle={() => setOpenLineId((current) => (current === line.id ? null : line.id))}
              onQuantity={(quantity) => attempt(() => writer.setLineQuantity(line.id, quantity))}
              onRemove={() => {
                setOpenLineId(null);
                attempt(() => writer.removeLine(line.id));
              }}
            />
          ))
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setAddingLine(true)}
          className="min-h-13 flex-row items-center border-t border-separator active:opacity-70"
        >
          <Text className="font-medium text-link">+ Add line item</Text>
        </Pressable>
      </Card>

      <Card className="px-4 py-1">
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={`Add tax (${formatRate(taxRate)})`}
          accessibilityState={{ checked: invoice.taxEnabled }}
          onPress={() => attempt(() => writer.setTax(invoice.id, !invoice.taxEnabled))}
          className="min-h-13 flex-row items-center justify-between gap-3"
        >
          <Text className="shrink text-foreground">Add tax ({formatRate(taxRate)})</Text>
          <Switch
            isSelected={invoice.taxEnabled}
            onSelectedChange={(enabled) => attempt(() => writer.setTax(invoice.id, enabled))}
            // HeroUI Native draws the off track from --default, too faint on a card (as in Profile).
            animation={{
              backgroundColor: { value: [colors.controlTrack, colors.primaryStrong] },
            }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      </Card>

      <Card accessibilityLabel="Totals" className="gap-2 p-4">
        <TotalRow label="Subtotal" amount={formatCad(totals.subtotalCents)} />
        {invoice.taxEnabled ? (
          <TotalRow
            label={`Tax (${formatRate(invoice.taxRateBasisPoints)})`}
            amount={formatCad(totals.taxCents)}
          />
        ) : null}
        <TotalRow label="Total" amount={formatCad(totals.totalCents)} strong />
      </Card>

      <BottomSheet isOpen={addingLine} onOpenChange={setAddingLine}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View className="gap-3 pb-6">
              <BottomSheet.Title>Add line item</BottomSheet.Title>
              {priceItems.length === 0 ? (
                <Text className="text-sm text-muted">Your price list is empty.</Text>
              ) : (
                <View accessibilityLabel="Your price list">
                  {priceItems.map((item, index) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${item.name}, ${formatCad(item.unitPriceCents)}`}
                      onPress={() => addLine(item.id)}
                      className={`min-h-13 flex-row items-center justify-between gap-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
                    >
                      <Text className="shrink text-foreground">{item.name}</Text>
                      <Text className="text-muted tabular-nums">
                        {formatCad(item.unitPriceCents)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={startNewItem}
                className="min-h-13 justify-center border-t border-separator active:opacity-70"
              >
                <Text className="font-medium text-link">+ New price list item</Text>
              </Pressable>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>

      <PriceItemSheet
        isOpen={newItem}
        onOpenChange={setNewItem}
        onAdded={(item) => addLine(item.id)}
      />
    </Screen>
  );
}

/** What a funded invoice's line needs to show and change its visit date. */
interface LineDates {
  /** "4 Nov", or "Pick a date". */
  label: string;
  choices: { date: string; label: string; selected: boolean }[];
  /** This line is the one Preview and send is waiting on. */
  problem: boolean;
  /** Counts up each time this line is asked to take screen-reader focus; 0 for never. */
  focus: number;
  onPick: (date: string) => void;
}

/**
 * One line, collapsed to its name, quantity and amount. Opening it shows the unit
 * price, − and + for the quantity, and Remove.
 */
function LineRow({
  line,
  first,
  dates,
  open,
  onToggle,
  onQuantity,
  onRemove,
}: {
  line: LineItem;
  first: boolean;
  /** On a funded invoice: the line's date and the visit dates to choose from. Otherwise null. */
  dates: LineDates | null;
  open: boolean;
  onToggle: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const amount = formatCad(lineTotalCents(line));
  const colors = useThemeColors();
  const pillsRef = useRef<ComponentRef<typeof View>>(null);
  const focusRequest = dates?.focus ?? 0;
  // Asked to take focus (Preview and send found this line undated): once its choices are open.
  useEffect(() => {
    if (focusRequest === 0 || !open) return;
    const node = findNodeHandle(pillsRef.current);
    if (node !== null && node !== undefined) AccessibilityInfo.setAccessibilityFocus(node);
  }, [focusRequest, open]);
  const title = dates ? `${dates.label} \u00b7 ${line.name}` : line.name;
  const summary = (
    <>
      <Text className="shrink text-foreground">{title}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="text-muted tabular-nums">{line.quantity} ×</Text>
        <Text className="font-medium text-foreground tabular-nums">{amount}</Text>
      </View>
    </>
  );
  const border = first ? "" : "border-t border-separator";

  return (
    <View accessibilityLabel={line.name} className={border}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${line.quantity} ×, ${amount}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className="min-h-13 flex-row items-center justify-between gap-3 active:opacity-70"
      >
        {summary}
      </Pressable>
      {open && dates ? (
        <View className="gap-2 pb-3">
          <Text className="text-sm text-muted">Visit date</Text>
          <View
            ref={pillsRef}
            accessible
            accessibilityRole="radiogroup"
            accessibilityLabel={`Visit date for ${line.name}`}
            className="flex-row flex-wrap gap-2"
          >
            {dates.choices.map((choice) => (
              <Pressable
                key={choice.date}
                accessibilityRole="radio"
                accessibilityLabel={choice.label}
                accessibilityState={{ checked: choice.selected }}
                onPress={() => dates.onPick(choice.date)}
                className="min-h-11 justify-center rounded-full border px-4 active:opacity-70"
                style={{
                  backgroundColor: choice.selected ? colors.tint : undefined,
                  borderColor: choice.selected ? colors.primaryStrong : colors.inputEdge,
                }}
              >
                <Text
                  className="font-medium"
                  style={{ color: choice.selected ? colors.textOnTint : colors.text }}
                >
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {dates.problem ? (
            <Text className="text-sm" style={{ color: colors.error }}>
              Pick a visit date for each line item before sending.
            </Text>
          ) : null}
        </View>
      ) : null}
      {open ? (
        <View className="flex-row items-center justify-between gap-3 pb-3">
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
              onPress={() => onQuantity(line.quantity - 1)}
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
              onPress={() => onQuantity(line.quantity + 1)}
            >
              <Button.Label>+</Button.Label>
            </Button>
            <Button
              variant="ghost"
              className="-mr-3 min-h-11"
              accessibilityLabel={`Remove ${line.name}`}
              onPress={onRemove}
            >
              Remove
            </Button>
          </View>
        </View>
      ) : null}
    </View>
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
      <Text className={strong ? "font-bold text-lg text-foreground" : "text-muted"}>{label}</Text>
      <Text
        className={`tabular-nums ${strong ? "font-bold text-lg text-foreground" : "text-muted"}`}
      >
        {amount}
      </Text>
    </View>
  );
}

/** Invoice, behind a skeleton in its shape until the practice has been read. */
export function Invoice({ invoiceId, today }: { invoiceId: string; today?: Date }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Invoice" showBlocks={showBlocks} />}
    >
      <InvoiceScreen invoiceId={invoiceId} {...(today ? { today } : {})} />
    </PracticeGate>
  );
}
