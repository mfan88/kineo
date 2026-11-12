import type { PracticeWriter } from "@kineo/data";
import {
  centsToInput,
  formatCad,
  formatInvoiceNumber,
  formatPercent,
  nextInvoiceNumber,
  parsePercent,
  type PriceItem,
} from "@kineo/shared";
import { Button, Card, FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { checkItem, type ItemDraft, type ItemErrors } from "@/utils/price-item-form";
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
export function PriceList() {
  const writer = usePracticeWriter();
  const { priceItems } = usePracticeData();

  return (
    <Screen back title="Price list and tax">
      <View className="gap-3">
        <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
          Price list
        </Text>
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
        <AddItemForm writer={writer} />
      </View>

      <SettingsForm writer={writer} />
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
  draft: ItemDraft;
  errors: ItemErrors;
  nameLabel: string;
  namePlaceholder?: string;
  onChange: (change: Partial<ItemDraft>) => void;
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
  const [draft, setDraft] = useState<ItemDraft>({ name: item.name, price: "" });
  const [errors, setErrors] = useState<ItemErrors>({});

  function startEditing() {
    setDraft({ name: item.name, price: centsToInput(item.unitPriceCents) });
    setErrors({});
    setEditing(true);
  }

  async function save() {
    const result = checkItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    const saved = await attempt(
      () => writer.updatePriceItem(item.id, { name: draft.name, unitPriceCents: result.cents }),
      "Item updated",
    );
    if (saved) setEditing(false);
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
          <Button variant="secondary" className="min-h-11" onPress={() => void save()}>
            Save item
          </Button>
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
        <Text className="text-foreground">{formatCad(item.unitPriceCents)}</Text>
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
          onPress={() => void attempt(() => writer.removePriceItem(item.id), "Item removed")}
        >
          Remove
        </Button>
      </View>
    </View>
  );
}

function AddItemForm({ writer }: { writer: PracticeWriter }) {
  const attempt = useAttempt();
  const [draft, setDraft] = useState<ItemDraft>({ name: "", price: "" });
  const [errors, setErrors] = useState<ItemErrors>({});

  async function add() {
    const result = checkItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    const added = await attempt(
      () => writer.addPriceItem({ name: draft.name, unitPriceCents: result.cents }),
      "Item added",
    );
    if (added) {
      setDraft({ name: "", price: "" });
      setErrors({});
    }
  }

  return (
    <View accessibilityLabel="Add an item" className="gap-3">
      <ItemFields
        draft={draft}
        errors={errors}
        nameLabel="New item"
        namePlaceholder="e.g. Initial assessment"
        onChange={(change) => {
          setDraft((current) => ({ ...current, ...change }));
          // The error under a field goes once that field is being typed in.
          setErrors((current) => ({
            ...("name" in change ? {} : current.name === undefined ? {} : { name: current.name }),
            ...("price" in change
              ? {}
              : current.price === undefined
                ? {}
                : { price: current.price }),
          }));
        }}
      />
      <Button variant="secondary" className="min-h-11 self-start" onPress={() => void add()}>
        Add item
      </Button>
    </View>
  );
}

function SettingsForm({ writer }: { writer: PracticeWriter }) {
  const attempt = useAttempt();
  const { settings, invoices } = usePracticeData();
  const [rate, setRate] = useState(() => formatPercent(settings.defaultTaxRateBasisPoints));
  const [prefix, setPrefix] = useState(settings.invoiceNumberPrefix);
  const [rateError, setRateError] = useState<string | null>(null);

  const nextNumber = formatInvoiceNumber(prefix, nextInvoiceNumber(invoices));

  async function save() {
    const basisPoints = parsePercent(rate);
    if (basisPoints === null) {
      setRateError("Enter a tax rate from 0 to 100, like 5 or 12.5.");
      return;
    }
    const saved = await attempt(
      () =>
        writer.saveSettings({
          defaultTaxRateBasisPoints: basisPoints,
          invoiceNumberPrefix: prefix,
        }),
      "Settings saved",
    );
    if (saved) {
      setRate(formatPercent(basisPoints));
      setPrefix(prefix.trim());
    }
  }

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
          Tax is off on new invoices; this rate is used when you turn it on.
        </Text>
      </View>
      <View className="gap-1">
        <TextField>
          <Label>Invoice number prefix (optional)</Label>
          <Input
            value={prefix}
            onChangeText={setPrefix}
            maxLength={20}
            placeholder="e.g. INV-"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            accessibilityLabel="Invoice number prefix (optional)"
          />
        </TextField>
        <Text className="text-sm text-muted">Your next invoice will be {nextNumber}.</Text>
      </View>
      <Button className="min-h-11 self-start" onPress={() => void save()}>
        Save settings
      </Button>
    </View>
  );
}
