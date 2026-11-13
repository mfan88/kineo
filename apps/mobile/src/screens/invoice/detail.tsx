import {
  formatCad,
  formatInvoiceNumber,
  invoiceDetailLine,
  invoiceTaxLabel,
  invoiceTotals,
  invoiceVisitDates,
  type Invoice,
} from "@kineo/shared";
import { Card, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
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

/**
 * A sent or paid invoice: its tag, the total, who it's for and when it was sent (or
 * paid), its visits and tax, and View PDF to share it again. While it's waiting on
 * payment, Record payment is pinned; the "Marked paid" toast offers Undo.
 */
export function InvoiceDetail({ invoice, today }: { invoice: Invoice; today: Date }) {
  const writer = usePracticeWriter();
  const { patients, visits, lineItems, settings } = usePracticeData();
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);

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
        <DetailRow first label="Visits" value={invoiceVisitDates(visits, invoice.id, todayDate)} />
        <DetailRow label="Tax" value={invoiceTaxLabel(invoice, totals.taxCents)} />
        <Pressable
          accessibilityRole="button"
          onPress={() => openInvoicePreview(invoice.id)}
          className="min-h-13 flex-row items-center border-t border-separator active:opacity-70"
        >
          <Text className="font-medium text-link">View PDF</Text>
        </Pressable>
      </Card>
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
