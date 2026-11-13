import { Button, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import type { Patient } from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { useStore } from "../data/PracticeStoreProvider";
import { PendingButton } from "./PendingButton";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

/**
 * Edit details on a patient: corrects their full name and reason for visit. Draft
 * invoices billed to them take the new name; sent ones keep theirs.
 */
export function PatientDetailsDialog({
  patient,
  isOpen,
  onOpenChange,
}: {
  patient: Patient;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const store = useStore();
  const [fullName, setFullName] = useState(patient.fullName);
  const [reason, setReason] = useState(patient.reasonForVisit ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (fullName.trim() === "") {
      setNameError("Add the patient's full name.");
      return;
    }
    setSaving(true);
    try {
      await store.updatePatient(patient.id, { fullName, reasonForVisit: reason });
      notify("Patient updated");
      onOpenChange(false);
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog>
          <form onSubmit={(event) => void save(event)} noValidate>
            <Modal.Header>
              <Modal.Heading>Edit details</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <TextField
                autoFocus
                value={fullName}
                onChange={(value) => {
                  setFullName(value);
                  setNameError(null);
                }}
                isInvalid={nameError !== null}
              >
                <Label>Full name</Label>
                <Input className="h-11" autoComplete="off" />
                <FieldError>{nameError}</FieldError>
              </TextField>
              <TextField value={reason} onChange={setReason}>
                <Label>Reason for visit (optional)</Label>
                <Input className="h-11" autoComplete="off" />
              </TextField>
              <p className="text-sm text-muted">
                Invoices not sent yet show the new name. Sent invoices keep the one they were sent
                with.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="h-11" onPress={() => onOpenChange(false)}>
                Cancel
              </Button>
              <PendingButton
                type="submit"
                variant="primary"
                className="h-11"
                pending={saving}
                pendingLabel="Saving…"
              >
                Save details
              </PendingButton>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
