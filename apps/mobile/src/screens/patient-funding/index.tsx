import {
  dayInputValue,
  fundingTypeProblem,
  parseDayInput,
  patientFundingErrors,
  type FundingType,
  type PatientFunding as PatientFundingRecord,
} from "@kineo/shared";
import { router } from "expo-router";
import {
  Button,
  FieldError,
  Input,
  Label,
  Select,
  TextField,
  useToast,
  type InputRef,
} from "heroui-native";
import { useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";

const SAVE_FAILED = "The funding couldn't be saved. Try again.";
const END_FAILED = "The funding couldn't be ended. Try again.";
const UNDO_FAILED = "The funding couldn't be restored. Try again.";
const DATE_PLACEHOLDER = "e.g. 1 Apr 2026";

/** A field's label with its hint ("Required" or "Optional") beside it, in the placeholder colour. */
function LabelWithHint({ label, hint }: { label: string; hint: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-baseline">
      <Label>{label}</Label>
      <Text className="ml-1.5 text-[13px]" style={{ color: colors.placeholder }}>
        {hint}
      </Text>
    </View>
  );
}

/**
 * Add funding, or Edit funding with a `funding`: choose a funding type (fixed when
 * editing), fill in its details and the period, then Save funding. Recipient names,
 * detail labels and types are set up in Kineō on the computer, not here.
 */
function PatientFundingScreen({
  patientId,
  fundingId,
}: {
  patientId: string;
  fundingId: string | undefined;
}) {
  const writer = usePracticeWriter();
  const { patients, fundingTypes, patientFundings } = usePracticeData();
  const { toast } = useToast();
  const colors = useThemeColors();

  const patient = patients.find((candidate) => candidate.id === patientId);
  const editing =
    fundingId === undefined
      ? null
      : (patientFundings.find((f) => f.id === fundingId && f.patientId === patientId) ?? null);

  const [typeId, setTypeId] = useState<string | null>(
    () => editing?.fundingTypeId ?? fundingTypes[0]?.id ?? null,
  );
  const [values, setValues] = useState<Record<string, string>>(() => editing?.detailValues ?? {});
  const [start, setStart] = useState(() => dayInputValue(editing?.periodStart ?? null));
  const [end, setEnd] = useState(() => dayInputValue(editing?.periodEnd ?? null));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputs = useRef<Record<string, InputRef | null>>({});

  if (!patient || (fundingId !== undefined && !editing)) {
    return (
      <Screen back title={patient ? "Funding not found" : "Patient not found"}>
        <Text className="text-muted">
          {patient
            ? "This funding isn't on this phone any more. Go back and check the patient's billing."
            : "This patient isn't on this phone any more. Go back and pick someone from Patients."}
        </Text>
      </Screen>
    );
  }

  const title = editing ? "Edit funding" : "Add funding";
  const backLabel = `Back to ${patient.fullName}`;
  const type = fundingTypes.find((candidate) => candidate.id === typeId) ?? null;

  if (!type) {
    return (
      <Screen
        back
        backLabel={backLabel}
        title={title}
        footer={
          <Button className="min-h-12 w-full" onPress={() => router.back()}>
            Go back
          </Button>
        }
      >
        <Text className="text-muted">
          You haven't made any funding types yet. Add them in Kineō on your computer, under
          Settings.
        </Text>
      </Screen>
    );
  }

  const errors = new Map(
    patientFundingErrors({ type, detailValues: values, periodStart: start, periodEnd: end }).map(
      (error) => [error.field, error.message],
    ),
  );
  const problem = fundingTypeProblem(type);

  function changeType(next: FundingType) {
    setTypeId(next.id);
    setValues({});
    setShowErrors(false);
  }

  function field(id: string): string | null {
    return showErrors ? (errors.get(id) ?? null) : null;
  }

  async function save() {
    if (!type) return;
    const found = patientFundingErrors({
      type,
      detailValues: values,
      periodStart: start,
      periodEnd: end,
    });
    if (found.length > 0) {
      setShowErrors(true);
      const first = found[0];
      if (first) inputs.current[first.field]?.focus();
      return;
    }
    const periodStart = parseDayInput(start);
    const periodEnd = parseDayInput(end);
    if (!periodStart.ok || !periodEnd.ok) return;
    setSaving(true);
    try {
      const period = { periodStart: periodStart.value, periodEnd: periodEnd.value };
      if (editing) {
        await writer.updatePatientFunding(editing.id, { detailValues: values, ...period });
      } else {
        await writer.addPatientFunding({
          patientId,
          fundingTypeId: type.id,
          detailValues: values,
          ...period,
        });
      }
      toast.show(editing ? "Funding saved" : "Funding added");
      router.back();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({ variant: "danger", label: userMessage(caught) ?? SAVE_FAILED });
      setSaving(false);
    }
  }

  async function endFunding(funding: PatientFundingRecord) {
    try {
      await writer.endPatientFunding(funding.id);
      router.back();
      // Stays until used or swiped away: it may be the only way back (design brief).
      toast.show({
        label: "Funding ended",
        duration: "persistent",
        actionLabel: "Undo",
        onActionPress: ({ hide }) => {
          hide();
          writer.undoEndPatientFunding(funding.id).catch((caught: unknown) => {
            toast.show({ variant: "danger", label: userMessage(caught) ?? UNDO_FAILED });
          });
        },
      });
    } catch (caught) {
      toast.show({ variant: "danger", label: userMessage(caught) ?? END_FAILED });
    }
  }

  return (
    <Screen
      back
      backLabel={backLabel}
      title={title}
      footer={
        <View className="gap-1">
          <PendingButton
            pending={saving}
            pendingLabel="Saving…"
            label="Save funding"
            className="min-h-12 w-full"
            onPress={() => void save()}
          />
          <Button variant="ghost" className="min-h-11 w-full" onPress={() => router.back()}>
            Cancel
          </Button>
        </View>
      }
    >
      <View className="gap-5">
        <View className="gap-1.5">
          <Label>Funding type</Label>
          <Select
            value={{ value: type.id, label: type.name }}
            onValueChange={(option) => {
              const next = fundingTypes.find((candidate) => candidate.id === option?.value);
              if (next) changeType(next);
            }}
            isDisabled={editing !== null}
          >
            <Select.Trigger accessibilityLabel={`Funding type, ${type.name}`}>
              <Select.Value placeholder="Choose a funding type" />
              <Select.TriggerIndicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="bottom-sheet" snapPoints={["40%"]}>
                {fundingTypes.map((option) => (
                  <Select.Item key={option.id} value={option.id} label={option.name}>
                    <Select.ItemLabel />
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
        </View>

        {type.details.map((detail) => (
          <TextField
            key={`${type.id}-${detail.id}`}
            isInvalid={field(detail.id) !== null}
            isRequired={detail.showOnInvoice}
          >
            <LabelWithHint
              label={detail.label}
              hint={detail.showOnInvoice ? "Required" : "Optional"}
            />
            <Input
              ref={(node: InputRef | null) => {
                inputs.current[detail.id] = node;
              }}
              value={values[detail.id] ?? ""}
              onChangeText={(value) => setValues((current) => ({ ...current, [detail.id]: value }))}
              autoComplete="off"
              autoCorrect={false}
              accessibilityLabel={detail.label}
              {...(detail.kind === "date" ? { placeholder: DATE_PLACEHOLDER } : {})}
            />
            <FieldError>{field(detail.id)}</FieldError>
          </TextField>
        ))}

        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <TextField isInvalid={field("periodStart") !== null}>
              <LabelWithHint label="Starts" hint="Optional" />
              <Input
                ref={(node: InputRef | null) => {
                  inputs.current.periodStart = node;
                }}
                value={start}
                onChangeText={setStart}
                placeholder={DATE_PLACEHOLDER}
                autoComplete="off"
                autoCorrect={false}
                accessibilityLabel="Starts"
              />
              <FieldError>{field("periodStart")}</FieldError>
            </TextField>
          </View>
          <View className="flex-1">
            <TextField isInvalid={field("periodEnd") !== null}>
              <LabelWithHint label="Ends" hint="Optional" />
              <Input
                ref={(node: InputRef | null) => {
                  inputs.current.periodEnd = node;
                }}
                value={end}
                onChangeText={setEnd}
                placeholder={DATE_PLACEHOLDER}
                autoComplete="off"
                autoCorrect={false}
                accessibilityLabel="Ends"
              />
              <FieldError>{field("periodEnd")}</FieldError>
            </TextField>
          </View>
        </View>

        <View
          accessibilityLabel="Bill to"
          className="gap-0.5 rounded-xl px-3.5 py-3"
          style={{ backgroundColor: colors.inputFill }}
        >
          {problem === null ? (
            <>
              <Text className="text-sm" style={{ color: colors.placeholder }}>
                Bill to
              </Text>
              <Text className="text-sm text-foreground">{type.recipientName}</Text>
            </>
          ) : (
            <View className="flex-row items-start gap-2">
              <Svg
                width={16}
                height={16}
                viewBox="0 0 16 16"
                fill="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ marginTop: 2 }}
              >
                <Circle cx={8} cy={8} r={6.5} stroke={colors.error} strokeWidth={1.5} />
                <Path
                  d="M8 4.5v4M8 11v.01"
                  stroke={colors.error}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </Svg>
              <Text className="shrink text-sm" style={{ color: colors.error }}>
                {type.name} has no recipient yet. Add it in Kineō on your computer before you send.
              </Text>
            </View>
          )}
        </View>

        <Text className="text-sm text-muted">
          Need a different funder? Add its type in Kineō on your computer, under Settings.
        </Text>

        {editing ? (
          <Button
            variant="ghost"
            className="min-h-11 self-start"
            onPress={() => void endFunding(editing)}
          >
            End funding
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

/** Add or Edit funding, behind a skeleton in its shape until the practice has been read. */
export function PatientFunding({
  patientId,
  fundingId,
}: {
  patientId: string;
  fundingId?: string;
}) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Add funding" showBlocks={showBlocks} />}
    >
      <PatientFundingScreen patientId={patientId} fundingId={fundingId} />
    </PracticeGate>
  );
}
