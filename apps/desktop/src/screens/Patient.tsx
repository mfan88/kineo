import { Button, FieldError, Input, Label, TextArea, TextField } from "@heroui/react";
import { Plus } from "@gravity-ui/icons";
import {
  activeFundingsFor,
  countLabel,
  dayInputValue,
  endedFundingsFor,
  formatDayMonthYear,
  formatDayMonth,
  formatEdited,
  formatFundingPeriod,
  formatLastVisit,
  formatNoteTitle,
  fundingEndedOn,
  formatTodayTitle,
  isNoteLocked,
  lastVisit,
  localDateString,
  noteExcerpt,
  readVisitDateInput,
  uninvoicedVisits,
  visitOnDate,
  type InvoiceStatus,
  type PatientFunding,
  type Visit,
} from "@kineo/shared";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { FundingChip } from "../components/FundingChip";
import { FundingDialog } from "../components/FundingDialog";
import { PatientDetailsDialog } from "../components/PatientDetailsDialog";
import { VisitDateDialog } from "../components/VisitDateDialog";
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
  const { patients, visits, invoices, fundingTypes, patientFundings } = usePracticeData();
  // The funding dialog: open for a new funding (null) or to edit one.
  const [dialog, setDialog] = useState<{ funding: PatientFunding | null } | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  // The note box's visit date as typed; null while it's today (the usual case).
  const [visitDateText, setVisitDateText] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  // The visit whose date is being changed, if any.
  const [redating, setRedating] = useState<Visit | null>(null);
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

  const typedDate = visitDateText === null ? null : readVisitDateInput(visitDateText, today);
  const noteTitle = formatNoteTitle(typedDate?.ok ? typedDate.value : today, today, true);

  function saveNote() {
    if (!patient) return;
    let visitDate: string | undefined;
    if (typedDate) {
      if (!typedDate.ok) {
        setDateError(typedDate.message);
        return;
      }
      visitDate = typedDate.value;
    }
    void changeNote(async () => {
      await store.saveVisit(patient.id, note, visitDate);
      setVisitDateText(null);
    }, "save");
  }

  async function deleteVisit(visit: Visit) {
    try {
      const deleted = await store.deleteVisit(visit.id);
      notify("Visit deleted", () => {
        store.restoreVisit(deleted).catch((caught: unknown) => {
          const message = userMessage(caught);
          if (message === null) throw caught;
          notifyError(message);
        });
      });
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    }
  }

  const withType = (fundings: PatientFunding[]) =>
    fundings.flatMap((funding) => {
      const type = fundingTypes.find((candidate) => candidate.id === funding.fundingTypeId);
      return type ? [{ funding, type }] : [];
    });
  const activeFundings = withType(activeFundingsFor(patient.id, patientFundings, today));
  const endedFundings = withType(endedFundingsFor(patient.id, patientFundings, today));

  async function endFunding(funding: PatientFunding) {
    try {
      await store.endPatientFunding(funding.id);
      notify("Funding ended", () => {
        store.undoEndPatientFunding(funding.id).catch((caught: unknown) => {
          const message = userMessage(caught);
          if (message === null) throw caught;
          notifyError(message);
        });
      });
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    }
  }

  return (
    <Screen
      back
      wide
      title={patient.fullName}
      subtitle={subtitle}
      action={
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-11" onPress={() => setEditing(true)}>
            Edit details
          </Button>
          {toInvoice.length > 0 ? (
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
          ) : null}
        </div>
      }
    >
      {/* Mounted only while open, so it always starts from the saved details. */}
      {editing ? <PatientDetailsDialog patient={patient} isOpen onOpenChange={setEditing} /> : null}
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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              {visitDateText === null ? (
                <span className="flex items-center text-[13px] text-muted">
                  Visit date: today
                  <Button
                    variant="ghost"
                    className="h-11 text-accent"
                    onPress={() => setVisitDateText(dayInputValue(today))}
                  >
                    Change date
                  </Button>
                </span>
              ) : (
                <TextField
                  autoFocus
                  value={visitDateText}
                  onChange={(value) => {
                    setVisitDateText(value);
                    setDateError(null);
                  }}
                  isInvalid={dateError !== null}
                  className="w-52"
                >
                  <Label>Visit date</Label>
                  <Input className="h-11" placeholder="e.g. 11 Nov 2026" autoComplete="off" />
                  <FieldError>{dateError}</FieldError>
                </TextField>
              )}
              {todaysVisit ? (
                <span className="text-[13px] text-muted">
                  {`Saved on this device · ${formatEdited(todaysVisit.noteEditedAt).toLowerCase()}`}
                </span>
              ) : null}
            </div>
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
                onPress={saveNote}
              >
                Save note
              </PendingButton>
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="billing-heading" className="flex flex-col gap-2">
            <h2 id="billing-heading" className="text-[15px] font-semibold text-muted">
              Billing
            </h2>
            <div className="flex flex-col gap-2.5 rounded-2xl bg-surface px-5 py-4 shadow-surface">
              {activeFundings.length === 0 ? (
                <div className="flex flex-col gap-1">
                  <FundingChip variant="selfPay" label="Self-pay" />
                  <p className="text-sm text-muted">Invoices go to {patient.fullName}.</p>
                </div>
              ) : (
                activeFundings.map(({ funding, type }) => {
                  const shown = type.details
                    .filter((detail) => detail.showOnInvoice)
                    .map((detail) => ({
                      label: detail.label,
                      value: (funding.detailValues[detail.id] ?? "").trim(),
                    }))
                    .find((detail) => detail.value !== "");
                  const period = formatFundingPeriod(funding.periodStart, funding.periodEnd);
                  const goesTo = type.recipientName.trim();
                  const line = [period, goesTo === "" ? null : `invoices go to ${goesTo}`]
                    .filter((part): part is string => part !== null)
                    .join(" \u00b7 ");
                  return (
                    <div
                      key={funding.id}
                      aria-label={type.name}
                      role="group"
                      className="flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <FundingChip variant="funding" label={type.name} />
                        <div className="-mr-3 flex items-center">
                          <Button
                            variant="ghost"
                            className="h-11"
                            aria-label={`Edit ${type.name}`}
                            onPress={() => setDialog({ funding })}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-11"
                            aria-label={`End ${type.name}`}
                            onPress={() => void endFunding(funding)}
                          >
                            End funding
                          </Button>
                        </div>
                      </div>
                      {shown ? (
                        <p className="text-[15px] [overflow-wrap:anywhere]">
                          {shown.label}{" "}
                          <span className="font-semibold tabular-nums">{shown.value}</span>
                        </p>
                      ) : null}
                      {line === "" ? null : (
                        <p className="text-sm text-muted">
                          {period === null ? line.charAt(0).toUpperCase() + line.slice(1) : line}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
              {endedFundings.map(({ funding, type }) => {
                const endedOn = fundingEndedOn(funding, today);
                return (
                  <div
                    key={funding.id}
                    className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
                  >
                    <span className="text-sm text-muted">{type.name}</span>
                    <FundingChip
                      variant="ended"
                      label={endedOn ? `Ended ${formatDayMonthYear(endedOn)}` : "Ended"}
                    />
                  </div>
                );
              })}
              <div className="-mx-5 flex items-center justify-between gap-3 border-t border-separator px-5 pt-1">
                <span className="text-sm text-muted">
                  {activeFundings.length === 1
                    ? "No other funding. Self-pay applies if this one ends."
                    : activeFundings.length >= 2
                      ? "You pick who to bill on each invoice."
                      : null}
                </span>
                <Button
                  variant="ghost"
                  className="-mr-3 h-11"
                  onPress={() => setDialog({ funding: null })}
                >
                  <Plus width={16} height={16} aria-hidden />
                  Add funding
                </Button>
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
                          {locked ? (
                            <span className="font-normal text-muted"> · locked</span>
                          ) : null}
                        </span>
                        <StatusTag status={statusOf(visit)} />
                      </div>
                      {excerpt === "" ? (
                        <p className="text-sm text-muted">No note.</p>
                      ) : (
                        <p className="line-clamp-2 text-sm">{excerpt}</p>
                      )}
                      {(!isToday && !locked) || visit.invoiceId === null ? (
                        <div className="-ml-3 flex flex-wrap gap-1">
                          {!isToday && !locked ? (
                            <>
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
                            </>
                          ) : null}
                          {visit.invoiceId === null ? (
                            <>
                              <Button
                                variant="ghost"
                                className="h-11"
                                aria-label={`Change date, ${date}`}
                                isDisabled={busy}
                                onPress={() => setRedating(visit)}
                              >
                                Change date
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-11"
                                aria-label={`Delete visit, ${date}`}
                                isDisabled={busy}
                                onPress={() => void deleteVisit(visit)}
                              >
                                Delete visit
                              </Button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
      {redating ? <VisitDateDialog visit={redating} onClose={() => setRedating(null)} /> : null}
      {dialog ? (
        <FundingDialog patient={patient} funding={dialog.funding} onClose={() => setDialog(null)} />
      ) : null}
    </Screen>
  );
}
