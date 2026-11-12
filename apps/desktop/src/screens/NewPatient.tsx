import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
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

/** New patient: name and an optional reason for visit, then straight to their note. */
export function NewPatient() {
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState(() => initialName(location.state));
  const [reason, setReason] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const patient = await store.addPatient({ fullName, reasonForVisit: reason });
      notify("Patient added");
      void navigate(`/patients/${patient.id}`, { replace: true });
    } catch (error) {
      const message = userMessage(error);
      if (message === null) throw error;
      setNameError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen back title="New patient">
      <form
        className="flex max-w-md flex-col gap-5"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <TextField
          isRequired
          isInvalid={nameError !== null}
          value={fullName}
          onChange={(value) => {
            setFullName(value);
            if (nameError) setNameError(null);
          }}
          autoFocus
        >
          <Label>Full name</Label>
          <Input className="h-11" autoComplete="off" />
          <FieldError>{nameError}</FieldError>
        </TextField>

        <TextField value={reason} onChange={setReason}>
          <Label>Reason for visit (optional)</Label>
          <Input className="h-11" autoComplete="off" />
        </TextField>

        <div>
          <Button type="submit" variant="primary" className="h-11 px-5" isPending={saving}>
            Add patient
          </Button>
        </div>
      </form>
    </Screen>
  );
}
