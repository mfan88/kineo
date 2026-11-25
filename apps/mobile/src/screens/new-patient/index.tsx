import { patientDetailsErrors, type PatientDetailsErrors } from "@kineo/shared";
import { router } from "expo-router";
import { FieldError, Input, type InputRef, Label, TextField, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  PatientInfoFields,
  emptyPatientInfo,
  withoutError,
  type PatientInfo,
} from "@/components/patient-info-fields";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";

const SAVE_FAILED = "The patient couldn't be saved. Try again.";

/**
 * New patient: name, an optional reason for visit and their information (email and
 * phone are needed, a child's parents too), then straight to the patient.
 * `name` is what was searched for on the Patients tab, already filled in.
 */
function NewPatientScreen({ name = "" }: { name?: string }) {
  const writer = usePracticeWriter();
  const { patients } = usePracticeData();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(() => name.trim());
  const [reason, setReason] = useState("");
  const [info, setInfo] = useState<PatientInfo>(emptyPatientInfo);
  const [errors, setErrors] = useState<PatientDetailsErrors>({});
  const [saving, setSaving] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const reasonRef = useRef<InputRef>(null);

  // The patient's screen reads the local database, so open it once they're there.
  // Once only: showing a toast re-renders this screen.
  const added = addedId !== null && patients.some((patient) => patient.id === addedId);
  const opened = useRef(false);
  useEffect(() => {
    if (!added || addedId === null || opened.current) return;
    opened.current = true;
    toast.show("Patient added");
    router.replace({ pathname: "/patient/[id]", params: { id: addedId } });
  }, [added, addedId, toast]);

  async function save() {
    if (saving) return;
    const input = { fullName, reasonForVisit: reason, ...info };
    const problems = patientDetailsErrors(input, { required: true });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      const patient = await writer.addPatient(input);
      setAddedId(patient.id);
    } catch (error) {
      // A rule's own message is safe to show; anything else may hold patient details.
      setErrors({ fullName: userMessage(error) ?? SAVE_FAILED });
      setSaving(false);
    }
  }

  return (
    <Screen
      back
      title="New patient"
      footer={
        <PendingButton
          pending={saving}
          pendingLabel="Saving…"
          label="Add patient"
          className="min-h-12 w-full"
          onPress={() => void save()}
        />
      }
    >
      <View className="gap-5">
        <TextField isRequired isInvalid={errors.fullName !== undefined}>
          <Label>Full name</Label>
          <Input
            value={fullName}
            onChangeText={(value) => {
              setFullName(value);
              setErrors((current) => withoutError(current, "fullName"));
            }}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="next"
            onSubmitEditing={() => reasonRef.current?.focus()}
            accessibilityLabel="Full name"
          />
          <FieldError>{errors.fullName}</FieldError>
        </TextField>

        <TextField>
          <Label>Reason for visit (optional)</Label>
          <Input
            ref={reasonRef}
            value={reason}
            onChangeText={setReason}
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            accessibilityLabel="Reason for visit (optional)"
          />
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
      </View>
    </Screen>
  );
}

/** NewPatient, behind a skeleton in its shape until the practice has been read. */
export function NewPatient({ name = "" }: { name?: string }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="New patient" showBlocks={showBlocks} />}
    >
      <NewPatientScreen name={name} />
    </PracticeGate>
  );
}
