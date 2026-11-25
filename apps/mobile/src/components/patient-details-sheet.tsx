import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { patientDetailsErrors, type Patient, type PatientDetailsErrors } from "@kineo/shared";
import { BottomSheet, Button, FieldError, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Keyboard, View } from "react-native";
import { Text } from "@/components/text";
import { usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import {
  PatientInfoFields,
  patientInfoOf,
  withoutError,
  type PatientInfo,
} from "./patient-info-fields";
import { PendingButton } from "./pending-button";
import { SheetInput } from "./sheet-input";

/**
 * Edit details on a patient: Cancel, "Edit details", Full name, Reason for visit,
 * their information, and Save details pinned at the bottom. Draft invoices take the
 * new name and shown details; sent ones keep theirs. Patients added before email
 * and phone were needed can leave them blank. Mount it only while it's open, so it
 * starts from the saved details.
 */
export function PatientDetailsSheet({
  patient,
  onClose,
}: {
  patient: Patient;
  onClose: () => void;
}) {
  const writer = usePracticeWriter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(patient.fullName);
  const [reason, setReason] = useState(patient.reasonForVisit ?? "");
  const [info, setInfo] = useState<PatientInfo>(() => patientInfoOf(patient));
  const [errors, setErrors] = useState<PatientDetailsErrors>({});
  const [saving, setSaving] = useState(false);

  function close() {
    // Closing by Cancel, a tap outside or a swipe down leaves the keyboard up otherwise.
    Keyboard.dismiss();
    onClose();
  }

  async function save() {
    if (saving) return;
    const input = { fullName, reasonForVisit: reason, ...info };
    const problems = patientDetailsErrors(input, { required: patient.detailsRequired });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      await writer.updatePatient(patient.id, input);
      toast.show("Patient updated");
      close();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "Those details couldn't be saved. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        {/* A fixed height, so the form scrolls inside the sheet with the button pinned. */}
        <BottomSheet.Content
          snapPoints={["90%"]}
          enableOverDrag={false}
          enableDynamicSizing={false}
          contentContainerClassName="h-full"
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
        >
          <View className="flex-1 gap-4 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <Button variant="ghost" className="-ml-3 min-h-11" onPress={close}>
                Cancel
              </Button>
              <BottomSheet.Title>Edit details</BottomSheet.Title>
              {/* Keeps the title in the middle. */}
              <View className="w-16" />
            </View>
            {/* gorhom's scroll view isn't styled by Uniwind classes, so it takes styles. */}
            <BottomSheetScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 20, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              <TextField isInvalid={errors.fullName !== undefined}>
                <Label>Full name</Label>
                <SheetInput
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setErrors((current) => withoutError(current, "fullName"));
                  }}
                  autoCapitalize="words"
                  autoComplete="off"
                  accessibilityLabel="Full name"
                />
                <FieldError>{errors.fullName}</FieldError>
              </TextField>
              <TextField>
                <Label>Reason for visit (optional)</Label>
                <SheetInput
                  value={reason}
                  onChangeText={setReason}
                  autoCapitalize="sentences"
                  autoComplete="off"
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
                required={patient.detailsRequired}
              />
              <Text className="text-sm text-muted">
                Invoices not sent yet show the new details. Sent invoices keep the ones they were
                sent with.
              </Text>
            </BottomSheetScrollView>
            <PendingButton
              pending={saving}
              pendingLabel="Saving…"
              label="Save details"
              className="min-h-12 w-full"
              onPress={() => void save()}
            />
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
