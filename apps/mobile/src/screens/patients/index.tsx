import { router } from "expo-router";
import { Button, SearchField } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { PatientRow } from "@/components/patient-row";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { ListSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { patientList } from "@/utils/patient-list";

function addPatient(name?: string): void {
  router.navigate(name ? { pathname: "/patient/new", params: { name } } : "/patient/new");
}

/** Patients: everyone A–Z, narrowed as you type, and the way to add someone new. */
function PatientsScreen() {
  const { patients } = usePracticeData();
  const [query, setQuery] = useState("");
  const listed = useMemo(() => patientList(patients, query), [patients, query]);
  const typed = query.trim();

  return (
    <Screen title="Patients">
      <View className="gap-4">
        <SearchField value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search patients" accessibilityLabel="Search patients" />
            <SearchField.ClearButton accessibilityLabel="Clear search" />
          </SearchField.Group>
        </SearchField>
        <Button className="min-h-11 self-start" onPress={() => addPatient()}>
          New patient
        </Button>
      </View>

      {listed.length > 0 ? (
        <View accessibilityLabel="Patients" className="gap-1">
          {listed.map((patient) => (
            <PatientRow key={patient.id} patient={patient} />
          ))}
        </View>
      ) : typed === "" ? (
        <View className="gap-1">
          <Text className="font-medium text-foreground">No patients yet</Text>
          <Text className="text-sm text-muted">Add the first person you're seeing.</Text>
        </View>
      ) : (
        <View className="items-start gap-2">
          <Text className="text-sm text-muted">No patients match “{typed}”.</Text>
          {/* A long name wraps inside the button, which grows with it. */}
          <Button
            variant="secondary"
            className="h-auto min-h-11 max-w-full py-2"
            onPress={() => addPatient(typed)}
          >
            <Button.Label className="shrink">Add “{typed}” as a new patient</Button.Label>
          </Button>
        </View>
      )}
    </Screen>
  );
}

/** Patients, behind a skeleton in its shape until the practice has been read. */
export function Patients() {
  return (
    <PracticeGate
      skeleton={(showBlocks) => (
        <ListSkeleton title="Patients" label="Loading patients" showBlocks={showBlocks} />
      )}
    >
      <PatientsScreen />
    </PracticeGate>
  );
}
