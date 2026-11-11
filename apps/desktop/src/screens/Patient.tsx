import { Button, Chip, Label, TextArea, TextField } from "@heroui/react";
import {
  InvoiceRuleError,
  NoteRuleError,
  isNoteLocked,
  lastVisit,
  uninvoicedVisits,
  type InvoiceStatus,
  type Visit,
} from "@kineo/shared";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { useDemoState, useStore } from "../data/DemoStoreProvider";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Formats a YYYY-MM-DD visit date as a calendar date, without time zone shifts. */
function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return longDate.format(new Date(year, month - 1, day));
}

type VisitStatus = InvoiceStatus | "uninvoiced";

const STATUS_TAGS: Record<
  VisitStatus,
  { label: string; color: "default" | "warning" | "accent" | "success" }
> = {
  uninvoiced: { label: "Not invoiced", color: "default" },
  draft: { label: "Draft", color: "warning" },
  sent: { label: "Sent", color: "accent" },
  paid: { label: "Paid", color: "success" },
};

/** Newest visit first; same-day visits by when they were created. */
function newestFirst(a: Visit, b: Visit): number {
  if (a.visitDate !== b.visitDate) return a.visitDate < b.visitDate ? 1 : -1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Patient: who they are, today's note, and every visit with its invoice status. */
export function Patient() {
  const { patientId = "" } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const { patients, visits, invoices } = useDemoState();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const patient = patients.find((candidate) => candidate.id === patientId);
  const patientVisits = useMemo(
    () => visits.filter((visit) => visit.patientId === patientId).toSorted(newestFirst),
    [visits, patientId],
  );

  if (!patient) {
    // Gone or never existed: Home is the only sensible place to go.
    return <Navigate to="/" replace />;
  }

  const last = lastVisit(visits, patient.id);
  const toInvoice = uninvoicedVisits(patientVisits);
  const statusOf = (visit: Visit): VisitStatus =>
    visit.invoiceId === null
      ? "uninvoiced"
      : (invoices.find((invoice) => invoice.id === visit.invoiceId)?.status ?? "uninvoiced");

  function showNoteError(caught: unknown) {
    if (caught instanceof NoteRuleError) {
      setError(caught.message);
      return;
    }
    throw caught;
  }

  function save() {
    if (!patient) return;
    try {
      store.saveVisit(patient.id, note);
      setNote("");
      setError(null);
      notify("Note saved");
    } catch (caught) {
      showNoteError(caught);
    }
  }

  function applyToVisit(visitId: string, mode: "add" | "replace") {
    try {
      if (mode === "add") store.addToNote(visitId, note);
      else store.replaceNote(visitId, note);
      setNote("");
      setError(null);
      notify("Note saved");
    } catch (caught) {
      showNoteError(caught);
    }
  }

  function invoiceVisits() {
    if (!patient) return;
    try {
      const invoice = store.createInvoice(
        patient.id,
        toInvoice.map((visit) => visit.id),
      );
      void navigate(`/invoices/${invoice.id}`);
    } catch (caught) {
      if (caught instanceof InvoiceRuleError) {
        notifyError(caught.message);
        return;
      }
      throw caught;
    }
  }

  const noteIsEmpty = note.trim() === "";

  return (
    <Screen back title={patient.fullName} eyebrow={patient.reasonForVisit}>
      <section aria-label="Last visit" className="rounded-2xl bg-surface p-4 shadow-surface">
        {last ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-sm text-muted">Last visit · {formatVisitDate(last.visitDate)}</h2>
            <p className="line-clamp-3 whitespace-pre-line">
              {last.note.trim() === "" ? "No note was written." : last.note}
            </p>
          </div>
        ) : (
          <p className="text-muted">No visits yet. Today's note will be the first.</p>
        )}
      </section>

      <section aria-label="Today's note" className="flex flex-col gap-3">
        <TextField
          value={note}
          onChange={(value) => {
            setNote(value);
            if (error) setError(null);
          }}
          isInvalid={error !== null}
        >
          <Label>Today's note</Label>
          <TextArea rows={8} placeholder="How did today go?" className="min-h-40" />
        </TextField>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="h-11 px-5" onPress={save}>
            Save as today's visit
          </Button>
          <Button
            variant="secondary"
            className="h-11"
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
            className="h-11"
            isDisabled={note === ""}
            onPress={() => {
              setNote("");
              setError(null);
            }}
          >
            Clear
          </Button>
        </div>
      </section>

      <section aria-labelledby="visits-heading" className="flex flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="visits-heading" className="text-lg font-semibold">
            Visits
          </h2>
          {toInvoice.length > 0 ? (
            <Button variant="secondary" className="h-11" onPress={invoiceVisits}>
              Invoice {toInvoice.length} {toInvoice.length === 1 ? "visit" : "visits"}
            </Button>
          ) : null}
        </div>

        {patientVisits.length === 0 ? (
          <p className="text-sm text-muted">No visits yet.</p>
        ) : (
          <ul aria-label="Visits" className="flex flex-col gap-2">
            {patientVisits.map((visit) => {
              const status = statusOf(visit);
              const tag = STATUS_TAGS[status];
              const locked = isNoteLocked(status === "uninvoiced" ? null : status);
              const date = formatVisitDate(visit.visitDate);
              return (
                <li
                  key={visit.id}
                  aria-label={date}
                  className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-surface"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{date}</span>
                    <Chip size="sm" variant="soft" color={tag.color}>
                      {tag.label}
                    </Chip>
                  </div>
                  <p className="whitespace-pre-line text-sm">
                    {visit.note.trim() === "" ? (
                      <span className="text-muted">No note.</span>
                    ) : (
                      visit.note
                    )}
                  </p>
                  {locked ? (
                    <p className="text-sm text-muted">
                      This note is on a paid invoice and can't be changed.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        className="h-11"
                        isDisabled={noteIsEmpty}
                        onPress={() => applyToVisit(visit.id, "add")}
                      >
                        Add to note
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11"
                        isDisabled={noteIsEmpty}
                        onPress={() => applyToVisit(visit.id, "replace")}
                      >
                        Replace note
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Screen>
  );
}
