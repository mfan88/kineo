import { Pencil, TrashBin } from "@gravity-ui/icons";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  centsToInput,
  formatCad,
  formatInvoiceNumber,
  formatPercent,
  nextInvoiceNumber,
  parseCad,
  parsePercent,
  type PriceItem,
} from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import type { PracticeStore } from "../data/practiceStore";

interface ItemDraft {
  name: string;
  price: string;
}

interface ItemErrors {
  name?: string;
  price?: string;
}

/** Checks an item form; returns the cents to save, or the errors to show. */
function checkItem(draft: ItemDraft): { cents: number } | { errors: ItemErrors } {
  const errors: ItemErrors = {};
  if (draft.name.trim() === "") errors.name = "Give the item a name.";
  const cents = parseCad(draft.price);
  if (cents === null) errors.price = "Enter a price in dollars, like 95 or 95.50.";
  if (errors.name || errors.price || cents === null) return { errors };
  return { cents };
}

/** Runs a store change, turning a refused one into an error toast. Resolves to whether it worked. */
async function attempt(change: () => Promise<unknown>): Promise<boolean> {
  try {
    await change();
    return true;
  } catch (caught) {
    const message = userMessage(caught);
    if (message === null) throw caught;
    notifyError(message);
    return false;
  }
}

/** Price list and tax: what you charge, your default tax rate and invoice numbers. */
export function PriceList() {
  const store = useStore();
  const { priceItems } = usePracticeData();

  return (
    <Screen back title="Price list and tax">
      <section aria-labelledby="price-list-heading" className="flex flex-col gap-3">
        <h2 id="price-list-heading" className="text-lg font-semibold">
          Price list
        </h2>
        {priceItems.length === 0 ? (
          <p className="text-sm text-muted">
            No items yet. Add what you charge for so you can put it on invoices.
          </p>
        ) : (
          <ul
            aria-label="Price list"
            className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
          >
            {priceItems.map((item) => (
              <PriceItemRow key={item.id} item={item} store={store} />
            ))}
          </ul>
        )}
        <AddItemForm store={store} />
      </section>

      <SettingsForm store={store} />
    </Screen>
  );
}

function PriceItemRow({ item, store }: { item: PriceItem; store: PracticeStore }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>({ name: item.name, price: "" });
  const [errors, setErrors] = useState<ItemErrors>({});

  function startEditing() {
    setDraft({ name: item.name, price: centsToInput(item.unitPriceCents) });
    setErrors({});
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = checkItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    if (
      await attempt(() =>
        store.updatePriceItem(item.id, { name: draft.name, unitPriceCents: result.cents }),
      )
    ) {
      setEditing(false);
      notify("Item updated");
    }
  }

  if (editing) {
    return (
      <li aria-label={`Editing ${item.name}`} className="p-4">
        <form
          className="flex flex-wrap items-start gap-3"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <TextField
            className="min-w-48 flex-1"
            value={draft.name}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            isInvalid={errors.name !== undefined}
          >
            <Label>Name</Label>
            <Input className="h-11" autoComplete="off" />
            <FieldError>{errors.name}</FieldError>
          </TextField>
          <TextField
            className="w-36"
            value={draft.price}
            onChange={(price) => setDraft((d) => ({ ...d, price }))}
            isInvalid={errors.price !== undefined}
          >
            <Label>Price ($)</Label>
            <Input className="h-11" inputMode="decimal" autoComplete="off" />
            <FieldError>{errors.price}</FieldError>
          </TextField>
          <div className="flex gap-2 pt-6">
            <Button type="submit" variant="secondary" className="h-11">
              Save item
            </Button>
            <Button variant="ghost" className="h-11" onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li aria-label={item.name} className="flex min-h-14 items-center gap-2 px-4 py-2">
      <span className="flex-1 font-medium">{item.name}</span>
      <span className="tabular-nums">{formatCad(item.unitPriceCents)}</span>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={`Edit ${item.name}`}
        className="size-11 min-w-11"
        onPress={startEditing}
      >
        <Pencil width={18} height={18} aria-hidden />
      </Button>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={`Remove ${item.name}`}
        className="size-11 min-w-11"
        onPress={() => {
          void attempt(() => store.removePriceItem(item.id)).then((removed) => {
            if (removed) notify("Item removed");
          });
        }}
      >
        <TrashBin width={18} height={18} aria-hidden />
      </Button>
    </li>
  );
}

function AddItemForm({ store }: { store: PracticeStore }) {
  const [draft, setDraft] = useState<ItemDraft>({ name: "", price: "" });
  const [errors, setErrors] = useState<ItemErrors>({});

  async function add(event: FormEvent) {
    event.preventDefault();
    const result = checkItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    if (
      await attempt(() => store.addPriceItem({ name: draft.name, unitPriceCents: result.cents }))
    ) {
      setDraft({ name: "", price: "" });
      setErrors({});
      notify("Item added");
    }
  }

  return (
    <form
      aria-label="Add an item"
      className="flex flex-wrap items-start gap-3"
      onSubmit={(event) => void add(event)}
      noValidate
    >
      <TextField
        className="min-w-48 flex-1"
        value={draft.name}
        onChange={(name) => {
          setDraft((d) => ({ ...d, name }));
          setErrors(({ price }) => (price === undefined ? {} : { price }));
        }}
        isInvalid={errors.name !== undefined}
      >
        <Label>New item</Label>
        <Input className="h-11" placeholder="e.g. Initial assessment" autoComplete="off" />
        <FieldError>{errors.name}</FieldError>
      </TextField>
      <TextField
        className="w-36"
        value={draft.price}
        onChange={(price) => {
          setDraft((d) => ({ ...d, price }));
          setErrors(({ name }) => (name === undefined ? {} : { name }));
        }}
        isInvalid={errors.price !== undefined}
      >
        <Label>Price ($)</Label>
        <Input className="h-11" inputMode="decimal" placeholder="0.00" autoComplete="off" />
        <FieldError>{errors.price}</FieldError>
      </TextField>
      <div className="pt-6">
        <Button type="submit" variant="secondary" className="h-11">
          Add item
        </Button>
      </div>
    </form>
  );
}

function SettingsForm({ store }: { store: PracticeStore }) {
  const { settings, invoices } = usePracticeData();
  const [rate, setRate] = useState(() => formatPercent(settings.defaultTaxRateBasisPoints));
  const [prefix, setPrefix] = useState(settings.invoiceNumberPrefix);
  const [rateError, setRateError] = useState<string | null>(null);

  const nextNumber = formatInvoiceNumber(prefix, nextInvoiceNumber(invoices));

  async function save(event: FormEvent) {
    event.preventDefault();
    const basisPoints = parsePercent(rate);
    if (basisPoints === null) {
      setRateError("Enter a tax rate from 0 to 100, like 5 or 12.5.");
      return;
    }
    if (
      await attempt(() =>
        store.saveSettings({ defaultTaxRateBasisPoints: basisPoints, invoiceNumberPrefix: prefix }),
      )
    ) {
      setRate(formatPercent(basisPoints));
      setPrefix(prefix.trim());
      notify("Settings saved");
    }
  }

  return (
    <section aria-labelledby="tax-heading" className="flex flex-col gap-3 pt-4">
      <h2 id="tax-heading" className="text-lg font-semibold">
        Tax and invoice numbers
      </h2>
      <form
        className="flex max-w-md flex-col gap-4"
        onSubmit={(event) => void save(event)}
        noValidate
      >
        <TextField
          value={rate}
          onChange={(value) => {
            setRate(value);
            setRateError(null);
          }}
          isInvalid={rateError !== null}
        >
          <Label>Default tax rate (%)</Label>
          <Input className="h-11" inputMode="decimal" autoComplete="off" />
          <FieldError>{rateError}</FieldError>
        </TextField>
        <p className="-mt-2 text-sm text-muted">
          Tax is off on new invoices; this rate is used when you turn it on.
        </p>
        <TextField value={prefix} onChange={setPrefix} maxLength={20}>
          <Label>Invoice number prefix (optional)</Label>
          <Input className="h-11" placeholder="e.g. INV-" autoComplete="off" />
        </TextField>
        <p className="-mt-2 text-sm text-muted">Your next invoice will be {nextNumber}.</p>
        <div>
          <Button type="submit" variant="primary" className="h-11 px-5">
            Save settings
          </Button>
        </div>
      </form>
    </section>
  );
}
