import { TrashBin } from "@gravity-ui/icons";
import { Button, Dropdown } from "@heroui/react";
import {
  addItemToDraft,
  formatCad,
  removeDraftItem,
  setDraftQuantity,
  type PriceItem,
  type VisitItemDraft,
} from "@kineo/shared";
import { Link } from "react-router";

/**
 * The items on a visit, chosen from the price list: a row each with a quantity
 * stepper, and "+ Add item" to pick more. Shared by the note box and the Edit
 * items dialog.
 */
export function VisitItemsField({
  items,
  onChange,
  priceItems,
}: {
  items: readonly VisitItemDraft[];
  onChange: (items: VisitItemDraft[]) => void;
  priceItems: readonly Pick<PriceItem, "id" | "name" | "unitPriceCents">[];
}) {
  return (
    <div role="group" aria-labelledby="visit-items-label" className="flex flex-col gap-1">
      <span id="visit-items-label" className="text-sm font-medium">
        Items (optional)
      </span>
      {items.length > 0 ? (
        <ul aria-label="Chosen items" className="flex flex-col">
          {items.map((item, index) => (
            <li
              key={item.priceItemId ?? `${item.name}-${index}`}
              className="flex min-h-11 items-center gap-3"
            >
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.name}</span>
              <span className="text-sm text-muted tabular-nums">
                {formatCad(item.unitPriceCents)}
              </span>
              <div className="flex items-center">
                <Button
                  isIconOnly
                  variant="ghost"
                  className="size-11 min-w-11"
                  aria-label={`Fewer ${item.name}`}
                  isDisabled={item.quantity <= 1}
                  onPress={() => onChange(setDraftQuantity(items, index, item.quantity - 1))}
                >
                  <span aria-hidden>−</span>
                </Button>
                <span
                  className="w-6 text-center tabular-nums"
                  aria-label={`Quantity ${item.quantity}`}
                >
                  {item.quantity}
                </span>
                <Button
                  isIconOnly
                  variant="ghost"
                  className="size-11 min-w-11"
                  aria-label={`More ${item.name}`}
                  onPress={() => onChange(setDraftQuantity(items, index, item.quantity + 1))}
                >
                  <span aria-hidden>+</span>
                </Button>
              </div>
              <Button
                isIconOnly
                variant="ghost"
                className="size-11 min-w-11"
                aria-label={`Remove ${item.name}`}
                onPress={() => onChange(removeDraftItem(items, index))}
              >
                <TrashBin width={18} height={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {priceItems.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          Add items to your price list to bill them with a note.
          <Link
            to="/settings/price-list"
            className="inline-flex min-h-11 items-center text-accent underline"
          >
            Price list
          </Link>
        </p>
      ) : (
        <div className="-ml-3">
          <Dropdown>
            <Button variant="ghost" className="h-11 text-accent">
              + Add item
            </Button>
            <Dropdown.Popover placement="bottom start" className="min-w-80">
              <Dropdown.Menu
                aria-label="Price list"
                onAction={(key) => {
                  const chosen = priceItems.find((candidate) => candidate.id === key);
                  if (chosen) onChange(addItemToDraft(items, chosen));
                }}
              >
                {priceItems.map((item) => (
                  <Dropdown.Item
                    key={item.id}
                    id={item.id}
                    textValue={`${item.name} · ${formatCad(item.unitPriceCents)}`}
                    className="min-h-11"
                  >
                    {`${item.name} · ${formatCad(item.unitPriceCents)}`}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      )}
    </div>
  );
}
