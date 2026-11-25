import {
  MAX_PARENT_NAMES,
  MAX_PATIENT_CUSTOM_DETAILS,
  type Patient,
  type PatientCustomDetailInput,
  type PatientDetailsErrorField,
  type PatientDetailsErrors,
} from "@kineo/shared";
import { randomUUID } from "expo-crypto";
import { Button, FieldError, Label, Switch, TextField } from "heroui-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { useThemeColors } from "@/theme/theme-colors";
import { SheetInput } from "./sheet-input";

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

/** A switch row: the whole row is the target, the switch inside only shows the state. */
function SwitchRow({
  label,
  accessibilityLabel,
  isSelected,
  onChange,
  muted = false,
}: {
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  muted?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: isSelected }}
      onPress={() => onChange(!isSelected)}
      className={`min-h-11 flex-row items-center gap-3 ${muted ? "" : "justify-between"}`}
    >
      <Text className={muted ? "text-sm text-muted" : "text-foreground"}>{label}</Text>
      <Switch
        isSelected={isSelected}
        onSelectedChange={onChange}
        // HeroUI Native draws the off track from --default, too faint on a card.
        animation={{
          backgroundColor: { value: [colors.controlTrack, colors.primaryStrong] },
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

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
    <SwitchRow
      muted
      label="Show on invoice"
      accessibilityLabel={`Show ${name} on invoice`}
      isSelected={isSelected}
      onChange={onChange}
    />
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
    <Text accessibilityRole="alert" className="text-sm text-danger">
      {message}
    </Text>
  );
}

/**
 * The child switch with parent names, email, phone and custom details, each with
 * its own "Show on invoice" switch. Used by New patient and the edit details sheet
 * (its inputs move the sheet above the keyboard). `required` is false for patients
 * added before these details existed; their fields say "(optional)". `errors` come
 * from `patientDetailsErrors`.
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
    <View className="gap-5">
      <SwitchRow
        label="Patient is a child"
        accessibilityLabel="Patient is a child"
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
      />

      {value.isChild ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Label>{`Parent name${optional}`}</Label>
            <ShowOnInvoice
              name="parent names"
              isSelected={value.parentNamesOnInvoice}
              onChange={(parentNamesOnInvoice) =>
                onChange({ ...value, parentNamesOnInvoice }, "parentNames")
              }
            />
          </View>
          {value.parentNames.map((name, index) => (
            // Parents have no ID of their own; their place in the list is it.
            <View key={index} className="gap-1">
              <View className="flex-row items-center gap-2">
                <TextField className="flex-1" isInvalid={parentErrorRow === index}>
                  <SheetInput
                    value={name}
                    onChangeText={(next) => setParent(index, next)}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="off"
                    accessibilityLabel={index === 0 ? "Parent name" : `Parent name ${index + 1}`}
                  />
                </TextField>
                {value.parentNames.length > 1 ? (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    accessibilityLabel="Remove parent"
                    onPress={() =>
                      onChange(
                        { ...value, parentNames: value.parentNames.filter((_, i) => i !== index) },
                        "parentNames",
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </View>
              {parentErrorRow === index ? <GroupError message={errors.parentNames} /> : null}
            </View>
          ))}
          {value.parentNames.length < MAX_PARENT_NAMES ? (
            <Button
              variant="ghost"
              className="-ml-3 min-h-11 self-start"
              onPress={() =>
                onChange({ ...value, parentNames: [...value.parentNames, ""] }, "parentNames")
              }
            >
              Add parent
            </Button>
          ) : null}
        </View>
      ) : null}

      <TextField isInvalid={errors.email !== undefined} isRequired={required}>
        <View className="flex-row items-center justify-between gap-3">
          <Label>{emailLabel}</Label>
          <ShowOnInvoice
            name="email"
            isSelected={value.emailOnInvoice}
            onChange={(emailOnInvoice) => onChange({ ...value, emailOnInvoice }, "email")}
          />
        </View>
        <SheetInput
          value={value.email}
          onChangeText={(email) => onChange({ ...value, email }, "email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          accessibilityLabel={emailLabel}
        />
        <FieldError>{errors.email}</FieldError>
      </TextField>

      <TextField isInvalid={errors.phone !== undefined} isRequired={required}>
        <View className="flex-row items-center justify-between gap-3">
          <Label>{phoneLabel}</Label>
          <ShowOnInvoice
            name="phone"
            isSelected={value.phoneOnInvoice}
            onChange={(phoneOnInvoice) => onChange({ ...value, phoneOnInvoice }, "phone")}
          />
        </View>
        <SheetInput
          value={value.phone}
          onChangeText={(phone) => onChange({ ...value, phone }, "phone")}
          keyboardType="phone-pad"
          autoComplete="off"
          accessibilityLabel={phoneLabel}
        />
        <FieldError>{errors.phone}</FieldError>
      </TextField>

      <View className="gap-4">
        {value.customDetails.length > 0 ? <Label>Other details</Label> : null}
        {value.customDetails.map((detail, index) => {
          const number = index + 1;
          const flagged = detailErrorRow === index;
          return (
            <View key={detail.id} className="gap-2">
              <TextField
                isInvalid={flagged && (detail.label.trim() === "" || detail.value.trim() !== "")}
              >
                <SheetInput
                  value={detail.label}
                  onChangeText={(label) => setDetail(detail.id, { label })}
                  placeholder="Referring doctor"
                  autoCapitalize="sentences"
                  autoComplete="off"
                  accessibilityLabel={`Label for detail ${number}`}
                />
              </TextField>
              <TextField isInvalid={flagged && detail.value.trim() === ""}>
                <SheetInput
                  value={detail.value}
                  onChangeText={(next) => setDetail(detail.id, { value: next })}
                  autoComplete="off"
                  accessibilityLabel={`Value for detail ${number}`}
                />
              </TextField>
              {flagged ? <GroupError message={errors.customDetails} /> : null}
              <View className="flex-row items-center justify-between gap-3">
                <ShowOnInvoice
                  name={`detail ${number}`}
                  isSelected={detail.showOnInvoice}
                  onChange={(showOnInvoice) => setDetail(detail.id, { showOnInvoice })}
                />
                <Button
                  variant="ghost"
                  className="min-h-11"
                  accessibilityLabel={`Remove detail ${number}`}
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
                  Remove
                </Button>
              </View>
            </View>
          );
        })}
        {value.customDetails.length < MAX_PATIENT_CUSTOM_DETAILS ? (
          <Button
            variant="ghost"
            className="-ml-3 min-h-11 self-start"
            onPress={() =>
              onChange(
                {
                  ...value,
                  customDetails: [
                    ...value.customDetails,
                    { id: randomUUID(), label: "", value: "", showOnInvoice: false },
                  ],
                },
                "customDetails",
              )
            }
          >
            Add detail
          </Button>
        ) : null}
      </View>
    </View>
  );
}
