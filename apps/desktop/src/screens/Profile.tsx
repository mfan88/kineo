import { Button, FieldError, Input, Label, Switch, TextField } from "@heroui/react";
import {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  profileErrors,
  type ProfileFieldKey,
  type ProfileFields,
} from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";

function pickFields(profile: ProfileFields): ProfileFields {
  return {
    fullName: profile.fullName,
    title: profile.title,
    clinicName: profile.clinicName,
    address: profile.address,
    phone: profile.phone,
  };
}

/** Your profile: five details, each with whether it appears on invoices. */
export function Profile() {
  const store = useStore();
  const { profile } = usePracticeData();
  const [fields, setFields] = useState<ProfileFields>(() => pickFields(profile));
  const [saving, setSaving] = useState(false);
  // Errors appear after the first save attempt, then update as you type.
  const [showErrors, setShowErrors] = useState(false);

  const errors = new Map(profileErrors(fields).map((error) => [error.field, error.message]));

  function update(key: ProfileFieldKey, change: Partial<ProfileFields[ProfileFieldKey]>) {
    setFields((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (errors.size > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      const saved = await store.saveProfile(fields);
      setFields(pickFields(saved));
      setShowErrors(false);
      notify("Profile saved");
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen back title="Your profile">
      <p className="text-muted">
        Turn on "Show on invoice" for the details patients should see. Those need to be filled in.
      </p>
      <form
        className="flex max-w-xl flex-col gap-5"
        onSubmit={(event) => void save(event)}
        noValidate
      >
        {PROFILE_FIELD_KEYS.map((key) => {
          const label = PROFILE_FIELD_LABELS[key];
          const error = showErrors ? (errors.get(key) ?? null) : null;
          return (
            <div key={key} className="flex flex-col gap-2">
              <TextField
                value={fields[key].value}
                onChange={(value) => update(key, { value })}
                isInvalid={error !== null}
                isRequired={fields[key].showOnInvoice}
              >
                <Label>{label}</Label>
                <Input className="h-11" autoComplete="off" />
                <FieldError>{error}</FieldError>
              </TextField>
              <Switch
                className="flex flex-row items-center gap-3"
                isSelected={fields[key].showOnInvoice}
                onChange={(showOnInvoice) => update(key, { showOnInvoice })}
                aria-label={`Show ${label.toLowerCase()} on invoices`}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <span className="text-sm">Show on invoice</span>
                </Switch.Content>
              </Switch>
            </div>
          );
        })}
        <div>
          <Button type="submit" variant="primary" className="h-11 px-5" isPending={saving}>
            Save profile
          </Button>
        </div>
      </form>
    </Screen>
  );
}
