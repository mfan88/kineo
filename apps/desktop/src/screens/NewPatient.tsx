import { FieldError, Input, Label, TextField } from "@heroui/react";
import { patientDetailsErrors, type PatientDetailsErrors } from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  PatientInfoFields,
  emptyPatientInfo,
  withoutError,
  type PatientInfo,
} from "../components/PatientInfoFields";
import { PendingButton } from "../components/PendingButton";
import { Screen } from "../components/Screen";
import { notify } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { useStore } from "../data/PracticeStoreProvider";

/** Home passes the name that was searched for, so it's already filled in. */
export interface NewPatientState {
  name?: string;
}

function initialName(state: unknown): string {
  if (typeof state === "object" && state !== null && "name" in state) {
    const { name } = state;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

/**
 * New patient: name, an optional reason for visit, and their information (email
 * and phone are needed, a child's parents too), then straight to their note.
 */
export function NewPatient() {
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState(() => initialName(location.state));
  const [reason, setReason] = useState("");
  const [info, setInfo] = useState<PatientInfo>(emptyPatientInfo);
  const [errors, setErrors] = useState<PatientDetailsErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { fullName, reasonForVisit: reason, ...info };
    const problems = patientDetailsErrors(input, { required: true });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      const patient = await store.addPatient(input);
      notify("Patient added");
      void navigate(`/patients/${patient.id}`, { replace: true });
    } catch (error) {
      const message = userMessage(error);
      if (message === null) throw error;
      setErrors({ fullName: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen back title="New patient">
      <form
        className="flex max-w-xl flex-col gap-5"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <TextField
          isRequired
          isInvalid={errors.fullName !== undefined}
          value={fullName}
          onChange={(value) => {
            setFullName(value);
            setErrors((current) => withoutError(current, "fullName"));
          }}
          autoFocus
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
          required
        />

        <div>
          <PendingButton
            type="submit"
            variant="primary"
            className="h-11 px-5"
            pending={saving}
            pendingLabel="Saving…"
          >
            Add patient
          </PendingButton>
        </div>
      </form>
    </Screen>
  );
}
