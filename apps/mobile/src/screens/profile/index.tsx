import {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  profileErrors,
  profileFieldHint,
  type ProfileFieldKey,
  type ProfileFields,
} from "@kineo/shared";
import { FieldError, Input, Label, Switch, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, View, type TextInputProps } from "react-native";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { FormSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";

function pickFields(profile: ProfileFields): ProfileFields {
  return {
    fullName: profile.fullName,
    title: profile.title,
    clinicName: profile.clinicName,
    address: profile.address,
    phone: profile.phone,
  };
}

/** What helps typing each detail: capitals for names, the phone pad for the phone. */
const INPUT_PROPS: Record<ProfileFieldKey, TextInputProps> = {
  fullName: { autoCapitalize: "words", autoCorrect: false, textContentType: "name" },
  title: { autoCapitalize: "sentences" },
  clinicName: { autoCapitalize: "words", textContentType: "organizationName" },
  address: { autoCapitalize: "words", textContentType: "fullStreetAddress" },
  phone: { keyboardType: "phone-pad", textContentType: "telephoneNumber" },
};

/** Your profile: five details, each with whether it appears on invoices. */
function ProfileScreen() {
  const writer = usePracticeWriter();
  const { profile } = usePracticeData();
  const { toast } = useToast();
  const colors = useThemeColors();
  const [fields, setFields] = useState<ProfileFields>(() => pickFields(profile));
  const [saving, setSaving] = useState(false);
  // Errors appear after the first save attempt, then update as you type.
  const [showErrors, setShowErrors] = useState(false);

  const errors = new Map(profileErrors(fields).map((error) => [error.field, error.message]));

  function update(key: ProfileFieldKey, change: Partial<ProfileFields[ProfileFieldKey]>) {
    setFields((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  async function save() {
    if (errors.size > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      const saved = await writer.saveProfile(fields);
      setFields(pickFields(saved));
      setShowErrors(false);
      toast.show("Profile saved");
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold personal details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "Your profile couldn't be saved. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      back
      title="Your profile"
      footer={
        <PendingButton
          pending={saving}
          pendingLabel="Saving…"
          label="Save profile"
          onPress={() => void save()}
        />
      }
    >
      <Text className="text-muted">Fields shown on invoices are required.</Text>
      <View className="gap-5">
        {PROFILE_FIELD_KEYS.map((key) => {
          const label = PROFILE_FIELD_LABELS[key];
          const invalid = showErrors && errors.has(key);
          const shown = fields[key].showOnInvoice;
          return (
            <TextField key={key} isInvalid={invalid} isRequired={shown}>
              <View className="flex-row items-center justify-between gap-3">
                <Label>{label}</Label>
                {/* The whole row is the target; the switch inside only shows the state. */}
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel={`Show ${label.toLowerCase()} on invoices`}
                  accessibilityState={{ checked: shown }}
                  onPress={() => update(key, { showOnInvoice: !shown })}
                  className="min-h-11 flex-row items-center gap-3"
                >
                  <Text className="text-sm text-muted">Show on invoice</Text>
                  <Switch
                    isSelected={shown}
                    onSelectedChange={(showOnInvoice) => update(key, { showOnInvoice })}
                    // HeroUI Native draws the off track from --default, too faint on a card.
                    animation={{
                      backgroundColor: { value: [colors.controlTrack, colors.primaryStrong] },
                    }}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                </Pressable>
              </View>
              <Input
                value={fields[key].value}
                onChangeText={(value) => update(key, { value })}
                autoComplete="off"
                accessibilityLabel={label}
                {...INPUT_PROPS[key]}
              />
              <FieldError>{invalid ? profileFieldHint(key) : null}</FieldError>
            </TextField>
          );
        })}
      </View>
    </Screen>
  );
}

/** Profile, behind a skeleton in its shape until the practice has been read. */
export function Profile() {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Your profile" showBlocks={showBlocks} />}
    >
      <ProfileScreen />
    </PracticeGate>
  );
}
