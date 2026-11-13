import { FieldError, Input, Label, Switch, TextField } from "@heroui/react";
import {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  profileErrors,
  profileFieldHint,
  type ProfileFieldKey,
  type ProfileFields,
} from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { PendingButton } from "../components/PendingButton";
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
    <Screen
      back
      title="Your profile"
      action={
        <PendingButton
          type="submit"
          form="profile-form"
          variant="primary"
          className="h-11 px-5"
          pending={saving}
          pendingLabel="Saving…"
        >
          Save profile
        </PendingButton>
      }
    >
      <p className="text-muted">Fields shown on invoices are required.</p>
      <form
        id="profile-form"
        className="flex max-w-xl flex-col gap-5"
        onSubmit={(event) => void save(event)}
        noValidate
      >
        {PROFILE_FIELD_KEYS.map((key) => {
          const label = PROFILE_FIELD_LABELS[key];
          const invalid = showErrors && errors.has(key);
          return (
            <TextField
              key={key}
              value={fields[key].value}
              onChange={(value) => update(key, { value })}
              isInvalid={invalid}
              isRequired={fields[key].showOnInvoice}
            >
              <div className="flex min-h-11 items-center justify-between gap-3">
                <Label>{label}</Label>
                <Switch
                  isSelected={fields[key].showOnInvoice}
                  onChange={(showOnInvoice) => update(key, { showOnInvoice })}
                  aria-label={`Show ${label.toLowerCase()} on invoices`}
                >
                  {/* Content is the clickable label, so the switch goes inside it. */}
                  <Switch.Content className="flex flex-row items-center gap-3">
                    <span className="text-sm text-muted">Show on invoice</span>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </div>
              <Input className="h-11" autoComplete="off" />
              <FieldError>{invalid ? profileFieldHint(key) : null}</FieldError>
            </TextField>
          );
        })}
      </form>
    </Screen>
  );
}
