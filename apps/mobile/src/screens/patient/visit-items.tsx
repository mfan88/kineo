import {
  addItemToDraft,
  formatCad,
  removeDraftItem,
  setDraftQuantity,
  type PriceItem,
  type Visit,
  type VisitItem,
  type VisitItemDraft,
} from "@kineo/shared";
import { router } from "expo-router";
import { BottomSheet, Button, useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { PendingButton } from "@/components/pending-button";
import { Text } from "@/components/text";
import { usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";

/** A saved visit's items as drafts, in position order. */
export function draftsFromItems(items: readonly VisitItem[]): VisitItemDraft[] {
  return items
    .toSorted((a, b) => a.position - b.position)
    .map((item) => ({
      priceItemId: item.priceItemId,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    }));
}

/** The price list as tappable rows ("Name", "$price"); tapping one calls `onPick`. */
function PriceItemList({
  priceItems,
  onPick,
}: {
  priceItems: readonly PriceItem[];
  onPick: (item: PriceItem) => void;
}) {
  if (priceItems.length === 0) {
    return <Text className="text-sm text-muted">Your price list is empty.</Text>;
  }
  return (
    <View accessibilityLabel="Your price list">
      {priceItems.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name}, ${formatCad(item.unitPriceCents)}`}
          onPress={() => onPick(item)}
          className={`min-h-13 flex-row items-center justify-between gap-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
        >
          <Text className="shrink text-foreground">{item.name}</Text>
          <Text className="text-muted tabular-nums">{formatCad(item.unitPriceCents)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A stable key per row from its values: the price item's id, or name and price for
 * one whose price item was deleted, plus how many identical rows came before it.
 */
function itemKeys(items: readonly VisitItemDraft[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.priceItemId ?? `${item.name}|${item.unitPriceCents}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return `${base}#${count}`;
  });
}

/**
 * The chosen items as rows (name, price, a stepper and Remove) and "+ Add item".
 * With an empty price list it points to the price list screen instead.
 */
function ItemRows({
  items,
  onChange,
  onAdd,
  priceListEmpty,
  disabled = false,
}: {
  items: readonly VisitItemDraft[];
  onChange: (items: VisitItemDraft[]) => void;
  onAdd: () => void;
  /** Read by the caller: a sheet's content renders outside the data provider. */
  priceListEmpty: boolean;
  disabled?: boolean;
}) {
  const keys = itemKeys(items);
  return (
    <View accessibilityLabel="Items" className="gap-1">
      {items.map((item, index) => (
        <View
          key={keys[index]}
          accessibilityLabel={item.name}
          className="min-h-11 flex-row items-center justify-between gap-2"
        >
          <View className="shrink gap-0.5">
            <Text className="text-foreground">{item.name}</Text>
            <Text className="text-sm text-muted tabular-nums">
              {formatCad(item.unitPriceCents)}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Button
              variant="ghost"
              className="min-h-11 min-w-11"
              accessibilityLabel={`Fewer ${item.name}`}
              isDisabled={disabled || item.quantity <= 1}
              onPress={() => onChange(setDraftQuantity(items, index, item.quantity - 1))}
            >
              −
            </Button>
            <Text
              accessibilityLabel={`Quantity ${item.quantity}`}
              className="min-w-6 text-center text-foreground tabular-nums"
            >
              {item.quantity}
            </Text>
            <Button
              variant="ghost"
              className="min-h-11 min-w-11"
              accessibilityLabel={`More ${item.name}`}
              isDisabled={disabled}
              onPress={() => onChange(setDraftQuantity(items, index, item.quantity + 1))}
            >
              +
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              accessibilityLabel={`Remove ${item.name}`}
              isDisabled={disabled}
              onPress={() => onChange(removeDraftItem(items, index))}
            >
              Remove
            </Button>
          </View>
        </View>
      ))}
      {priceListEmpty ? (
        <View className="gap-1">
          <Text className="text-sm text-muted">
            Add items to your price list to bill them with a note.
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.navigate("/price-list")}
            className="min-h-11 justify-center self-start active:opacity-70"
          >
            <Text className="font-medium text-link">Open your price list</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          variant="ghost"
          className="-ml-3 min-h-11 self-start"
          isDisabled={disabled}
          onPress={onAdd}
        >
          + Add item
        </Button>
      )}
    </View>
  );
}

/**
 * The Items area under the note box: chosen items and "+ Add item", which opens a
 * sheet with the price list. Tapping a price item adds it (or raises its quantity)
 * and closes the sheet.
 */
export function VisitItemsPicker({
  items,
  onChange,
  disabled = false,
}: {
  items: readonly VisitItemDraft[];
  onChange: (items: VisitItemDraft[]) => void;
  disabled?: boolean;
}) {
  const { priceItems } = usePracticeData();
  const [picking, setPicking] = useState(false);
  return (
    <>
      <ItemRows
        items={items}
        onChange={onChange}
        onAdd={() => setPicking(true)}
        priceListEmpty={priceItems.length === 0}
        disabled={disabled}
      />
      <BottomSheet isOpen={picking} onOpenChange={setPicking}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View className="gap-3 pb-6">
              <BottomSheet.Title>Add item</BottomSheet.Title>
              <PriceItemList
                priceItems={priceItems}
                onPick={(item) => {
                  onChange(addItemToDraft(items, item));
                  setPicking(false);
                }}
              />
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}

/**
 * Edit items on a visit that isn't on an invoice: the picker, pre-filled, and a
 * Save items button. "+ Add item" swaps the sheet to the price list so only one
 * sheet is ever open. Mount it only while it's open.
 */
export function VisitItemsSheet({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const writer = usePracticeWriter();
  const { priceItems, visitItems } = usePracticeData();
  const { toast } = useToast();
  const [items, setItems] = useState<VisitItemDraft[]>(() =>
    draftsFromItems(visitItems.filter((item) => item.visitId === visit.id)),
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await writer.setVisitItems(visit.id, items);
      toast.show("Items saved");
      onClose();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      setError(userMessage(caught) ?? "The items couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <View className="gap-4 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="-ml-3 min-h-11"
                onPress={picking ? () => setPicking(false) : onClose}
              >
                {picking ? "Back" : "Cancel"}
              </Button>
              <BottomSheet.Title>{picking ? "Add item" : "Edit items"}</BottomSheet.Title>
              {/* Keeps the title in the middle. */}
              <View className="w-16" />
            </View>
            {picking ? (
              <PriceItemList
                priceItems={priceItems}
                onPick={(item) => {
                  setItems(addItemToDraft(items, item));
                  setError(null);
                  setPicking(false);
                }}
              />
            ) : (
              <>
                <ItemRows
                  items={items}
                  onChange={(next) => {
                    setItems(next);
                    setError(null);
                  }}
                  onAdd={() => setPicking(true)}
                  priceListEmpty={priceItems.length === 0}
                  disabled={saving}
                />
                {error ? (
                  <Text accessibilityRole="alert" className="text-sm text-danger">
                    {error}
                  </Text>
                ) : null}
                <PendingButton
                  pending={saving}
                  pendingLabel="Saving…"
                  label="Save items"
                  className="min-h-12 w-full"
                  onPress={() => void save()}
                />
              </>
            )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
