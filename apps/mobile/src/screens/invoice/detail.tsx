import {
  formatCad,
  formatInvoiceNumber,
  invoiceDetailLine,
  invoiceTaxLabel,
  invoiceTotals,
  invoiceVisitDates,
  type Invoice,
} from "@kineo/shared";
import { Button, Card, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { openInvoicePreview } from "@/components/open-invoice";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { StatusTag } from "@/components/status-tag";
import { Text } from "@/components/text";
import { usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { editorLines } from "@/utils/invoice-editor";
import { localDate } from "@/utils/local-date";
import { userMessage } from "@/utils/user-message";

const PAYMENT_FAILED = "The payment couldn't be recorded. Try again.";
const UNDO_FAILED = "The payment couldn't be undone. Try again.";
const CANCEL_FAILED = "The invoice couldn't be cancelled. Try again.";

/**
 * A sent, paid or cancelled invoice: its tag, the total, who it's for and when it was
 * sent (paid, or cancelled), its visits and tax, and View PDF to share it again. While
 * it's waiting on payment, Record payment is pinned and Cancel invoice (after a
 * confirmation) lets its visits be invoiced again; the "Marked paid" toast offers Undo.
 */
export function InvoiceDetail({ invoice, today }: { invoice: Invoice; today: Date }) {
  const writer = usePracticeWriter();
  const { patients, visits, lineItems, settings } = usePracticeData();
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const lines = useMemo(() => editorLines(lineItems, invoice.id), [lineItems, invoice.id]);
  const todayDate = localDate(today);
  const totals = invoiceTotals(lines, invoice);
  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const patientName =
    patients.find((candidate) => candidate.id === invoice.patientId)?.fullName ?? "Unknown patient";

  async function recordPayment() {
    setRecording(true);
    try {
      await writer.recordPayment(invoice.id);
      // Undo moves it back to sent (unpaid), even after leaving this screen.
      // Stays until used or swiped away: it may be the only way back (design brief).
      toast.show({
        label: "Marked paid",
        duration: "persistent",
        actionLabel: "Undo",
        onActionPress: ({ hide }) => {
          hide();
          writer.undoPayment(invoice.id).catch((caught: unknown) => {
            toast.show({ variant: "danger", label: userMessage(caught) ?? UNDO_FAILED });
          });
        },
      });
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({ variant: "danger", label: userMessage(caught) ?? PAYMENT_FAILED });
    } finally {
      setRecording(false);
    }
  }

  async function cancelInvoice() {
    setCancelling(true);
    try {
      await writer.cancelInvoice(invoice.id);
      toast.show({ label: "Invoice cancelled" });
    } catch (caught) {
      toast.show({ variant: "danger", label: userMessage(caught) ?? CANCEL_FAILED });
    } finally {
      setCancelling(false);
    }
  }

  function confirmCancel() {
    Alert.alert(
      `Cancel ${number}?`,
      `Its visits go back to Ready to invoice. ${number} stays in your records as cancelled and won't be used again.`,
      [
        { text: "Keep invoice", style: "cancel", isPreferred: true },
        { text: "Cancel invoice", style: "destructive", onPress: () => void cancelInvoice() },
      ],
    );
  }

  const footer =
    invoice.status === "sent" ? (
      <PendingButton
        pending={recording}
        pendingLabel="Saving…"
        label="Record payment"
        className="min-h-12 w-full"
        onPress={() => void recordPayment()}
      />
    ) : null;

  return (
    <Screen
      back
      large
      eyebrow={<StatusTag status={invoice.status} size="md" />}
      title={formatCad(totals.totalCents)}
      subtitle={invoiceDetailLine(number, patientName, invoice, todayDate)}
      footer={footer}
    >
      <Card className="px-4 py-0">
        <DetailRow first label="Visits" value={invoiceVisitDates(visits, invoice, todayDate)} />
        <DetailRow label="Tax" value={invoiceTaxLabel(invoice, totals.taxCents)} />
        <Pressable
          accessibilityRole="button"
          onPress={() => openInvoicePreview(invoice.id)}
          className="min-h-13 flex-row items-center border-t border-separator active:opacity-70"
        >
          <Text className="font-medium text-link">View PDF</Text>
        </Pressable>
      </Card>
      {invoice.status === "sent" ? (
        <Button
          variant="ghost"
          className="min-h-11 self-start"
          isDisabled={cancelling}
          onPress={confirmCancel}
        >
          Cancel invoice
        </Button>
      ) : null}
    </Screen>
  );
}

function DetailRow({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      className={`min-h-13 flex-row items-center justify-between gap-4 py-2 ${first ? "" : "border-t border-separator"}`}
    >
      <Text className="text-foreground">{label}</Text>
      <Text className="shrink text-right text-foreground tabular-nums">{value}</Text>
    </View>
  );
}
