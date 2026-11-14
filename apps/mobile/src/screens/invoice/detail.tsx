import {
  billToSummary,
  formatCad,
  invoiceNumberLabel,
  invoiceDetailLine,
  invoiceTaxLabel,
  invoiceTotals,
  invoiceVisitDates,
  resolvedBillTo,
  type Invoice,
} from "@kineo/shared";
import { router } from "expo-router";
import { BottomSheet, Button, Card, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { FundingChip } from "@/components/funding-chip";
import { openInvoicePreview } from "@/components/open-invoice";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { StatusTag } from "@/components/status-tag";
import { Text } from "@/components/text";
import { usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { editorLines } from "@/utils/invoice-editor";
import { localDate } from "@/utils/local-date";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";

const PAYMENT_FAILED = "The payment couldn't be recorded. Try again.";
const UNDO_FAILED = "The payment couldn't be undone. Try again.";
const UNPAID_FAILED = "The invoice couldn't be marked unpaid. Try again.";
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
  const [confirmingUnpaid, setConfirmingUnpaid] = useState(false);
  const [unmarking, setUnmarking] = useState(false);

  const lines = useMemo(() => editorLines(lineItems, invoice.id), [lineItems, invoice.id]);
  const todayDate = localDate(today);
  const totals = invoiceTotals(lines, invoice);
  const number = invoiceNumberLabel(invoice, settings.invoiceNumberFormat);
  const patient = patients.find((candidate) => candidate.id === invoice.patientId);
  const patientName = patient?.fullName ?? "Unknown patient";
  const billTo = resolvedBillTo(invoice, patient ?? null);
  const colors = useThemeColors();

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

  async function markUnpaid() {
    setUnmarking(true);
    try {
      await writer.undoPayment(invoice.id);
      setConfirmingUnpaid(false);
      // Undo records the payment again; it stays until used or swiped away.
      toast.show({
        label: "Marked unpaid",
        duration: "persistent",
        actionLabel: "Undo",
        onActionPress: ({ hide }) => {
          hide();
          writer.recordPayment(invoice.id).catch((caught: unknown) => {
            toast.show({ variant: "danger", label: userMessage(caught) ?? PAYMENT_FAILED });
          });
        },
      });
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({ variant: "danger", label: userMessage(caught) ?? UNPAID_FAILED });
    } finally {
      setUnmarking(false);
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
      <Card accessibilityLabel="Bill to details" className="gap-2 p-4">
        <View className="flex-row items-center justify-between gap-2">
          <FundingChip
            variant={billTo.kind === "funding" ? "funding" : "selfPay"}
            label={billTo.kind === "funding" ? billTo.fundingName : "Self-pay"}
          />
        </View>
        <Text className="text-[15px] font-semibold text-foreground">{billTo.name}</Text>
        {billTo.kind === "funding" ? (
          <Text className="text-sm text-muted">{billToSummary(billTo, patientName)}</Text>
        ) : null}
        <View className="flex-row items-start gap-2">
          <Svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ marginTop: 2 }}
          >
            <Rect
              x={3}
              y={7}
              width={10}
              height={7}
              rx={1.5}
              stroke={colors.mutedText}
              strokeWidth={1.5}
            />
            <Path d="M5 7V5a3 3 0 0 1 6 0v2" stroke={colors.mutedText} strokeWidth={1.5} />
          </Svg>
          <Text className="shrink text-sm text-muted">
            Locked once sent. Later changes to the funding don't alter this invoice.
          </Text>
        </View>
      </Card>
      <Card className="px-4 py-0">
        {patient ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={patientName}
            onPress={() =>
              router.navigate({ pathname: "/patient/[id]", params: { id: patient.id } })
            }
            className="min-h-13 flex-row items-center justify-between gap-4 py-2 active:opacity-70"
          >
            <Text className="text-foreground">Patient</Text>
            <Text className="shrink text-right font-medium text-link">{patientName}</Text>
          </Pressable>
        ) : null}
        <DetailRow
          first={!patient}
          label="Visits"
          value={invoiceVisitDates(visits, invoice, todayDate)}
        />
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
      {invoice.status === "paid" ? (
        <Button
          variant="ghost"
          className="min-h-11 self-start"
          onPress={() => setConfirmingUnpaid(true)}
        >
          Mark as unpaid
        </Button>
      ) : null}
      {confirmingUnpaid ? (
        <BottomSheet isOpen onOpenChange={setConfirmingUnpaid}>
          <BottomSheet.Portal>
            <BottomSheet.Overlay />
            <BottomSheet.Content>
              <View className="gap-4 pb-6">
                <View className="gap-1">
                  <BottomSheet.Title>{`Mark ${number} as unpaid?`}</BottomSheet.Title>
                  <BottomSheet.Description>
                    It goes back to Waiting on payment.
                  </BottomSheet.Description>
                </View>
                <PendingButton
                  pending={unmarking}
                  pendingLabel="Saving…"
                  label="Mark as unpaid"
                  className="min-h-12 w-full"
                  onPress={() => void markUnpaid()}
                />
                <Button
                  variant="ghost"
                  className="min-h-11 w-full"
                  isDisabled={unmarking}
                  onPress={() => setConfirmingUnpaid(false)}
                >
                  Keep as paid
                </Button>
              </View>
            </BottomSheet.Content>
          </BottomSheet.Portal>
        </BottomSheet>
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
