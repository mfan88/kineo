import { Gear } from "@gravity-ui/icons";
import { Button, Card, Chip, SearchField } from "@heroui/react";
import {
  formatCad,
  formatInvoiceNumber,
  homeGroups,
  invoiceTotals,
  recentPatients,
  searchPatients,
  type Invoice,
  type Patient,
} from "@kineo/shared";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";
import { demoInvoices, demoLineItems, demoPatients, demoSettings, demoVisits } from "../data/demo";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const shortDate = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

/** Formats a YYYY-MM-DD visit date as a calendar date, without time zone shifts. */
function formatVisitDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return shortDate.format(new Date(year, month - 1, day));
}

interface InvoiceRow {
  id: string;
  number: string;
  patientName: string;
  total: string;
  detail: string;
}

/** Home: find the patient you're seeing, then see what needs invoicing or chasing. */
export function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const patientsById = useMemo(
    () => new Map<string, Patient>(demoPatients.map((patient) => [patient.id, patient])),
    [],
  );
  const recent = useMemo(() => recentPatients(demoPatients, demoVisits), []);
  const matches = useMemo(() => searchPatients(demoPatients, query), [query]);
  const groups = useMemo(() => homeGroups(demoVisits, demoInvoices), []);

  function toRow(invoice: Invoice, detail: string): InvoiceRow {
    const lines = demoLineItems.filter((lineItem) => lineItem.invoiceId === invoice.id);
    return {
      id: invoice.id,
      number: formatInvoiceNumber(demoSettings.invoiceNumberPrefix, invoice.number),
      patientName: patientsById.get(invoice.patientId)?.fullName ?? "Unknown patient",
      total: formatCad(invoiceTotals(lines, invoice).totalCents),
      detail,
    };
  }

  const searching = query.trim() !== "";

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
                <li
                  key={patient.id}
                  className="flex min-h-11 flex-col justify-center rounded-xl bg-surface px-4 py-2"
                >
                  <span className="font-medium">{patient.fullName}</span>
                  {patient.reasonForVisit ? (
                    <span className="text-sm text-muted">{patient.reasonForVisit}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No patients match “{query.trim()}”.</p>
          )
        ) : recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm text-muted">Recent patients</h2>
            <ul aria-label="Recent patients" className="flex flex-wrap gap-2">
              {recent.map((patient) => (
                <li key={patient.id}>
                  <Chip variant="soft" color="accent" className="min-h-9 px-3">
                    {patient.fullName}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-4 pt-4">
        <h2 id="invoices-heading" className="text-lg font-semibold">
          Invoices
        </h2>

        {groups.allCaughtUp ? (
          <Card className="items-center rounded-2xl px-6 py-10 text-center">
            <p className="font-medium">You're all caught up</p>
            <p className="text-sm text-muted">Nothing to invoice, send or chase right now.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <Group title="Ready to invoice" count={groups.readyToInvoice.length}>
              {groups.readyToInvoice.map((group) => {
                const visits = group.visitIds.length;
                const dates =
                  group.oldestVisitDate === group.latestVisitDate
                    ? formatVisitDate(group.oldestVisitDate)
                    : `${formatVisitDate(group.oldestVisitDate)} – ${formatVisitDate(group.latestVisitDate)}`;
                return (
                  <Row
                    key={group.patientId}
                    title={patientsById.get(group.patientId)?.fullName ?? "Unknown patient"}
                    detail={`${visits} ${visits === 1 ? "visit" : "visits"} · ${dates}`}
                  />
                );
              })}
            </Group>

            <Group title="Not sent yet" count={groups.notSentYet.length}>
              {groups.notSentYet.map((invoice) => {
                const row = toRow(invoice, "Draft");
                return (
                  <Row
                    key={row.id}
                    title={row.patientName}
                    detail={`${row.number} · ${row.detail}`}
                    amount={row.total}
                  />
                );
              })}
            </Group>

            <Group title="Waiting on payment" count={groups.waitingOnPayment.length}>
              {groups.waitingOnPayment.map((invoice) => {
                const sent = invoice.sentAt
                  ? `Sent ${shortDate.format(new Date(invoice.sentAt))}`
                  : "Sent";
                const row = toRow(invoice, sent);
                return (
                  <Row
                    key={row.id}
                    title={row.patientName}
                    detail={`${row.number} · ${row.detail}`}
                    amount={row.total}
                  />
                );
              })}
            </Group>
          </div>
        )}
      </section>
    </Screen>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Card className="gap-2 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">{title}</h3>
        <Chip size="sm" variant="soft" color={count > 0 ? "accent" : "default"}>
          {count}
        </Chip>
      </div>
      {count > 0 ? (
        <ul className="flex flex-col divide-y divide-separator">{children}</ul>
      ) : (
        <p className="text-sm text-muted">Nothing here right now.</p>
      )}
    </Card>
  );
}

function Row({ title, detail, amount }: { title: string; detail: string; amount?: string }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-4 py-2">
      <div className="flex flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted">{detail}</span>
      </div>
      {amount ? <span className="font-medium tabular-nums">{amount}</span> : null}
    </li>
  );
}
