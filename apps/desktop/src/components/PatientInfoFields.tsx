import { CircleExclamation, Plus, TrashBin } from "@gravity-ui/icons";
import { Button, FieldError, Input, Label, Switch, TextField } from "@heroui/react";
import {
  MAX_PARENT_NAMES,
  MAX_PATIENT_CUSTOM_DETAILS,
  type Patient,
  type PatientCustomDetailInput,
  type PatientDetailsErrorField,
  type PatientDetailsErrors,
} from "@kineo/shared";

/** The patient information below the name and reason for visit, as the form holds it. */
export interface PatientInfo {
  isChild: boolean;
  /** At least one entry, so a child always shows one parent field. */
  parentNames: string[];
  parentNamesOnInvoice: boolean;
  email: string;
  emailOnInvoice: boolean;
  phone: string;
  phoneOnInvoice: boolean;
  customDetails: PatientCustomDetailInput[];
}

/** A new patient's information: nothing filled in, nothing shown on invoices. */
export function emptyPatientInfo(): PatientInfo {
  return {
    isChild: false,
    parentNames: [""],
    parentNamesOnInvoice: false,
    email: "",
    emailOnInvoice: false,
    phone: "",
    phoneOnInvoice: false,
    customDetails: [],
  };
}

/** A saved patient's information, ready to edit. */
export function patientInfoOf(patient: Patient): PatientInfo {
  return {
    isChild: patient.isChild,
    parentNames: patient.parentNames.length > 0 ? [...patient.parentNames] : [""],
    parentNamesOnInvoice: patient.parentNamesOnInvoice,
    email: patient.email,
    emailOnInvoice: patient.emailOnInvoice,
    phone: patient.phone,
    phoneOnInvoice: patient.phoneOnInvoice,
    customDetails: patient.customDetails.map((detail) => ({ ...detail })),
  };
}

/** The errors with `field`'s cleared, once it has been edited. */
export function withoutError(
  errors: PatientDetailsErrors,
  field: PatientDetailsErrorField,
): PatientDetailsErrors {
  if (errors[field] === undefined) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

/** A small "Show on invoice" switch for a field's label row (the Profile pattern). */
function ShowOnInvoice({
  name,
  isSelected,
  onChange,
}: {
  name: string;
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} aria-label={`Show ${name} on invoice`}>
      {/* Content is the clickable label, so the switch goes inside it. */}
      <Switch.Content className="flex flex-row items-center gap-3">
        <span className="text-sm text-muted">Show on invoice</span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

/** Which row an error belongs under: the first blank one, or the first repeated label. */
function errorRow(rows: readonly string[][], message: string | undefined): number | null {
  if (message === undefined) return null;
  const blank = rows.findIndex((values) => values.some((value) => value.trim() === ""));
  if (blank !== -1) return blank;
  const seen = new Set<string>();
  for (const [index, values] of rows.entries()) {
    const key = (values[0] ?? "").trim().toLowerCase();
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return rows.length - 1;
}

function GroupError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p role="alert" className="inline-flex items-center gap-1 text-sm text-danger">
      <CircleExclamation width={14} height={14} aria-hidden />
      {message}
    </p>
  );
}

/**
 * The child switch with parent names, email, phone and custom details, each with
 * its own "Show on invoice" switch. Used by New patient and Edit details. `required`
 * is false for patients added before these details existed; their fields say
 * "(optional)". `errors` come from `patientDetailsErrors`.
 */
export function PatientInfoFields({
  value,
  onChange,
  errors,
  required,
}: {
  value: PatientInfo;
  /** The new value, and which error it may have fixed. */
  onChange: (next: PatientInfo, field: PatientDetailsErrorField) => void;
  errors: PatientDetailsErrors;
  required: boolean;
}) {
  const optional = required ? "" : " (optional)";
  const emailLabel = `${value.isChild ? "Parent email" : "Email"}${optional}`;
  const phoneLabel = `${value.isChild ? "Parent phone" : "Phone"}${optional}`;

  const parentErrorRow = errorRow(
    value.parentNames.map((name) => [name]),
    errors.parentNames,
  );
  const detailErrorRow = errorRow(
    value.customDetails.map((detail) => [detail.label, detail.value]),
    errors.customDetails,
  );

  function setParent(index: number, name: string) {
    const parentNames = value.parentNames.map((current, i) => (i === index ? name : current));
    onChange({ ...value, parentNames }, "parentNames");
  }

  function setDetail(id: string, change: Partial<PatientCustomDetailInput>) {
    const customDetails = value.customDetails.map((detail) =>
      detail.id === id ? { ...detail, ...change } : detail,
    );
    onChange({ ...value, customDetails }, "customDetails");
  }

  return (
    <>
      <Switch
        isSelected={value.isChild}
        onChange={(isChild) =>
          onChange(
            {
              ...value,
              isChild,
              parentNames: value.parentNames.length > 0 ? value.parentNames : [""],
            },
            "parentNames",
          )
        }
      >
        <Switch.Content className="flex min-h-11 flex-row items-center justify-between gap-3">
          <span>Patient is a child</span>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>

      {value.isChild ? (
        <div role="group" aria-label="Parents" className="flex flex-col gap-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-medium">{`Parent name${optional}`}</span>
            <ShowOnInvoice
              name="parent names"
              isSelected={value.parentNamesOnInvoice}
              onChange={(parentNamesOnInvoice) =>
                onChange({ ...value, parentNamesOnInvoice }, "parentNames")
              }
            />
          </div>
          {value.parentNames.map((name, index) => (
            // Parents have no ID of their own; their place in the list is it.
            <div key={index} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <TextField
                  className="flex-1"
                  value={name}
                  onChange={(next) => setParent(index, next)}
                  isInvalid={parentErrorRow === index}
                  aria-label={index === 0 ? "Parent name" : `Parent name ${index + 1}`}
                >
                  <Input className="h-11" autoComplete="off" />
                </TextField>
                {value.parentNames.length > 1 ? (
                  <Button
                    isIconOnly
                    variant="ghost"
                    className="size-11 min-w-11"
                    aria-label="Remove parent"
                    onPress={() =>
                      onChange(
                        { ...value, parentNames: value.parentNames.filter((_, i) => i !== index) },
                        "parentNames",
                      )
                    }
                  >
                    <TrashBin width={18} height={18} aria-hidden />
                  </Button>
                ) : null}
              </div>
              {parentErrorRow === index ? <GroupError message={errors.parentNames} /> : null}
            </div>
          ))}
          {value.parentNames.length < MAX_PARENT_NAMES ? (
            <div>
              <Button
                variant="ghost"
                className="-ml-3 h-11"
                onPress={() =>
                  onChange({ ...value, parentNames: [...value.parentNames, ""] }, "parentNames")
                }
              >
                <Plus width={16} height={16} aria-hidden />
                Add parent
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <TextField
        type="email"
        value={value.email}
        onChange={(email) => onChange({ ...value, email }, "email")}
        isInvalid={errors.email !== undefined}
        isRequired={required}
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label>{emailLabel}</Label>
          <ShowOnInvoice
            name="email"
            isSelected={value.emailOnInvoice}
            onChange={(emailOnInvoice) => onChange({ ...value, emailOnInvoice }, "email")}
          />
        </div>
        <Input className="h-11" autoComplete="off" />
        <FieldError>{errors.email}</FieldError>
      </TextField>

      <TextField
        type="tel"
        value={value.phone}
        onChange={(phone) => onChange({ ...value, phone }, "phone")}
        isInvalid={errors.phone !== undefined}
        isRequired={required}
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label>{phoneLabel}</Label>
          <ShowOnInvoice
            name="phone"
            isSelected={value.phoneOnInvoice}
            onChange={(phoneOnInvoice) => onChange({ ...value, phoneOnInvoice }, "phone")}
          />
        </div>
        <Input className="h-11" autoComplete="off" />
        <FieldError>{errors.phone}</FieldError>
      </TextField>

      <div role="group" aria-label="Other details" className="flex flex-col gap-2">
        {value.customDetails.length > 0 ? (
          <span className="text-sm font-medium">Other details</span>
        ) : null}
        {value.customDetails.map((detail, index) => {
          const number = index + 1;
          const flagged = detailErrorRow === index;
          return (
            <div key={detail.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <TextField
                  className="flex-1"
                  value={detail.label}
                  onChange={(label) => setDetail(detail.id, { label })}
                  isInvalid={flagged && (detail.label.trim() === "" || detail.value.trim() !== "")}
                  aria-label={`Label for detail ${number}`}
                >
                  <Input className="h-11" autoComplete="off" placeholder="Referring doctor" />
                </TextField>
                <TextField
                  className="flex-1"
                  value={detail.value}
                  onChange={(next) => setDetail(detail.id, { value: next })}
                  isInvalid={flagged && detail.value.trim() === ""}
                  aria-label={`Value for detail ${number}`}
                >
                  <Input className="h-11" autoComplete="off" />
                </TextField>
                <ShowOnInvoice
                  name={`detail ${number}`}
                  isSelected={detail.showOnInvoice}
                  onChange={(showOnInvoice) => setDetail(detail.id, { showOnInvoice })}
                />
                <Button
                  isIconOnly
                  variant="ghost"
                  className="size-11 min-w-11"
                  aria-label={`Remove detail ${number}`}
                  onPress={() =>
                    onChange(
                      {
                        ...value,
                        customDetails: value.customDetails.filter(
                          (candidate) => candidate.id !== detail.id,
                        ),
                      },
                      "customDetails",
                    )
                  }
                >
                  <TrashBin width={18} height={18} aria-hidden />
                </Button>
              </div>
              {flagged ? <GroupError message={errors.customDetails} /> : null}
            </div>
          );
        })}
        {value.customDetails.length < MAX_PATIENT_CUSTOM_DETAILS ? (
          <div>
            <Button
              variant="ghost"
              className="-ml-3 h-11"
              onPress={() =>
                onChange(
                  {
                    ...value,
                    customDetails: [
                      ...value.customDetails,
                      { id: crypto.randomUUID(), label: "", value: "", showOnInvoice: false },
                    ],
                  },
                  "customDetails",
                )
              }
            >
              <Plus width={16} height={16} aria-hidden />
              Add detail
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
