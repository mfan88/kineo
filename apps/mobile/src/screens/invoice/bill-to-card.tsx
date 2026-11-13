import {
  activeFundingsFor,
  parseDayInput,
  type BillToProblem,
  type FundingType,
  type Invoice,
  type InvoiceBillTo,
  type Patient,
  type PatientFunding,
} from "@kineo/shared";
import { Button, Card, Input, Label, TextField, useToast, type InputRef } from "heroui-native";
import { useRef, useState, type ComponentRef, type MutableRefObject } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { BillToSheet } from "@/components/bill-to-sheet";
import { FundingChip } from "@/components/funding-chip";
import { Text } from "@/components/text";
import { usePracticeWriter } from "@/data/practice-data";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";

const CHANGE_FAILED = "That change couldn't be saved. Try again.";
const ADDRESS_FAILED = "The address couldn't be saved. Try again.";
const DATE_MESSAGE = "Enter a date like 1 Apr 2026.";

/** What the editor needs to reach to take the person to a problem. */
export interface BillToFocus {
  /** Each detail's input, by detail id. */
  details: Record<string, InputRef | null>;
  /** The recipient alert, which has no input to focus. */
  alert: { current: ComponentRef<typeof View> | null };
}

/** The phone can't edit recipients, so the F2 wording points at the computer instead. */
export function phoneProblemMessage(message: string): string {
  return message.replace(" in Settings", " in Kineō on your computer, under Settings");
}

function AlertIcon() {
  const colors = useThemeColors();
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ marginTop: 2 }}
    >
      <Circle cx={8} cy={8} r={6.5} stroke={colors.error} strokeWidth={1.5} />
      <Path d="M8 4.5v4M8 11v.01" stroke={colors.error} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** One problem, in the error colour with an alert icon. */
function Problem({ message }: { message: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-start gap-2">
      <AlertIcon />
      <Text className="shrink text-sm" style={{ color: colors.error }}>
        {message}
      </Text>
    </View>
  );
}

/**
 * Who a draft invoice is billed to. A funded invoice shows the funding, the recipient and
 * each detail to fill in; a self-pay one shows the patient and their address. "Change"
 * opens the choices. Problems that block sending show as soon as they exist, as on
 * desktop, so a missing detail is visible before Preview and send is tapped.
 */
export function BillToCard({
  invoice,
  billTo,
  patient,
  fundings,
  types,
  today,
  problems,
  focus,
}: {
  invoice: Invoice;
  billTo: InvoiceBillTo;
  patient: Patient;
  fundings: readonly PatientFunding[];
  types: readonly FundingType[];
  today: string;
  problems: readonly BillToProblem[];
  focus: MutableRefObject<BillToFocus>;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const colors = useThemeColors();
  const [changing, setChanging] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  // What's typed in each detail, until it's saved on leaving the field.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [dateErrors, setDateErrors] = useState<Record<string, boolean>>({});
  const alertRef = useRef<ComponentRef<typeof View>>(null);
  focus.current.alert = alertRef;

  const fundingType =
    billTo.kind === "funding"
      ? types.find(
          (type) =>
            type.id === fundings.find((f) => f.id === billTo.patientFundingId)?.fundingTypeId,
        )
      : undefined;
  const hasFunding = activeFundingsFor(patient.id, fundings, today).some((funding) =>
    types.some((type) => type.id === funding.fundingTypeId),
  );

  function fail(caught: unknown, fallback: string) {
    // A rule's own message is safe to show; anything else may hold patient details.
    toast.show({ variant: "danger", label: userMessage(caught) ?? fallback });
  }

  function saveDetail(detailId: string, stored: string) {
    const text = (typed[detailId] ?? stored).trim();
    const isDate = fundingType?.details.find((detail) => detail.id === detailId)?.kind === "date";
    if (isDate && !parseDayInput(text).ok) {
      setDateErrors((current) => ({ ...current, [detailId]: true }));
      return;
    }
    setDateErrors((current) => ({ ...current, [detailId]: false }));
    if (text === stored) return;
    writer.setBillToDetail(invoice.id, detailId, text).catch((caught: unknown) => {
      fail(caught, CHANGE_FAILED);
    });
  }

  async function saveAddress() {
    setSavingAddress(true);
    try {
      await writer.setSelfPayAddress(invoice.id, address);
      toast.show("Address saved");
      setEditingAddress(false);
    } catch (caught) {
      fail(caught, ADDRESS_FAILED);
    } finally {
      setSavingAddress(false);
    }
  }

  const recipientProblem = problems.find((problem) => problem.target.kind === "recipient");

  return (
    <Card accessibilityLabel="Bill to details" className="gap-2.5 p-4">
      {billTo.kind === "funding" ? (
        <>
          <View className="flex-row items-center justify-between gap-2">
            <FundingChip variant="funding" label={billTo.fundingName} />
            <Button variant="ghost" className="min-h-11" onPress={() => setChanging(true)}>
              Change
            </Button>
          </View>
          {billTo.name.trim() === "" ? null : (
            <Text className="text-[15px] font-semibold text-foreground">{billTo.name}</Text>
          )}
          {recipientProblem ? (
            <View
              ref={alertRef}
              accessible
              accessibilityRole="alert"
              accessibilityLabel={phoneProblemMessage(recipientProblem.message)}
            >
              <Problem message={phoneProblemMessage(recipientProblem.message)} />
            </View>
          ) : null}
          {billTo.details.map((detail) => {
            const problem = problems.find(
              (candidate) =>
                candidate.target.kind === "detail" && candidate.target.detailId === detail.id,
            );
            const message = dateErrors[detail.id] ? DATE_MESSAGE : problem ? problem.message : null;
            return (
              <TextField key={detail.id} isInvalid={message !== null} isRequired>
                <View className="flex-row items-baseline">
                  <Label>{detail.label}</Label>
                  <Text className="ml-1.5 text-[13px]" style={{ color: colors.placeholder }}>
                    Required
                  </Text>
                </View>
                <Input
                  ref={(node: InputRef | null) => {
                    focus.current.details[detail.id] = node;
                  }}
                  value={typed[detail.id] ?? detail.value}
                  onChangeText={(value) =>
                    setTyped((current) => ({ ...current, [detail.id]: value }))
                  }
                  onBlur={() => saveDetail(detail.id, detail.value)}
                  autoComplete="off"
                  autoCorrect={false}
                  accessibilityLabel={detail.label}
                  {...(message === null ? {} : { accessibilityHint: message })}
                  style={{ fontVariant: ["tabular-nums"] }}
                />
                {message === null ? null : <Problem message={message} />}
              </TextField>
            );
          })}
        </>
      ) : (
        <>
          <View className="flex-row items-center justify-between gap-2">
            <FundingChip variant="selfPay" label="Self-pay" />
            {hasFunding ? (
              <Button variant="ghost" className="min-h-11" onPress={() => setChanging(true)}>
                Change
              </Button>
            ) : null}
          </View>
          <Text className="text-[15px] font-semibold text-foreground">{billTo.name}</Text>
          {editingAddress ? (
            <View className="gap-2">
              <TextField>
                <View className="flex-row items-baseline">
                  <Label>Address</Label>
                  <Text className="ml-1.5 text-[13px]" style={{ color: colors.placeholder }}>
                    Optional
                  </Text>
                </View>
                <Input
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  autoFocus
                  autoComplete="off"
                  textContentType="fullStreetAddress"
                  accessibilityLabel="Address"
                  style={{ minHeight: 88, textAlignVertical: "top" }}
                />
              </TextField>
              <View className="-ml-3 flex-row flex-wrap gap-1">
                <Button
                  variant="ghost"
                  className="min-h-11"
                  isDisabled={savingAddress}
                  onPress={() => void saveAddress()}
                >
                  Save address
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  isDisabled={savingAddress}
                  onPress={() => setEditingAddress(false)}
                >
                  Cancel
                </Button>
              </View>
            </View>
          ) : (
            <>
              {billTo.address.trim() === "" ? (
                <Text className="text-sm text-muted">
                  No address yet. A name is enough, an address is optional.
                </Text>
              ) : (
                <View accessibilityLabel="Address">
                  {billTo.address.split("\n").map((line, index) => (
                    <Text key={`${index}-${line}`} className="text-sm text-foreground">
                      {line}
                    </Text>
                  ))}
                </View>
              )}
              <Button
                variant="ghost"
                className="-ml-3 min-h-11 self-start"
                onPress={() => {
                  setAddress(billTo.address);
                  setEditingAddress(true);
                }}
              >
                {billTo.address.trim() === "" ? "Add address" : "Edit address"}
              </Button>
            </>
          )}
        </>
      )}
      <BillToSheet
        isOpen={changing}
        onOpenChange={setChanging}
        invoiceId={invoice.id}
        patient={patient}
        current={billTo}
        fundings={fundings}
        types={types}
        today={today}
      />
    </Card>
  );
}
