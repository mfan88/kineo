import { router } from "expo-router";
import { FieldError, Input, Label, TextField, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";

const SAVE_FAILED = "The patient couldn't be saved. Try again.";

/**
 * New patient: name and an optional reason for visit, then straight to the patient.
 * `name` is what was searched for on the Patients tab, already filled in.
 */
function NewPatientScreen({ name = "" }: { name?: string }) {
  const writer = usePracticeWriter();
  const { patients } = usePracticeData();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(() => name.trim());
  const [reason, setReason] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

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
    setSaving(true);
    try {
      const patient = await writer.addPatient({ fullName, reasonForVisit: reason });
      setAddedId(patient.id);
    } catch (error) {
      // A rule's own message is safe to show; anything else may hold patient details.
      setNameError(userMessage(error) ?? SAVE_FAILED);
      setSaving(false);
    }
  }

  return (
    <Screen back title="New patient">
      <View className="gap-5">
        <TextField isRequired isInvalid={nameError !== null}>
          <Label>Full name</Label>
          <Input
            value={fullName}
            onChangeText={(value) => {
              setFullName(value);
              if (nameError) setNameError(null);
            }}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="next"
            accessibilityLabel="Full name"
          />
          <FieldError>{nameError}</FieldError>
        </TextField>

        <TextField>
          <Label>Reason for visit (optional)</Label>
          <Input
            value={reason}
            onChangeText={setReason}
            autoComplete="off"
            returnKeyType="done"
            accessibilityLabel="Reason for visit (optional)"
          />
        </TextField>

        <PendingButton
          pending={saving}
          pendingLabel="Saving…"
          label="Add patient"
          onPress={() => void save()}
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
