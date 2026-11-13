import { countLabel, readyPatients, recentRows, searchPatients, todoCounts } from "@kineo/shared";
import { Card, SearchField } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { openNewInvoice, openReadyToInvoice } from "@/components/open-invoice";
import { openPatient, PatientRow } from "@/components/patient-row";
import { Screen } from "@/components/screen";
import { HomeSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { localDate } from "@/utils/local-date";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/**
 * Home: find the patient you're seeing (Recent, as list rows), then see how much is
 * waiting: visits ready to invoice and invoices waiting on payment.
 */
function HomeScreen({ today = new Date() }: { today?: Date }) {
  const { patients, visits, invoices } = usePracticeData();
  const [query, setQuery] = useState("");
  const todayDate = localDate(today);
  const recent = useMemo(
    () => recentRows(patients, visits, todayDate),
    [patients, visits, todayDate],
  );
  const counts = useMemo(() => todoCounts(visits, invoices), [visits, invoices]);
  const matches = useMemo(() => searchPatients(patients, query), [patients, query]);
  const searching = query.trim() !== "";
  const caughtUp = counts.readyVisits === 0 && counts.waitingInvoices === 0;

  /** One patient waiting goes straight to their New invoice; several, to the list. */
  function openReady() {
    const ready = readyPatients(patients, visits);
    const only = ready.length === 1 ? ready[0] : undefined;
    if (only) openNewInvoice(only.patient.id);
    else openReadyToInvoice();
  }

  return (
    <Screen eyebrow={longDate.format(today)} title="Who are you seeing?">
      <SearchField value={query} onChange={setQuery}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search patients" accessibilityLabel="Search patients" />
          <SearchField.ClearButton accessibilityLabel="Clear search" />
        </SearchField.Group>
      </SearchField>

      {searching ? (
        matches.length > 0 ? (
          <View accessibilityLabel="Matching patients" className="gap-1">
            {matches.map((patient) => (
              <PatientRow key={patient.id} patient={patient} />
            ))}
          </View>
        ) : (
          <Text className="text-sm text-muted">No patients match “{query.trim()}”.</Text>
        )
      ) : (
        <>
          {recent.length > 0 ? (
            <View className="gap-2">
              <Text accessibilityRole="header" className="font-semibold text-[15px] text-muted">
                Recent
              </Text>
              <Card accessibilityLabel="Recent patients" className="px-4 py-0">
                {recent.map((row, index) => (
                  <Pressable
                    key={row.patient.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.patient.fullName}, ${row.lastVisit}`}
                    onPress={() => openPatient(row.patient.id)}
                    className={`min-h-14 flex-row items-center justify-between gap-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
                  >
                    <Text className="shrink font-medium text-foreground">
                      {row.patient.fullName}
                    </Text>
                    <Text className="text-[13px] text-muted">{row.lastVisit}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}

          {caughtUp ? (
            <Card className="items-center px-6 py-10">
              <Text className="font-medium text-foreground">You're all caught up</Text>
              <Text className="text-center text-sm text-muted">
                Nothing to invoice or chase right now.
              </Text>
            </Card>
          ) : (
            <View className="gap-2">
              <Text accessibilityRole="header" className="font-semibold text-[15px] text-muted">
                To do
              </Text>
              <TodoCard
                label="Ready to invoice"
                count={countLabel(counts.readyVisits, "visit")}
                onPress={counts.readyVisits > 0 ? openReady : undefined}
              />
              <TodoCard
                label="Waiting on payment"
                count={countLabel(counts.waitingInvoices, "invoice")}
              />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * A count on Home. With `onPress` it opens what it counts; without, it only reports
 * (nothing to open, or Waiting on payment until the grouped Invoices list).
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
  const content = (
    <>
      <Text className="text-foreground">{label}</Text>
      <Text className="font-semibold text-foreground tabular-nums">{count}</Text>
    </>
  );
  if (!onPress) {
    return (
      <Card
        accessibilityLabel={`${label}, ${count}`}
        className="min-h-14 flex-row items-center justify-between gap-3 px-4 py-3"
      >
        {content}
      </Card>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Card
          className={`min-h-14 flex-row items-center justify-between gap-3 px-4 py-3 ${pressed ? "opacity-70" : ""}`}
        >
          {content}
        </Card>
      )}
    </Pressable>
  );
}

/** Home, behind a skeleton in its shape until the practice has been read. */
export function Home({ today }: { today?: Date }) {
  return (
    <PracticeGate skeleton={(showBlocks) => <HomeSkeleton showBlocks={showBlocks} />}>
      <HomeScreen {...(today ? { today } : {})} />
    </PracticeGate>
  );
}
