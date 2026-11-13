import { Button, Label, TextArea, TextField } from "@heroui/react";
import {
  countLabel,
  formatDayMonth,
  formatEdited,
  formatLastVisit,
  formatTodayTitle,
  isNoteLocked,
  lastVisit,
  localDateString,
  noteExcerpt,
  uninvoicedVisits,
  visitOnDate,
  type InvoiceStatus,
  type Visit,
} from "@kineo/shared";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { PendingButton } from "../components/PendingButton";
import { Screen } from "../components/Screen";
import { StatusTag } from "../components/StatusTag";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";

type VisitStatus = InvoiceStatus | "uninvoiced";

/** What is being done, so only that action's button shows it. */
type Action = "save" | "edit" | "invoice";

/** Newest visit first; same-day visits by when they were created. */
function newestFirst(a: Visit, b: Visit): number {
  if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/**
 * Patient: who they are, with two columns. On the left, a note box titled with
 * today's date (Replace note, and Save note filled); on the right, every visit with its invoice status and a line of its
 * note. "Create invoice" sits at the top right.
 */
export function Patient() {
  const { patientId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { patients, visits, invoices } = usePracticeData();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const busy = action !== null;

  const patient = patients.find((candidate) => candidate.id === patientId);
  const patientVisits = useMemo(
    () => visits.filter((visit) => visit.patientId === patientId).toSorted(newestFirst),
    [visits, patientId],
  );

  if (!patient) {
    // Gone or never existed: Home is the only sensible place to go.
    return <Navigate to="/" replace />;
  }

  const today = localDateString(new Date());
  const last = lastVisit(visits, patient.id);
  const todaysVisit = visitOnDate(visits, patient.id, today);
  const toInvoice = uninvoicedVisits(patientVisits);
  const noteIsEmpty = note.trim() === "";
  const statusOf = (visit: Visit): VisitStatus =>
    visit.invoiceId === null
      ? "uninvoiced"
      : (invoices.find((invoice) => invoice.id === visit.invoiceId)?.status ?? "uninvoiced");
  const lockedFor = (visit: Visit) => {
    const status = statusOf(visit);
    return isNoteLocked(status === "uninvoiced" ? null : status);
  };
  // Replace note changes the latest visit: today's once saved, otherwise the last one.
  const latest = patientVisits[0] ?? null;
  const latestLocked = latest !== null && lockedFor(latest);
  const subtitle = [last ? formatLastVisit(last.visitDate, today) : null, patient.reasonForVisit]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  function showNoteError(caught: unknown) {
    const message = userMessage(caught);
    if (message === null) throw caught;
    setError(message);
  }

  /** Runs a note change; on success the box empties and a toast confirms it. */
  async function changeNote(change: () => Promise<unknown>, kind: Action) {
    setAction(kind);
    try {
      await change();
      setNote("");
      setError(null);
      notify("Note saved");
    } catch (caught) {
      showNoteError(caught);
    } finally {
      setAction(null);
    }
  }

  async function invoiceVisits() {
    if (!patient) return;
    setAction("invoice");
    try {
      const invoice = await store.createInvoice(
        patient.id,
        toInvoice.map((visit) => visit.id),
      );
      void navigate(`/invoices/${invoice.id}`);
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setAction(null);
    }
  }

  const noteTitle = formatTodayTitle(today, true);

  return (
    <Screen
      back
      wide
      title={patient.fullName}
      subtitle={subtitle}
      action={
        toInvoice.length > 0 ? (
          <PendingButton
            variant="secondary"
            className="h-11 px-5"
            pending={action === "invoice"}
            isDisabled={busy && action !== "invoice"}
            pendingLabel="Creating…"
            onPress={() => void invoiceVisits()}
          >
            Create invoice ({countLabel(toInvoice.length, "visit")})
          </PendingButton>
        ) : null
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-label="Today's note"
          className="flex flex-col gap-4 rounded-2xl border-2 border-transparent bg-surface p-6 shadow-surface focus-within:border-focus"
        >
          <TextField
            value={note}
            onChange={(value) => {
              setNote(value);
              if (error) setError(null);
            }}
            isInvalid={error !== null}
          >
            <Label className="text-xl font-semibold">{noteTitle}</Label>
            <TextArea rows={12} placeholder="How did today go?" className="min-h-72" />
          </TextField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[13px] text-muted">
              {todaysVisit
                ? `Saved on this device · ${formatEdited(todaysVisit.noteEditedAt).toLowerCase()}`
                : null}
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="h-11 text-accent"
                isDisabled={noteIsEmpty || busy || latest === null || latestLocked}
                onPress={() =>
                  latest ? void changeNote(() => store.replaceNote(latest.id, note), "edit") : null
                }
              >
                Replace note
              </Button>
              <PendingButton
                variant="primary"
                className="h-11 px-5"
                pending={action === "save"}
                isDisabled={busy && action !== "save"}
                pendingLabel="Saving…"
                onPress={() => void changeNote(() => store.saveVisit(patient.id, note), "save")}
              >
                Save note
              </PendingButton>
            </div>
          </div>
        </section>

        <section aria-labelledby="visits-heading" className="flex flex-col gap-3">
          <h2 id="visits-heading" className="text-base font-semibold text-muted">
            Visits
          </h2>
          {patientVisits.length === 0 ? (
            <p className="text-sm text-muted">No visits yet. Today's note will be the first.</p>
          ) : (
            <ul
              aria-label="Visits"
              className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
            >
              {patientVisits.map((visit) => {
                const locked = lockedFor(visit);
                const isToday = visit.visitDate === today;
                const date = isToday
                  ? formatTodayTitle(today)
                  : formatDayMonth(visit.visitDate, today);
                const excerpt = noteExcerpt(visit.note, 90);
                return (
                  <li
                    key={visit.id}
                    aria-label={date}
                    className="flex flex-col gap-1.5 px-4 py-3.5"
                  >
                    <div className="flex min-h-8 items-center justify-between gap-2">
                      <span className="font-semibold">
                        {date}
                        {locked ? <span className="font-normal text-muted"> · locked</span> : null}
                      </span>
                      <StatusTag status={statusOf(visit)} />
                    </div>
                    {excerpt === "" ? (
                      <p className="text-sm text-muted">No note.</p>
                    ) : (
                      <p className="line-clamp-2 text-sm">{excerpt}</p>
                    )}
                    {!isToday && !locked ? (
                      <div className="-ml-3 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          className="h-11"
                          isDisabled={noteIsEmpty || busy}
                          onPress={() =>
                            void changeNote(() => store.addToNote(visit.id, note), "edit")
                          }
                        >
                          Add to note
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-11"
                          isDisabled={noteIsEmpty || busy}
                          onPress={() =>
                            void changeNote(() => store.replaceNote(visit.id, note), "edit")
                          }
                        >
                          Replace note
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
