import type { PracticeWriter } from "@kineo/data";
import {
  centsToInput,
  checkPriceItem,
  buildInvoiceNumber,
  formatCad,
  formatPercent,
  highestInvoiceNumber,
  invoiceNumberStartProblem,
  localDateString,
  nextInvoiceNumber,
  parsePercent,
  type PriceItem,
  type PriceItemDraft,
  type PriceItemErrors,
} from "@kineo/shared";
import { Button, Card, FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { InvoiceNumberFields } from "@/components/invoice-number-fields";
import { PendingButton } from "@/components/pending-button";
import { PriceItemSheet } from "@/components/price-item-sheet";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { FormSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";

/**
 * Runs a change and resolves to whether it worked; a refused one becomes a toast
 * that says what to do.
 */
function useAttempt(): (change: () => Promise<unknown>, done: string) => Promise<boolean> {
  const { toast } = useToast();
  return async (change, done) => {
    try {
      await change();
      toast.show(done);
      return true;
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "That change couldn't be saved. Try again.",
      });
      return false;
    }
  };
}

/** Price list and tax: what you charge, your default tax rate and invoice numbers. */
function PriceListScreen() {
  const writer = usePracticeWriter();
  const { priceItems } = usePracticeData();
  const [adding, setAdding] = useState(false);
  const settingsForm = useSettingsForm(writer);

  return (
    <Screen
      back
      title="Price list and tax"
      footer={
        <PendingButton
          className="min-h-12 w-full"
          label="Save settings"
          pendingLabel="Saving…"
          pending={settingsForm.saving}
          onPress={() => void settingsForm.save()}
        />
      }
    >
      <View className="gap-3">
        <View className="min-h-11 flex-row items-center justify-between gap-3">
          <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
            Price list
          </Text>
          <Button variant="ghost" className="min-h-11" onPress={() => setAdding(true)}>
            Add item
          </Button>
        </View>
        {priceItems.length === 0 ? (
          <Text className="text-sm text-muted">
            No items yet. Add what you charge for so you can put it on invoices.
          </Text>
        ) : (
          <Card accessibilityLabel="Price list" className="px-4 py-1">
            {priceItems.map((item, index) => (
              <View key={item.id} className={index > 0 ? "border-t border-separator" : ""}>
                <PriceItemRow item={item} writer={writer} />
              </View>
            ))}
          </Card>
        )}
        <Text className="text-sm text-muted">
          Changing a price doesn't change invoices you've already made.
        </Text>
      </View>

      <SettingsForm form={settingsForm} />
      <PriceItemSheet isOpen={adding} onOpenChange={setAdding} />
    </Screen>
  );
}

/** The two fields of an item, with their errors underneath. */
function ItemFields({
  draft,
  errors,
  nameLabel,
  namePlaceholder,
  onChange,
}: {
  draft: PriceItemDraft;
  errors: PriceItemErrors;
  nameLabel: string;
  namePlaceholder?: string;
  onChange: (change: Partial<PriceItemDraft>) => void;
}) {
  return (
    <>
      <TextField isInvalid={errors.name !== undefined}>
        <Label>{nameLabel}</Label>
        <Input
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          placeholder={namePlaceholder}
          autoCapitalize="sentences"
          autoComplete="off"
          accessibilityLabel={nameLabel}
        />
        <FieldError>{errors.name}</FieldError>
      </TextField>
      <TextField isInvalid={errors.price !== undefined}>
        <Label>Price ($)</Label>
        <Input
          value={draft.price}
          onChangeText={(price) => onChange({ price })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          autoComplete="off"
          accessibilityLabel={`${nameLabel}: price in dollars`}
        />
        <FieldError>{errors.price}</FieldError>
      </TextField>
    </>
  );
}

function PriceItemRow({ item, writer }: { item: PriceItem; writer: PracticeWriter }) {
  const attempt = useAttempt();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PriceItemDraft>({ name: item.name, price: "" });
  const [errors, setErrors] = useState<PriceItemErrors>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function startEditing() {
    setDraft({ name: item.name, price: centsToInput(item.unitPriceCents) });
    setErrors({});
    setEditing(true);
  }

  async function save() {
    const result = checkPriceItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    const saved = await attempt(
      () => writer.updatePriceItem(item.id, { name: draft.name, unitPriceCents: result.cents }),
      "Item updated",
    );
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function remove() {
    try {
      await writer.removePriceItem(item.id);
      // Stays until used or swiped away: it's the only way back (design brief).
      toast.show({
        label: "Item removed",
        duration: "persistent",
        actionLabel: "Undo",
        onActionPress: ({ hide }) => {
          hide();
          writer.restorePriceItem(item).catch((caught: unknown) => {
            toast.show({
              variant: "danger",
              label: userMessage(caught) ?? "The item couldn't be put back. Try again.",
            });
          });
        },
      });
    } catch (caught) {
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The item couldn't be removed. Try again.",
      });
    }
  }

  if (editing) {
    return (
      <View accessibilityLabel={`Editing ${item.name}`} className="gap-3 py-3">
        <ItemFields
          draft={draft}
          errors={errors}
          nameLabel="Name"
          onChange={(change) => setDraft((current) => ({ ...current, ...change }))}
        />
        <View className="flex-row gap-2">
          <PendingButton
            variant="secondary"
            label="Save item"
            pendingLabel="Saving…"
            pending={saving}
            onPress={() => void save()}
          />
          <Button variant="ghost" className="min-h-11" onPress={() => setEditing(false)}>
            Cancel
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View accessibilityLabel={item.name} className="py-2">
      <View className="min-h-11 flex-row items-center justify-between gap-3">
        <Text className="shrink font-medium text-foreground">{item.name}</Text>
        <Text className="text-foreground tabular-nums">{formatCad(item.unitPriceCents)}</Text>
      </View>
      <View className="-ml-3 flex-row gap-2">
        <Button
          variant="ghost"
          className="min-h-11"
          accessibilityLabel={`Edit ${item.name}`}
          onPress={startEditing}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          accessibilityLabel={`Remove ${item.name}`}
          onPress={() => void remove()}
        >
          Remove
        </Button>
      </View>
    </View>
  );
}

/** The tax and invoice number settings, and saving them (from the pinned button). */
function useSettingsForm(writer: PracticeWriter) {
  const attempt = useAttempt();
  const { settings, invoices } = usePracticeData();
  const [rate, setRate] = useState(() => formatPercent(settings.defaultTaxRateBasisPoints));
  const [rateError, setRateError] = useState<string | null>(null);
  const [format, setFormat] = useState(settings.invoiceNumberFormat);
  const savedNext = nextInvoiceNumber(invoices, settings.invoiceNumberStart);
  // Null until it's changed: until then the saved starting number stays as it is.
  const [next, setNext] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = localDateString(new Date());
  const nextValue = next ?? String(savedNext);
  const example = buildInvoiceNumber(
    format,
    /^\d+$/.test(nextValue) && Number(nextValue) >= 1 ? Number(nextValue) : savedNext,
    today,
  );

  async function save() {
    const basisPoints = parsePercent(rate);
    const start = next === null ? settings.invoiceNumberStart : Number(next.trim());
    const startProblem =
      next === null
        ? null
        : /^\d+$/.test(next.trim())
          ? invoiceNumberStartProblem(start, highestInvoiceNumber(invoices) + 1)
          : "Enter a whole number of at least 1.";
    setRateError(basisPoints === null ? "Enter a tax rate from 0 to 100, like 5 or 12.5." : null);
    setNextError(startProblem);
    if (basisPoints === null || startProblem !== null) return;
    setSaving(true);
    const saved = await attempt(
      () =>
        writer.saveSettings({
          defaultTaxRateBasisPoints: basisPoints,
          invoiceNumberFormat: { ...format, prefix: format.prefix.trim() },
          invoiceNumberStart: start,
        }),
      "Settings saved",
    );
    setSaving(false);
    if (saved) {
      setRate(formatPercent(basisPoints));
      setFormat((current) => ({ ...current, prefix: current.prefix.trim() }));
      setNext(null);
    }
  }

  return {
    rate,
    setRate,
    rateError,
    setRateError,
    format,
    setFormat,
    nextValue,
    setNext,
    nextError,
    setNextError,
    example,
    today,
    saving,
    save,
  };
}

type SettingsFormState = ReturnType<typeof useSettingsForm>;

function SettingsForm({ form }: { form: SettingsFormState }) {
  const {
    rate,
    setRate,
    rateError,
    setRateError,
    format,
    setFormat,
    nextValue,
    setNext,
    nextError,
    setNextError,
    example,
    today,
  } = form;
  return (
    <View className="gap-4 pt-4">
      <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
        Tax and invoice numbers
      </Text>
      <View className="gap-1">
        <TextField isInvalid={rateError !== null}>
          <Label>Default tax rate (%)</Label>
          <Input
            value={rate}
            onChangeText={(value) => {
              setRate(value);
              setRateError(null);
            }}
            keyboardType="decimal-pad"
            autoComplete="off"
            accessibilityLabel="Default tax rate (%)"
          />
          <FieldError>{rateError}</FieldError>
        </TextField>
        <Text className="text-sm text-muted">
          Used when you turn tax on for an invoice. Tax is off by default.
        </Text>
      </View>
      <Text accessibilityRole="header" className="pt-2 font-semibold text-foreground">
        Invoice numbers
      </Text>
      <InvoiceNumberFields
        format={format}
        onFormatChange={setFormat}
        next={nextValue}
        onNextChange={(value) => {
          setNext(value);
          setNextError(null);
        }}
        nextError={nextError}
        example={example}
        today={today}
      />
    </View>
  );
}

/** PriceList, behind a skeleton in its shape until the practice has been read. */
export function PriceList() {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Price list and tax" showBlocks={showBlocks} />}
    >
      <PriceListScreen />
    </PracticeGate>
  );
}
