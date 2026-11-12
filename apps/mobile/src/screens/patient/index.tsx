import { isNoteLocked, lastVisit, uninvoicedVisits } from "@kineo/shared";
import { Button, Card, Chip, Label, TextArea, TextField, useToast } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { openInvoice } from "@/components/open-invoice";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import { formatVisitDate, patientVisits, visitStatus, type VisitStatus } from "@/utils/visits";

const STATUS_TAGS: Record<
  VisitStatus,
  { label: string; color: "default" | "warning" | "accent" | "success" }
> = {
  uninvoiced: { label: "Not invoiced", color: "default" },
  draft: { label: "Draft", color: "warning" },
  sent: { label: "Sent", color: "accent" },
  paid: { label: "Paid", color: "success" },
};

const SAVE_FAILED = "The note couldn't be saved. Try again.";

/** Patient: who they are, today's note, and every visit with its invoice status. */
export function Patient({ patientId }: { patientId: string }) {
  const writer = usePracticeWriter();
  const { patients, visits, invoices } = usePracticeData();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  // The editor reads the local database, so open a new invoice once it's there.
  const created =
    createdInvoiceId !== null && invoices.some((invoice) => invoice.id === createdInvoiceId);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!created || createdInvoiceId === null || opened.current === createdInvoiceId) return;
    opened.current = createdInvoiceId;
    setBusy(false);
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

  const last = lastVisit(visits, patient.id);
  const noteIsEmpty = note.trim() === "";
  const toInvoice = uninvoicedVisits(visitList);

  /** Starts a draft invoice with every visit not invoiced yet; it opens once saved. */
  async function invoiceVisits() {
    if (!patient) return;
    setBusy(true);
    try {
      const invoice = await writer.createInvoice(
        patient.id,
        toInvoice.map((visit) => visit.id),
      );
      setCreatedInvoiceId(invoice.id);
    } catch (caught) {
      setBusy(false);
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The invoice couldn't be started. Try again.",
      });
    }
  }

  /** Runs a note change; on success the box empties and a toast confirms it. */
  async function saveNote(change: () => Promise<unknown>) {
    setBusy(true);
    try {
      await change();
      setNote("");
      setError(null);
      toast.show("Note saved");
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      setError(userMessage(caught) ?? SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back title={patient.fullName} eyebrow={patient.reasonForVisit}>
      <Card accessibilityLabel="Last visit" className="gap-1 p-4">
        {last ? (
          <>
            <Text className="text-sm text-muted">
              Last visit · {formatVisitDate(last.visitDate)}
            </Text>
            <Text numberOfLines={3} className="text-foreground">
              {last.note.trim() === "" ? "No note was written." : last.note}
            </Text>
          </>
        ) : (
          <Text className="text-muted">No visits yet. Today's note will be the first.</Text>
        )}
      </Card>

      <View accessibilityLabel="Today's note" className="gap-3">
        <TextField isInvalid={error !== null}>
          <Label>Today's note</Label>
          <TextArea
            value={note}
            onChangeText={(value) => {
              setNote(value);
              if (error) setError(null);
            }}
            placeholder="How did today go?"
            accessibilityLabel="Today's note"
            className="min-h-40"
          />
        </TextField>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {error}
          </Text>
        ) : null}

        <Button
          className="min-h-11 self-start"
          isDisabled={busy}
          onPress={() => void saveNote(() => writer.saveVisit(patient.id, note))}
        >
          Save as today's visit
        </Button>
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            isDisabled={!last || last.note.trim() === ""}
            onPress={() => {
              if (last) setNote(last.note);
              setError(null);
            }}
          >
            Copy last note
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            isDisabled={note === ""}
            onPress={() => {
              setNote("");
              setError(null);
            }}
          >
            Clear
          </Button>
        </View>
      </View>

      <View className="gap-3 pt-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
            Visits
          </Text>
          {toInvoice.length > 0 ? (
            <Button
              variant="secondary"
              className="min-h-11"
              isDisabled={busy}
              onPress={() => void invoiceVisits()}
            >
              Invoice {toInvoice.length} {toInvoice.length === 1 ? "visit" : "visits"}
            </Button>
          ) : null}
        </View>
        {visitList.length === 0 ? (
          <Text className="text-sm text-muted">No visits yet.</Text>
        ) : (
          <View accessibilityLabel="Visits" className="gap-2">
            {visitList.map((visit) => {
              const status = visitStatus(visit, invoices);
              const tag = STATUS_TAGS[status];
              const locked = isNoteLocked(status === "uninvoiced" ? null : status);
              const date = formatVisitDate(visit.visitDate);
              return (
                <Card key={visit.id} accessibilityLabel={date} className="gap-2 p-4">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="shrink font-medium text-foreground">{date}</Text>
                    <Chip size="sm" variant="soft" color={tag.color}>
                      {tag.label}
                    </Chip>
                  </View>
                  {visit.note.trim() === "" ? (
                    <Text className="text-sm text-muted">No note.</Text>
                  ) : (
                    <Text className="text-sm text-foreground">{visit.note}</Text>
                  )}
                  {locked ? (
                    <Text className="text-sm text-muted">
                      This note is on a paid invoice and can't be changed.
                    </Text>
                  ) : (
                    <View className="-ml-3 flex-row flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        isDisabled={noteIsEmpty || busy}
                        onPress={() => void saveNote(() => writer.addToNote(visit.id, note))}
                      >
                        Add to note
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        isDisabled={noteIsEmpty || busy}
                        onPress={() => void saveNote(() => writer.replaceNote(visit.id, note))}
                      >
                        Replace note
                      </Button>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
