import { Button, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import {
  checkPriceItem,
  type PriceItem,
  type PriceItemDraft,
  type PriceItemErrors,
} from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { useStore } from "../data/PracticeStoreProvider";
import { PendingButton } from "./PendingButton";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

const EMPTY: PriceItemDraft = { name: "", price: "" };

/**
 * The dialog that adds an item to the price list: "New item", Name, Price and Save
 * item. Used by Price list and tax and by an invoice's "+ New price list item", which
 * puts the saved item on the invoice as a line.
 */
export function PriceItemDialog({
  isOpen,
  onOpenChange,
  onAdded,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved item, after the "Item added" toast. */
  onAdded?: (item: PriceItem) => void;
}) {
  const store = useStore();
  const [draft, setDraft] = useState<PriceItemDraft>(EMPTY);
  const [errors, setErrors] = useState<PriceItemErrors>({});
  const [saving, setSaving] = useState(false);

  function change(open: boolean) {
    if (!open) {
      setDraft(EMPTY);
      setErrors({});
    }
    onOpenChange(open);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = checkPriceItem(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      const item = await store.addPriceItem({ name: draft.name, unitPriceCents: result.cents });
      notify("Item added");
      change(false);
      onAdded?.(item);
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={change}>
      <Modal.Container>
        <Modal.Dialog>
          <form onSubmit={(event) => void save(event)} noValidate>
            <Modal.Header>
              <Modal.Heading>New item</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <TextField
                autoFocus
                value={draft.name}
                onChange={(name) => {
                  setDraft((d) => ({ ...d, name }));
                  setErrors(({ price }) => (price === undefined ? {} : { price }));
                }}
                isInvalid={errors.name !== undefined}
              >
                <Label>Name</Label>
                <Input className="h-11" placeholder="e.g. Initial assessment" autoComplete="off" />
                <FieldError>{errors.name}</FieldError>
              </TextField>
              <TextField
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
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="h-11" onPress={() => change(false)}>
                Cancel
              </Button>
              <PendingButton
                type="submit"
                variant="primary"
                className="h-11"
                pending={saving}
                pendingLabel="Saving…"
              >
                Save item
              </PendingButton>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
