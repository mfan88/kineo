import type { Patient } from "@kineo/shared";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { Text } from "./text";

/** Opens a patient's screen, on top of whichever tab you're in. */
export function openPatient(patientId: string): void {
  router.navigate({ pathname: "/patient/[id]", params: { id: patientId } });
}

/** A patient in a list: their name and reason for visit; tap to open them. */
export function PatientRow({
  patient,
}: {
  patient: Pick<Patient, "id" | "fullName" | "reasonForVisit">;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openPatient(patient.id)}
      className="min-h-11 justify-center rounded-xl bg-surface px-4 py-2 active:opacity-70"
    >
      <Text className="font-medium text-foreground">{patient.fullName}</Text>
      {patient.reasonForVisit ? (
        <Text className="text-sm text-muted">{patient.reasonForVisit}</Text>
      ) : null}
    </Pressable>
  );
}
