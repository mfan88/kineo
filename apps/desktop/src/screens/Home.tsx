import { Person } from "@gravity-ui/icons";
import { Button, Card, SearchField } from "@heroui/react";
import {
  countLabel,
  localDateString,
  profileErrors,
  readyPatients,
  recentRows,
  searchPatients,
  todoCounts,
} from "@kineo/shared";
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
  const { patients, visits, invoices, profile, priceItems } = usePracticeData();

  const today = localDateString(new Date());
  const recent = useMemo(() => recentRows(patients, visits, today), [patients, visits, today]);
  const matches = useMemo(() => searchPatients(patients, query), [patients, query]);
  const counts = useMemo(() => todoCounts(visits, invoices), [visits, invoices]);

  const searching = query.trim() !== "";
  const noPatients = patients.length === 0;
  const caughtUp = counts.readyVisits === 0 && counts.waitingInvoices === 0;

  /** One patient waiting opens their page; several, the Ready to invoice list. */
  function openReady() {
    const ready = readyPatients(patients, visits);
    const only = ready.length === 1 ? ready[0] : undefined;
    void navigate(only ? `/patients/${only.patient.id}` : "/ready-to-invoice");
  }

  function addPatient() {
    void navigate("/patients/new");
  }

  const missingBeforeSending = [
    ...(profileErrors(profile).length > 0
      ? [{ label: "Fill in your profile", path: "/settings/profile" }]
      : []),
    ...(priceItems.length === 0
      ? [{ label: "Add a price list item", path: "/settings/price-list" }]
      : []),
  ];

  return (
    <Screen eyebrow={longDate.format(new Date())} title="Who are you seeing?">
      <section aria-label="Patients" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <SearchField aria-label="Search patients" value={query} onChange={setQuery} fullWidth>
            <SearchField.Group className="h-11">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search patients" />
              <SearchField.ClearButton aria-label="Clear search" />
            </SearchField.Group>
          </SearchField>
          {noPatients ? null : (
            <Button variant="ghost" className="h-11 flex-none" onPress={addPatient}>
              Add patient
            </Button>
          )}
        </div>

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

      {searching ? null : noPatients ? (
        <section
          aria-label="No patients yet"
          className="flex flex-col items-center gap-4 px-6 py-10 text-center"
        >
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground"
          >
            <Person width={20} height={20} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">No patients yet</h2>
            <p className="text-sm text-muted">Add your first patient to start a note.</p>
          </div>
          <Button variant="primary" className="h-11" onPress={addPatient}>
            Add patient
          </Button>
          {missingBeforeSending.length > 0 ? (
            <p className="text-sm text-muted">
              Before you send an invoice:{" "}
              {missingBeforeSending.map(({ label, path }, index) => (
                <span key={path}>
                  {index > 0 ? " · " : null}
                  <button
                    type="button"
                    onClick={() => void navigate(path)}
                    className="font-medium text-link underline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {label}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : caughtUp ? (
        <Card className="items-center rounded-2xl px-6 py-10 text-center">
          <p className="font-medium">You're all caught up</p>
          <p className="text-sm text-muted">Nothing to invoice or chase right now.</p>
        </Card>
      ) : (
        <section aria-labelledby="todo-heading" className="flex flex-col gap-2 pt-4">
          <h2 id="todo-heading" className="text-[15px] font-semibold text-muted">
            To do
          </h2>
          <TodoCard
            label="Ready to invoice"
            count={countLabel(counts.readyVisits, "visit")}
            onPress={counts.readyVisits > 0 ? openReady : undefined}
          />
          <TodoCard
            label="Waiting on payment"
            count={countLabel(counts.waitingInvoices, "invoice")}
            onPress={
              counts.waitingInvoices > 0
                ? () => void navigate("/invoices?group=waiting")
                : undefined
            }
          />
        </section>
      )}
    </Screen>
  );
}

/**
 * A count on Home. With `onPress` it opens what it counts; without, it only reports
 * (Ready to invoice with nothing to invoice).
 */
function TodoCard({
  label,
  count,
  onPress,
}: {
  label: string;
  count: string;
  onPress?: (() => void) | undefined;
}) {
  const className =
    "flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl bg-surface px-4 text-left shadow-surface";
  const content = (
    <>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </>
  );
  if (!onPress) {
    return (
      <div role="group" aria-label={`${label}, ${count}`} className={className}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${label}, ${count}`}
      onClick={onPress}
      className={`${className} hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus`}
    >
      {content}
    </button>
  );
}
