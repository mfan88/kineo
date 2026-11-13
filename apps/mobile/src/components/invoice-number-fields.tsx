import {
  INVOICE_NUMBER_PART_LABELS,
  INVOICE_NUMBER_SEPARATOR_LABELS,
  INVOICE_NUMBER_SEPARATORS,
  invoiceNumberDigitsExample,
  invoiceNumberPartExample,
  MAX_INVOICE_NUMBER_DIGITS,
  MAX_INVOICE_NUMBER_PREFIX,
  MIN_INVOICE_NUMBER_DIGITS,
  moveInvoiceNumberPart,
  type InvoiceNumberFormat,
  type InvoiceNumberPart,
} from "@kineo/shared";
import { Card, FieldError, Input, Label, Switch, TextField } from "heroui-native";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Text } from "@/components/text";
import { useThemeColors } from "@/theme/theme-colors";

const DIGITS = Array.from(
  { length: MAX_INVOICE_NUMBER_DIGITS - MIN_INVOICE_NUMBER_DIGITS + 1 },
  (_, index) => MIN_INVOICE_NUMBER_DIGITS + index,
);

/**
 * Price list and tax › Invoice numbers: the parts in order (prefix, year, month and
 * number, each but the number on or off, moved up or down), the prefix text, the
 * separator, how many digits the number has, and the next invoice number.
 */
export function InvoiceNumberFields({
  format,
  onFormatChange,
  next,
  onNextChange,
  nextError,
  example,
  today,
}: {
  format: InvoiceNumberFormat;
  onFormatChange: (format: InvoiceNumberFormat) => void;
  /** The next invoice number as typed. */
  next: string;
  onNextChange: (next: string) => void;
  nextError: string | null;
  /** The next invoice's number as it will look. */
  example: string;
  /** Today (YYYY-MM-DD), for the year and month examples. */
  today: string;
}) {
  const exampleNumber = /^\d+$/.test(next) ? Number(next) : 1;
  const update = (changes: Partial<InvoiceNumberFormat>) =>
    onFormatChange({ ...format, ...changes });

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="font-medium text-foreground">Parts, in order</Text>
        <Card className="px-4 py-0">
          {format.order.map((part, index) => (
            <PartRow
              key={part}
              part={part}
              example={invoiceNumberPartExample(part, format, exampleNumber, today)}
              shown={part === "number" || format.shown[part]}
              onShownChange={
                part === "number"
                  ? null
                  : (shown) => update({ shown: { ...format.shown, [part]: shown } })
              }
              isFirst={index === 0}
              isLast={index === format.order.length - 1}
              onMove={(direction) =>
                update({ order: moveInvoiceNumberPart(format.order, part, direction) })
              }
            />
          ))}
        </Card>
      </View>

      <TextField>
        <Label>Prefix text (optional)</Label>
        <Input
          value={format.prefix}
          onChangeText={(prefix) => update({ prefix })}
          maxLength={MAX_INVOICE_NUMBER_PREFIX}
          placeholder="e.g. INV"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          accessibilityLabel="Prefix text (optional)"
        />
      </TextField>

      <Choice
        label="Between parts"
        options={INVOICE_NUMBER_SEPARATORS.map((separator) => ({
          key: separator,
          text: separator === "" ? "None" : separator,
          accessibilityLabel: INVOICE_NUMBER_SEPARATOR_LABELS[separator],
          selected: format.separator === separator,
          onPress: () => update({ separator }),
        }))}
      />

      <Choice
        label="Number length"
        options={DIGITS.map((digits) => ({
          key: String(digits),
          text: invoiceNumberDigitsExample(digits),
          accessibilityLabel: digits === 1 ? "1 digit" : `${digits} digits`,
          selected: format.digits === digits,
          onPress: () => update({ digits }),
        }))}
      />

      <View className="gap-1">
        <TextField isInvalid={nextError !== null}>
          <Label>Next invoice number</Label>
          <Input
            value={next}
            onChangeText={onNextChange}
            keyboardType="number-pad"
            autoComplete="off"
            accessibilityLabel="Next invoice number"
          />
          <FieldError>{nextError}</FieldError>
        </TextField>
        <Text className="text-sm text-muted">
          To carry on from invoices you made before Kineō, enter the next number you&apos;d use.
        </Text>
      </View>

      <View className="rounded-xl bg-accent-soft px-4 py-3">
        <Text className="text-sm text-foreground">
          Your next invoice will be{" "}
          <Text testID="next-invoice-example" className="font-semibold text-sm">
            {example}
          </Text>
          . Invoices already sent keep their number.
        </Text>
      </View>
    </View>
  );
}

/** A row of pills where one is chosen, e.g. the separator. */
function Choice({
  label,
  options,
}: {
  label: string;
  options: {
    key: string;
    text: string;
    accessibilityLabel: string;
    selected: boolean;
    onPress: () => void;
  }[];
}) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground">{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-2"
      >
        {options.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ checked: option.selected }}
            onPress={option.onPress}
            className={`min-h-11 min-w-11 items-center justify-center rounded-full px-4 active:opacity-70 ${
              option.selected ? "bg-accent" : "border border-border bg-surface"
            }`}
          >
            <Text
              className={`font-medium tabular-nums ${
                option.selected ? "text-accent-foreground" : "text-foreground"
              }`}
            >
              {option.text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PartRow({
  part,
  example,
  shown,
  onShownChange,
  isFirst,
  isLast,
  onMove,
}: {
  part: InvoiceNumberPart;
  example: string;
  shown: boolean;
  /** Null for the number, which is always shown. */
  onShownChange: ((shown: boolean) => void) | null;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const colors = useThemeColors();
  const label = INVOICE_NUMBER_PART_LABELS[part];
  return (
    <View
      className={`min-h-14 flex-row items-center gap-2 py-2 ${isFirst ? "" : "border-t border-separator"}`}
    >
      {onShownChange === null ? (
        <View className="flex-1 gap-0.5">
          <Text className="font-medium text-foreground">{label}</Text>
          <Text className="text-sm text-muted tabular-nums">{example} · Always shown</Text>
        </View>
      ) : (
        // The whole row is the target; the switch inside only shows the state.
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={`Show ${label.toLowerCase()}`}
          accessibilityState={{ checked: shown }}
          onPress={() => onShownChange(!shown)}
          className="min-h-11 flex-1 flex-row items-center gap-3"
        >
          <View className="flex-1 gap-0.5">
            <Text className={`font-medium ${shown ? "text-foreground" : "text-muted"}`}>
              {label}
            </Text>
            <Text className="text-sm text-muted tabular-nums" numberOfLines={1}>
              {example}
            </Text>
          </View>
          <Switch
            isSelected={shown}
            onSelectedChange={onShownChange}
            // HeroUI Native draws the off track from --default, too faint on a card.
            animation={{
              backgroundColor: { value: [colors.controlTrack, colors.primaryStrong] },
            }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      )}
      <MoveButton
        label={`Move ${label.toLowerCase()} earlier`}
        disabled={isFirst}
        direction={-1}
        onPress={() => onMove(-1)}
      />
      <MoveButton
        label={`Move ${label.toLowerCase()} later`}
        disabled={isLast}
        direction={1}
        onPress={() => onMove(1)}
      />
    </View>
  );
}

function MoveButton({
  label,
  disabled,
  direction,
  onPress,
}: {
  label: string;
  disabled: boolean;
  direction: -1 | 1;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full active:opacity-70 ${disabled ? "opacity-30" : ""}`}
    >
      <Svg
        width={18}
        height={18}
        viewBox="0 0 16 16"
        fill="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          d={direction === -1 ? "M8 13V3M3.5 7.5L8 3l4.5 4.5" : "M8 3v10M3.5 8.5L8 13l4.5-4.5"}
          stroke={colors.text}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
