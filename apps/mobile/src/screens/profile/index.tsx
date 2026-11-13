import {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  profileErrors,
  type ProfileFieldKey,
  type ProfileFields,
} from "@kineo/shared";
import { Button, FieldError, Input, Label, Switch, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, View, type TextInputProps } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { FormSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
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
    <Screen back title="Your profile">
      <Text className="text-muted">
        Turn on "Show on invoice" for the details patients should see. Those need to be filled in.
      </Text>
      <View className="gap-5">
        {PROFILE_FIELD_KEYS.map((key) => {
          const label = PROFILE_FIELD_LABELS[key];
          const error = showErrors ? (errors.get(key) ?? null) : null;
          const shown = fields[key].showOnInvoice;
          return (
            <View key={key} className="gap-1">
              <TextField isInvalid={error !== null} isRequired={shown}>
                <Label>{label}</Label>
                <Input
                  value={fields[key].value}
                  onChangeText={(value) => update(key, { value })}
                  autoComplete="off"
                  accessibilityLabel={label}
                  {...INPUT_PROPS[key]}
                />
                <FieldError>{error}</FieldError>
              </TextField>
              {/* The whole row is the target; the switch inside only shows the state. */}
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={`Show ${label.toLowerCase()} on invoices`}
                accessibilityState={{ checked: shown }}
                onPress={() => update(key, { showOnInvoice: !shown })}
                className="min-h-11 flex-row items-center justify-between gap-3"
              >
                <Text className="text-sm text-foreground">Show on invoice</Text>
                <Switch
                  isSelected={shown}
                  onSelectedChange={(showOnInvoice) => update(key, { showOnInvoice })}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </Pressable>
            </View>
          );
        })}
        <Button className="min-h-11 self-start" isDisabled={saving} onPress={() => void save()}>
          Save profile
        </Button>
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
