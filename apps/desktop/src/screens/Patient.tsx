import { Button, Label, TextArea, TextField } from "@heroui/react";
import { NoteRuleError, lastVisit } from "@kineo/shared";
import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { Screen } from "../components/Screen";
import { notify } from "../components/Toasts";
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

/** Patient: who they are, how the last visit went, and today's note. */
export function Patient() {
  const { patientId = "" } = useParams();
  const store = useStore();
  const { patients, visits } = useDemoState();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const patient = patients.find((candidate) => candidate.id === patientId);
  if (!patient) {
    // Gone or never existed: Home is the only sensible place to go.
    return <Navigate to="/" replace />;
  }

  const last = lastVisit(visits, patient.id);

  function save() {
    if (!patient) return;
    try {
      store.saveVisit(patient.id, note);
      setNote("");
      setError(null);
      notify("Note saved");
    } catch (caught) {
      if (caught instanceof NoteRuleError) {
        setError(caught.message);
        return;
      }
      throw caught;
    }
  }

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
    </Screen>
  );
}
