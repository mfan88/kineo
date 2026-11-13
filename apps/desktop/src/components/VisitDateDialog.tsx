import { Button, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import { dayInputValue, localDateString, readVisitDateInput, type Visit } from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { useStore } from "../data/PracticeStoreProvider";
import { PendingButton } from "./PendingButton";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

/**
 * Change date on a visit that isn't on an invoice: "Visit date" (typed like
 * "11 Nov 2026") and Save date. Mount it only while it's open.
 */
export function VisitDateDialog({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const store = useStore();
  const [text, setText] = useState(() => dayInputValue(visit.visitDate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const read = readVisitDateInput(text, localDateString(new Date()));
    if (!read.ok) {
      setError(read.message);
      return;
    }
    setSaving(true);
    try {
      await store.setVisitDate(visit.id, read.value);
      notify("Visit date changed");
      onClose();
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog>
          <form onSubmit={(event) => void save(event)} noValidate>
            <Modal.Header>
              <Modal.Heading>Change date</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <TextField
                autoFocus
                value={text}
                onChange={(value) => {
                  setText(value);
                  setError(null);
                }}
                isInvalid={error !== null}
              >
                <Label>Visit date</Label>
                <Input className="h-11" placeholder="e.g. 11 Nov 2026" autoComplete="off" />
                <FieldError>{error}</FieldError>
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="h-11" onPress={onClose}>
                Cancel
              </Button>
              <PendingButton
                type="submit"
                variant="primary"
                className="h-11"
                pending={saving}
                pendingLabel="Saving…"
              >
                Save date
              </PendingButton>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
