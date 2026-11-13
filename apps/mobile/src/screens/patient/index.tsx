import {
  formatDayMonth,
  formatEdited,
  formatLastVisit,
  formatTodayTitle,
  isNoteLocked,
  lastVisit,
  noteExcerpt,
  uninvoicedVisits,
  visitOnDate,
} from "@kineo/shared";
import { Button, Card, Label, TextArea, TextField, useToast } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StatusTag } from "@/components/status-tag";
import { openInvoice } from "@/components/open-invoice";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { PatientSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { localDate } from "@/utils/local-date";
import { userMessage } from "@/utils/user-message";
import { patientVisits, visitStatus } from "@/utils/visits";

const SAVE_FAILED = "The note couldn't be saved. Try again.";

/** What the screen is busy doing, so only that action's button shows it. */
type Action = "save" | "edit" | "invoice";

/**
 * Patient: who they are, a note box titled with today's date, and every visit with
 * its invoice status. The one pinned button is Save note while there's a note to
 * save, and Create invoice once there's nothing to save and visits to invoice.
 */
function PatientScreen({ patientId, today = new Date() }: { patientId: string; today?: Date }) {
  const writer = usePracticeWriter();
  const { patients, visits, invoices } = usePracticeData();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const busy = action !== null;

  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  // The editor reads the local database, so open a new invoice once it's there.
  const created =
    createdInvoiceId !== null && invoices.some((invoice) => invoice.id === createdInvoiceId);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!created || createdInvoiceId === null || opened.current === createdInvoiceId) return;
    opened.current = createdInvoiceId;
    setAction(null);
    openInvoice(createdInvoiceId);
  }, [created, createdInvoiceId]);

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
  const last = lastVisit(visits, patient.id);
  const todaysVisit = visitOnDate(visits, patient.id, todayDate);
  const todaysLocked =
    todaysVisit !== null && isNoteLocked(statusForLock(visitStatus(todaysVisit, invoices)));
  const noteIsEmpty = note.trim() === "";
  const toInvoice = uninvoicedVisits(visitList);
  const subtitle = [
    last ? formatLastVisit(last.visitDate, todayDate) : null,
    patient.reasonForVisit,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  /** Starts a draft invoice with every visit not invoiced yet; it opens once saved. */
  async function invoiceVisits() {
    if (!patient) return;
    setAction("invoice");
    try {
      const invoice = await writer.createInvoice(
        patient.id,
        toInvoice.map((visit) => visit.id),
      );
      setCreatedInvoiceId(invoice.id);
    } catch (caught) {
      setAction(null);
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The invoice couldn't be started. Try again.",
      });
    }
  }

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

  const footer =
    noteIsEmpty && toInvoice.length > 0 ? (
      <PendingButton
        pending={action === "invoice"}
        isDisabled={busy}
        pendingLabel="Creating…"
        label="Create invoice"
        className="min-h-12 w-full"
        onPress={() => void invoiceVisits()}
      />
    ) : todaysVisit === null ? (
      <PendingButton
        pending={action === "save"}
        isDisabled={busy}
        pendingLabel="Saving…"
        label="Save note"
        className="min-h-12 w-full"
        onPress={() => void saveNote(() => writer.saveVisit(patient.id, note), "save")}
      />
    ) : null;

  return (
    <Screen back title={patient.fullName} subtitle={subtitle} footer={footer}>
      <Card accessibilityLabel="Today's note" className="gap-3 p-4">
        {todaysLocked ? (
          <>
            <Text className="font-semibold text-[17px] text-foreground">
              {formatTodayTitle(todayDate)}
            </Text>
            <Text className="text-muted">
              Today's note is on a paid invoice and can't be changed.
            </Text>
          </>
        ) : (
          <>
            <TextField isInvalid={error !== null}>
              <Label className="font-semibold text-[17px]">{formatTodayTitle(todayDate)}</Label>
              <TextArea
                value={note}
                onChangeText={(value) => {
                  setNote(value);
                  if (error) setError(null);
                }}
                placeholder="How did today go?"
                accessibilityLabel={formatTodayTitle(todayDate)}
                className="min-h-36"
              />
            </TextField>
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {error}
              </Text>
            ) : null}
            {todaysVisit !== null ? (
              <View className="flex-row flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="min-h-11 rounded-full"
                  isDisabled={noteIsEmpty || busy}
                  onPress={() =>
                    void saveNote(() => writer.addToNote(todaysVisit.id, note), "edit")
                  }
                >
                  Add to note
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-11 rounded-full"
                  isDisabled={noteIsEmpty || busy}
                  onPress={() =>
                    void saveNote(() => writer.replaceNote(todaysVisit.id, note), "edit")
                  }
                >
                  Replace note
                </Button>
              </View>
            ) : null}
          </>
        )}
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
              return (
                <View
                  key={visit.id}
                  accessibilityLabel={date}
                  className={`gap-1.5 py-3 ${index > 0 ? "border-t border-separator" : ""}`}
                >
                  <View className="min-h-8 flex-row items-center justify-between gap-2">
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
                  {isToday ? (
                    <Text className="text-xs text-muted">{formatEdited(visit.noteEditedAt)}</Text>
                  ) : null}
                  {!isToday && !locked ? (
                    <View className="-ml-3 flex-row flex-wrap gap-1">
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
