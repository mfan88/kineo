import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePracticeData } from "@/data/practice-data";

/** A patient: their name and what they're being seen for. */
export function Patient({ patientId }: { patientId: string }) {
  const { patients } = usePracticeData();
  const patient = patients.find((candidate) => candidate.id === patientId);

  if (!patient) {
    return (
      <Screen back title="Patient not found">
        <Text className="text-muted">
          This patient isn't on this phone any more. Go back and pick someone from Patients.
        </Text>
      </Screen>
    );
  }

  return <Screen back title={patient.fullName} eyebrow={patient.reasonForVisit} />;
}
