import { Button, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import { patientDetailsErrors, type Patient, type PatientDetailsErrors } from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { useStore } from "../data/PracticeStoreProvider";
import {
  PatientInfoFields,
  patientInfoOf,
  withoutError,
  type PatientInfo,
} from "./PatientInfoFields";
import { PendingButton } from "./PendingButton";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

/**
 * Edit details on a patient: their name, reason for visit and information. Draft
 * invoices take the new name and shown details; sent ones keep theirs. Patients
 * added before email and phone were needed can leave them blank.
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
  const [info, setInfo] = useState<PatientInfo>(() => patientInfoOf(patient));
  const [errors, setErrors] = useState<PatientDetailsErrors>({});
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const input = { fullName, reasonForVisit: reason, ...info };
    const problems = patientDetailsErrors(input, { required: patient.detailsRequired });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      await store.updatePatient(patient.id, input);
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
      <Modal.Container scroll="inside">
        <Modal.Dialog className="w-full max-w-[600px]">
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
                  setErrors((current) => withoutError(current, "fullName"));
                }}
                isInvalid={errors.fullName !== undefined}
              >
                <Label>Full name</Label>
                <Input className="h-11" autoComplete="off" />
                <FieldError>{errors.fullName}</FieldError>
              </TextField>
              <TextField value={reason} onChange={setReason}>
                <Label>Reason for visit (optional)</Label>
                <Input className="h-11" autoComplete="off" />
              </TextField>
              <PatientInfoFields
                value={info}
                onChange={(next, field) => {
                  setInfo(next);
                  setErrors((current) => withoutError(current, field));
                }}
                errors={errors}
                required={patient.detailsRequired}
              />
              <p className="text-sm text-muted">
                Invoices not sent yet show the new details. Sent invoices keep the ones they were
                sent with.
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
