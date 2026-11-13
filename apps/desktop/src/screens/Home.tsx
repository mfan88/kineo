import { Gear } from "@gravity-ui/icons";
import { Button, Card, SearchField } from "@heroui/react";
import { countLabel, localDateString, recentRows, searchPatients, todoCounts } from "@kineo/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";
import type { NewPatientState } from "./NewPatient";
import { usePracticeData } from "../data/PracticeStoreProvider";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/**
 * Home: find the patient you're seeing (Recent, as list rows), then see how much is
 * waiting: visits ready to invoice and invoices waiting on payment.
 */
export function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { patients, visits, invoices } = usePracticeData();

  const today = localDateString(new Date());
  const recent = useMemo(() => recentRows(patients, visits, today), [patients, visits, today]);
  const matches = useMemo(() => searchPatients(patients, query), [patients, query]);
  const counts = useMemo(() => todoCounts(visits, invoices), [visits, invoices]);

  const searching = query.trim() !== "";
  const caughtUp = counts.readyVisits === 0 && counts.waitingInvoices === 0;

  return (
    <Screen
      eyebrow={longDate.format(new Date())}
      title="Who are you seeing?"
      action={
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Settings"
          className="-mr-2 size-11 min-w-11"
          onPress={() => void navigate("/settings")}
        >
          <Gear width={20} height={20} aria-hidden />
        </Button>
      }
    >
      <section aria-label="Patients" className="flex flex-col gap-4">
        <SearchField aria-label="Search patients" value={query} onChange={setQuery} fullWidth>
          <SearchField.Group className="h-11">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search patients" />
            <SearchField.ClearButton aria-label="Clear search" />
          </SearchField.Group>
        </SearchField>

        {searching ? (
          matches.length > 0 ? (
            <ul aria-label="Matching patients" className="flex flex-col gap-1">
              {matches.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/patients/${patient.id}`)}
                    className="flex min-h-11 w-full flex-col justify-center rounded-xl bg-surface px-4 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <span className="font-medium">{patient.fullName}</span>
                    {patient.reasonForVisit ? (
                      <span className="text-sm text-muted">{patient.reasonForVisit}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted">No patients match “{query.trim()}”.</p>
              <Button
                variant="secondary"
                className="h-11"
                onPress={() =>
                  void navigate("/patients/new", {
                    state: { name: query.trim() } satisfies NewPatientState,
                  })
                }
              >
                Add “{query.trim()}” as a new patient
              </Button>
            </div>
          )
        ) : recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-muted">Recent</h2>
            <ul
              aria-label="Recent patients"
              className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
            >
              {recent.map(({ patient, lastVisit }) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    aria-label={`${patient.fullName}, ${lastVisit}`}
                    onClick={() => void navigate(`/patients/${patient.id}`)}
                    className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <span className="font-medium">{patient.fullName}</span>
                    <span className="text-[13px] text-muted">{lastVisit}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {searching ? null : caughtUp ? (
        <Card className="items-center rounded-2xl px-6 py-10 text-center">
          <p className="font-medium">You're all caught up</p>
          <p className="text-sm text-muted">Nothing to invoice or chase right now.</p>
        </Card>
      ) : (
        <section aria-labelledby="todo-heading" className="flex flex-col gap-2 pt-4">
          <h2 id="todo-heading" className="text-[15px] font-semibold text-muted">
            To do
          </h2>
          <TodoCard label="Ready to invoice" count={countLabel(counts.readyVisits, "visit")} />
          <TodoCard
            label="Waiting on payment"
            count={countLabel(counts.waitingInvoices, "invoice")}
          />
        </section>
      )}

      {searching ? null : (
        <div>
          <Button variant="ghost" className="-ml-3 h-11" onPress={() => void navigate("/invoices")}>
            See all invoices
          </Button>
        </div>
      )}
    </Screen>
  );
}

/** A count on Home. It only reports for now; the group it counts opens in a later step. */
function TodoCard({ label, count }: { label: string; count: string }) {
  return (
    <div
      role="group"
      aria-label={`${label}, ${count}`}
      className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-surface px-4 shadow-surface"
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </div>
  );
}
