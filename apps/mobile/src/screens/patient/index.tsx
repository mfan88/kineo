import {
  activeFundingsFor,
  dayInputValue,
  endedFundingsFor,
  formatDayMonth,
  formatDayMonthYear,
  formatFundingPeriod,
  fundingEndedOn,
  formatEdited,
  formatLastVisit,
  formatNoteTitle,
  formatTodayTitle,
  isNoteLocked,
  lastVisit,
  noteExcerpt,
  readVisitDateInput,
  uninvoicedVisits,
  visitItemsSummary,
  type PatientFunding,
  type Visit,
  type VisitItemDraft,
} from "@kineo/shared";
import {
  Button,
  Card,
  FieldError,
  Input,
  Label,
  TextArea,
  TextField,
  useToast,
} from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { FundingChip } from "@/components/funding-chip";
import { StatusTag } from "@/components/status-tag";
import { openPatientFunding } from "@/components/open-funding";
import { openNewInvoice } from "@/components/open-invoice";
import { PatientDetailsSheet } from "@/components/patient-details-sheet";
import { VisitDateSheet } from "@/components/visit-date-sheet";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { PatientSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { localDate } from "@/utils/local-date";
import { useThemeColors } from "@/theme/theme-colors";
import { userMessage } from "@/utils/user-message";
import { patientVisits, visitStatus } from "@/utils/visits";
import { VisitItemsPicker, VisitItemsSheet } from "./visit-items";

const SAVE_FAILED = "The note couldn't be saved. Try again.";

/** What the screen is busy doing, so only that action's button shows it. */
type Action = "save" | "edit";

/**
 * Patient: who they are, a note box titled with today's date, and every visit with
 * its invoice status. The one pinned button is Save note while there's a note to
 * save, and Create invoice (which opens New invoice) once there's nothing to save
 * and visits to invoice.
 */
function PatientScreen({ patientId, today = new Date() }: { patientId: string; today?: Date }) {
  const writer = usePracticeWriter();
  const { patients, visits, invoices, fundingTypes, patientFundings, visitItems } =
    usePracticeData();
  const colors = useThemeColors();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  // The note's visit date as typed; null while it's today (the usual case).
  const [visitDateText, setVisitDateText] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  // The visit whose date is being changed, if any.
  const [redating, setRedating] = useState<Visit | null>(null);
  // The visit whose items are being edited, if any.
  const [editingItems, setEditingItems] = useState<Visit | null>(null);
  // Items chosen for the note being written.
  const [items, setItems] = useState<VisitItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const busy = action !== null;

  const patient = patients.find((candidate) => candidate.id === patientId);
  const visitList = useMemo(() => patientVisits(visits, patientId), [visits, patientId]);

  if (!patient) {
    return (
      <Screen back title="Patient not found">
        <Text className="text-muted">
          This patient isn't on this phone any more. Go back and pick someone from Patients.
        </Text>
      </Screen>
    );
  }

  const todayDate = localDate(today);
  const noteIsEmpty = note.trim() === "";
  const last = lastVisit(visits, patient.id);
  // Add to note and Replace note change the latest visit: today's once saved, otherwise the last one.
  const latest = visitList[0] ?? null;
  const latestLocked =
    latest !== null && isNoteLocked(statusForLock(visitStatus(latest, invoices)));
  const canChangeLatest = !noteIsEmpty && !busy && latest !== null && !latestLocked;
  const toInvoice = uninvoicedVisits(visitList);
  // Each funding with its type; one whose type can't be found isn't shown.
  const withType = (fundings: PatientFunding[]) =>
    fundings.flatMap((funding) => {
      const type = fundingTypes.find((candidate) => candidate.id === funding.fundingTypeId);
      return type ? [{ funding, type }] : [];
    });
  const active = withType(activeFundingsFor(patient.id, patientFundings, todayDate));
  const ended = withType(endedFundingsFor(patient.id, patientFundings, todayDate));
  const subtitle = [
    last ? formatLastVisit(last.visitDate, todayDate) : null,
    patient.reasonForVisit,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  /** Runs a note change; on success the box empties and a toast confirms it. */
  async function saveNote(change: () => Promise<unknown>, kind: Action) {
    setAction(kind);
    try {
      await change();
      setNote("");
      setError(null);
      toast.show("Note saved");
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      setError(userMessage(caught) ?? SAVE_FAILED);
    } finally {
      setAction(null);
    }
  }

  const typedDate = visitDateText === null ? null : readVisitDateInput(visitDateText, todayDate);
  const noteTitle = formatNoteTitle(typedDate?.ok ? typedDate.value : todayDate, todayDate);

  function saveNewVisit() {
    if (!patient) return;
    let visitDate: string | undefined;
    if (typedDate) {
      if (!typedDate.ok) {
        setDateError(typedDate.message);
        return;
      }
      visitDate = typedDate.value;
    }
    void saveNote(async () => {
      await writer.saveVisit(patient.id, note, visitDate, items);
      setVisitDateText(null);
      setItems([]);
    }, "save");
  }

  async function deleteVisit(visit: Visit) {
    try {
      const deleted = await writer.deleteVisit(visit.id);
      // Stays until used or swiped away: it's the only way back (design brief).
      toast.show({
        label: "Visit deleted",
        duration: "persistent",
        actionLabel: "Undo",
        onActionPress: ({ hide }) => {
          hide();
          writer.restoreVisit(deleted).catch((caught: unknown) => {
            toast.show({
              variant: "danger",
              label: userMessage(caught) ?? "The visit couldn't be put back. Try again.",
            });
          });
        },
      });
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The visit couldn't be deleted. Try again.",
      });
    }
  }

  const footer =
    noteIsEmpty && toInvoice.length > 0 ? (
      <Button
        className="min-h-12 w-full"
        isDisabled={busy}
        onPress={() => openNewInvoice(patient.id)}
      >
        Create invoice
      </Button>
    ) : (
      <PendingButton
        pending={action === "save"}
        isDisabled={busy}
        pendingLabel="Saving…"
        label="Save note"
        className="min-h-12 w-full"
        onPress={saveNewVisit}
      />
    );

  return (
    <Screen
      back
      title={patient.fullName}
      subtitle={subtitle}
      footer={footer}
      aside={
        <Button
          variant="ghost"
          className="min-h-11"
          accessibilityLabel="Edit details"
          onPress={() => setEditing(true)}
        >
          Edit
        </Button>
      }
    >
      {editing ? <PatientDetailsSheet patient={patient} onClose={() => setEditing(false)} /> : null}
      {editingItems ? (
        <VisitItemsSheet visit={editingItems} onClose={() => setEditingItems(null)} />
      ) : null}
      {redating ? (
        <VisitDateSheet visit={redating} today={todayDate} onClose={() => setRedating(null)} />
      ) : null}
      <Card accessibilityLabel="Today's note" className="gap-3 p-4">
        <TextField isInvalid={error !== null}>
          <Label className="font-semibold text-[17px]">{noteTitle}</Label>
          <TextArea
            value={note}
            onChangeText={(value) => {
              setNote(value);
              if (error) setError(null);
            }}
            placeholder="How did today go?"
            accessibilityLabel={noteTitle}
            className="min-h-36"
          />
        </TextField>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {error}
          </Text>
        ) : null}
        {visitDateText === null ? (
          <View className="flex-row items-center">
            <Text className="text-sm text-muted">Visit date: today</Text>
            <Button
              variant="ghost"
              className="min-h-11"
              onPress={() => setVisitDateText(dayInputValue(todayDate))}
            >
              Change date
            </Button>
          </View>
        ) : (
          <TextField isInvalid={dateError !== null}>
            <Label>Visit date</Label>
            <Input
              value={visitDateText}
              onChangeText={(value) => {
                setVisitDateText(value);
                setDateError(null);
              }}
              placeholder="e.g. 11 Nov 2026"
              autoCorrect={false}
              autoComplete="off"
              accessibilityLabel="Visit date"
            />
            <FieldError>{dateError}</FieldError>
          </TextField>
        )}
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11 rounded-full"
            isDisabled={!canChangeLatest}
            onPress={() =>
              latest ? void saveNote(() => writer.addToNote(latest.id, note), "edit") : null
            }
          >
            Add to note
          </Button>
          <Button
            variant="secondary"
            className="min-h-11 rounded-full"
            isDisabled={!canChangeLatest}
            onPress={() =>
              latest ? void saveNote(() => writer.replaceNote(latest.id, note), "edit") : null
            }
          >
            Replace note
          </Button>
        </View>
        <VisitItemsPicker items={items} onChange={setItems} disabled={busy} />
      </Card>

      <Card accessibilityLabel="Billing" className="gap-2 p-4">
        <Text accessibilityRole="header" className="font-semibold text-[15px] text-muted">
          Billing
        </Text>
        {active.length === 0 ? (
          <View className="gap-1">
            <FundingChip variant="selfPay" label="Self-pay" />
            <Text className="text-sm text-muted">Invoices go to {patient.fullName}.</Text>
          </View>
        ) : (
          active.map(({ funding, type }) => {
            const shown = type.details
              .filter((detail) => detail.showOnInvoice)
              .map((detail) => ({
                label: detail.label,
                value: (funding.detailValues[detail.id] ?? "").trim(),
              }))
              .find((detail) => detail.value !== "");
            const period = formatFundingPeriod(funding.periodStart, funding.periodEnd);
            return (
              <View key={funding.id} accessibilityLabel={type.name} className="gap-1">
                <View className="flex-row items-center justify-between gap-2">
                  <FundingChip variant="funding" label={type.name} />
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    accessibilityLabel={`Edit ${type.name}`}
                    onPress={() => openPatientFunding(patient.id, funding.id)}
                  >
                    Edit
                  </Button>
                </View>
                {shown ? (
                  <Text className="text-[15px] text-foreground">
                    {shown.label}{" "}
                    <Text className="font-semibold" style={{ fontVariant: ["tabular-nums"] }}>
                      {shown.value}
                    </Text>
                  </Text>
                ) : null}
                {period ? <Text className="text-sm text-muted">{period}</Text> : null}
              </View>
            );
          })
        )}
        {ended.map(({ funding, type }) => {
          const endedOn = fundingEndedOn(funding, todayDate);
          return (
            <View
              key={funding.id}
              className="flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1"
            >
              <Text className="shrink text-sm text-muted">{type.name}</Text>
              <FundingChip
                variant="ended"
                label={endedOn ? `Ended ${formatDayMonthYear(endedOn)}` : "Ended"}
              />
            </View>
          );
        })}
        <View className="-mx-4 mt-1 border-t border-separator px-1">
          <Button
            variant="ghost"
            className="min-h-11 self-start"
            accessibilityLabel="Add funding"
            onPress={() => openPatientFunding(patient.id)}
          >
            <Svg
              width={16}
              height={16}
              viewBox="0 0 16 16"
              fill="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Path
                d="M8 3v10M3 8h10"
                stroke={colors.primaryStrong}
                strokeWidth={1.7}
                strokeLinecap="round"
              />
            </Svg>
            <Button.Label>Add funding</Button.Label>
          </Button>
        </View>
      </Card>

      <View className="gap-2">
        <Text accessibilityRole="header" className="font-semibold text-[15px] text-muted">
          Visits
        </Text>
        {visitList.length === 0 ? (
          <Text className="text-sm text-muted">No visits yet. Today's note will be the first.</Text>
        ) : (
          <Card accessibilityLabel="Visits" className="px-4 py-0">
            {visitList.map((visit, index) => {
              const status = visitStatus(visit, invoices);
              const locked = isNoteLocked(statusForLock(status));
              const isToday = visit.visitDate === todayDate;
              const date = isToday
                ? formatTodayTitle(todayDate)
                : formatDayMonth(visit.visitDate, todayDate);
              const excerpt = noteExcerpt(visit.note, 90);
              const itemsLine = visitItemsSummary(
                visitItems.filter((item) => item.visitId === visit.id),
              );
              return (
                <View
                  key={visit.id}
                  accessibilityLabel={date}
                  className={`gap-1.5 py-3 ${index > 0 ? "border-t border-separator" : ""}`}
                >
                  {/* Wraps so that at large text sizes the tag moves under the date instead of squeezing it. */}
                  <View className="min-h-8 flex-row flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <Text className={`shrink text-foreground ${isToday ? "font-semibold" : ""}`}>
                      {date}
                      {locked ? <Text className="font-normal text-muted"> · locked</Text> : null}
                    </Text>
                    <StatusTag status={status} />
                  </View>
                  {excerpt === "" ? (
                    <Text className="text-sm text-muted">No note.</Text>
                  ) : (
                    <Text numberOfLines={2} className="text-sm text-foreground">
                      {excerpt}
                    </Text>
                  )}
                  {itemsLine === "" ? null : (
                    <Text className="text-sm text-muted">{itemsLine}</Text>
                  )}
                  {isToday ? (
                    <Text className="text-xs text-muted">{formatEdited(visit.noteEditedAt)}</Text>
                  ) : null}
                  {(!isToday && !locked) || visit.invoiceId === null ? (
                    <View className="-ml-3 flex-row flex-wrap gap-1">
                      {!isToday && !locked ? (
                        <>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            isDisabled={noteIsEmpty || busy}
                            onPress={() =>
                              void saveNote(() => writer.addToNote(visit.id, note), "edit")
                            }
                          >
                            Add to note
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            isDisabled={noteIsEmpty || busy}
                            onPress={() =>
                              void saveNote(() => writer.replaceNote(visit.id, note), "edit")
                            }
                          >
                            Replace note
                          </Button>
                        </>
                      ) : null}
                      {visit.invoiceId === null ? (
                        <>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            accessibilityLabel={`Edit items, ${date}`}
                            isDisabled={busy}
                            onPress={() => setEditingItems(visit)}
                          >
                            Edit items
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            accessibilityLabel={`Change date, ${date}`}
                            isDisabled={busy}
                            onPress={() => setRedating(visit)}
                          >
                            Change date
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            accessibilityLabel={`Delete visit, ${date}`}
                            isDisabled={busy}
                            onPress={() => void deleteVisit(visit)}
                          >
                            Delete visit
                          </Button>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}

/** What the note rules take: no invoice yet, or the invoice's status. */
function statusForLock(status: ReturnType<typeof visitStatus>) {
  return status === "uninvoiced" ? null : status;
}

/** Patient, behind a skeleton in its shape until the practice has been read. */
export function Patient({ patientId, today }: { patientId: string; today?: Date }) {
  return (
    <PracticeGate skeleton={(showBlocks) => <PatientSkeleton showBlocks={showBlocks} />}>
      <PatientScreen patientId={patientId} {...(today ? { today } : {})} />
    </PracticeGate>
  );
}
