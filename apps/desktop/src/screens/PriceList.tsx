import { Pencil, TrashBin } from "@gravity-ui/icons";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
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
import { useState, type FormEvent } from "react";
import { InvoiceNumberFields } from "../components/InvoiceNumberFields";
import { PriceItemDialog } from "../components/PriceItemDialog";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import type { PracticeStore } from "../data/practiceStore";

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
  const [adding, setAdding] = useState(false);

  return (
    <Screen
      back
      title="Price list and tax"
      action={
        <Button variant="primary" className="h-11 px-5" onPress={() => setAdding(true)}>
          Add item
        </Button>
      }
    >
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
        <p className="text-sm text-muted">
          Changing a price doesn't change invoices you've already made.
        </p>
      </section>

      <SettingsForm store={store} />
      <PriceItemDialog isOpen={adding} onOpenChange={setAdding} />
    </Screen>
  );
}

function PriceItemRow({ item, store }: { item: PriceItem; store: PracticeStore }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PriceItemDraft>({ name: item.name, price: "" });
  const [errors, setErrors] = useState<PriceItemErrors>({});

  function startEditing() {
    setDraft({ name: item.name, price: centsToInput(item.unitPriceCents) });
    setErrors({});
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = checkPriceItem(draft);
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

function SettingsForm({ store }: { store: PracticeStore }) {
  const { settings, invoices } = usePracticeData();
  const [rate, setRate] = useState(() => formatPercent(settings.defaultTaxRateBasisPoints));
  const [rateError, setRateError] = useState<string | null>(null);
  const [format, setFormat] = useState(settings.invoiceNumberFormat);
  const savedNext = nextInvoiceNumber(invoices, settings.invoiceNumberStart);
  // Null until it's changed: until then the saved starting number stays as it is.
  const [next, setNext] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);

  const today = localDateString(new Date());
  const nextValue = next ?? String(savedNext);
  const example = buildInvoiceNumber(
    format,
    /^\d+$/.test(nextValue) && Number(nextValue) >= 1 ? Number(nextValue) : savedNext,
    today,
  );

  async function save(event: FormEvent) {
    event.preventDefault();
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
    if (
      await attempt(() =>
        store.saveSettings({
          defaultTaxRateBasisPoints: basisPoints,
          invoiceNumberFormat: { ...format, prefix: format.prefix.trim() },
          invoiceNumberStart: start,
        }),
      )
    ) {
      setRate(formatPercent(basisPoints));
      setFormat((current) => ({ ...current, prefix: current.prefix.trim() }));
      setNext(null);
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
          Used when you turn tax on for an invoice. Tax is off by default.
        </p>
        <h3 className="pt-2 font-semibold">Invoice numbers</h3>
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
        <div>
          <Button type="submit" variant="primary" className="h-11 px-5">
            Save settings
          </Button>
        </div>
      </form>
    </section>
  );
}
