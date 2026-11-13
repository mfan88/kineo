import {
  billToOptions,
  type BillToOption,
  type FundingType,
  type InvoiceBillTo,
  type Patient,
  type PatientFunding,
} from "@kineo/shared";
import { BottomSheet, useToast } from "heroui-native";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { usePracticeWriter } from "@/data/practice-data";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";
import { Text } from "./text";

const CHANGE_FAILED = "That change couldn't be saved. Try again.";

/** A radio circle: ringed, with a dot when chosen. */
function Radio({ selected }: { selected: boolean }) {
  const colors = useThemeColors();
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={9} cy={9} r={8} stroke={colors.primaryStrong} strokeWidth={1.5} />
      {selected ? <Circle cx={9} cy={9} r={4.5} fill={colors.primaryStrong} /> : null}
    </Svg>
  );
}

/**
 * The sheet that changes who a draft invoice is billed to: one row for each of the
 * patient's current fundings, then Self-pay. Choosing a row changes the invoice and
 * closes the sheet.
 */
export function BillToSheet({
  isOpen,
  onOpenChange,
  invoiceId,
  patient,
  current,
  fundings,
  types,
  today,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  patient: Pick<Patient, "id" | "fullName">;
  current: InvoiceBillTo;
  fundings: readonly PatientFunding[];
  types: readonly FundingType[];
  /** Today's date, YYYY-MM-DD. */
  today: string;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const colors = useThemeColors();
  const options = billToOptions({ patient, fundings, types, today, current });

  async function choose(option: BillToOption) {
    onOpenChange(false);
    if (option.selected) return;
    try {
      await writer.setBillTo(
        invoiceId,
        option.key === "patient"
          ? { kind: "patient" }
          : { kind: "funding", patientFundingId: option.key },
      );
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({ variant: "danger", label: userMessage(caught) ?? CHANGE_FAILED });
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <View className="gap-3 pb-6">
            <BottomSheet.Title>Bill to</BottomSheet.Title>
            <View accessibilityRole="radiogroup" accessibilityLabel="Bill to" className="gap-1">
              {options.map((option) => (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityLabel={
                    option.detail === "" ? option.title : `${option.title}, ${option.detail}`
                  }
                  accessibilityState={{ checked: option.selected }}
                  onPress={() => void choose(option)}
                  className="min-h-13 flex-row items-center gap-3 rounded-xl px-3 py-2 active:opacity-70"
                  style={option.selected ? { backgroundColor: colors.tint } : undefined}
                >
                  <Radio selected={option.selected} />
                  <View className="shrink gap-0.5">
                    <Text
                      className="font-bold"
                      style={{ color: option.selected ? colors.textOnTint : colors.text }}
                    >
                      {option.title}
                    </Text>
                    {option.detail === "" ? null : (
                      <Text
                        className="text-sm"
                        style={{ color: option.selected ? colors.textOnTint : colors.mutedText }}
                      >
                        {option.detail}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
