import {
  checkPriceItem,
  type PriceItem,
  type PriceItemDraft,
  type PriceItemErrors,
} from "@kineo/shared";
import { BottomSheet, Button, FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import { PendingButton } from "./pending-button";

const EMPTY: PriceItemDraft = { name: "", price: "" };

/**
 * The sheet that adds an item to the price list: Cancel, "New item", Name, Price
 * (decimal pad) and Save item. Used by Price list and tax and by an invoice's
 * "+ New price list item", which puts the saved item on the invoice as a line.
 */
export function PriceItemSheet({
  isOpen,
  onOpenChange,
  onAdded,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved item, after the "Item added" toast. */
  onAdded?: (item: PriceItem) => void;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PriceItemDraft>(EMPTY);
  const [errors, setErrors] = useState<PriceItemErrors>({});
  const [saving, setSaving] = useState(false);

  function close(open: boolean) {
    if (!open) {
      setDraft(EMPTY);
      setErrors({});
    }
    onOpenChange(open);
  }

  async function save() {
    if (saving) return;
    const result = checkPriceItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      const item = await writer.addPriceItem({ name: draft.name, unitPriceCents: result.cents });
      toast.show("Item added");
      close(false);
      onAdded?.(item);
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "That item couldn't be saved. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={close}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="interactive" keyboardBlurBehavior="restore">
          <View className="gap-4 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <Button variant="ghost" className="-ml-3 min-h-11" onPress={() => close(false)}>
                Cancel
              </Button>
              <BottomSheet.Title>New item</BottomSheet.Title>
              {/* Keeps the title in the middle. */}
              <View className="w-16" />
            </View>
            <TextField isInvalid={errors.name !== undefined}>
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChangeText={(name) => {
                  setDraft((current) => ({ ...current, name }));
                  setErrors(({ price }) => (price === undefined ? {} : { price }));
                }}
                placeholder="e.g. Initial assessment"
                autoCapitalize="sentences"
                autoComplete="off"
                accessibilityLabel="Item name"
              />
              <FieldError>{errors.name}</FieldError>
            </TextField>
            <TextField isInvalid={errors.price !== undefined}>
              <Label>Price ($)</Label>
              <Input
                value={draft.price}
                onChangeText={(price) => {
                  setDraft((current) => ({ ...current, price }));
                  setErrors(({ name }) => (name === undefined ? {} : { name }));
                }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                autoComplete="off"
                accessibilityLabel="Item price in dollars"
              />
              <FieldError>{errors.price}</FieldError>
            </TextField>
            <PendingButton
              pending={saving}
              pendingLabel="Saving…"
              label="Save item"
              className="min-h-12 w-full"
              onPress={() => void save()}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
