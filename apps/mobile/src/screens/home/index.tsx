import { searchPatients } from "@kineo/shared";
import { router } from "expo-router";
import { Button, Card, Chip, SearchField } from "heroui-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { openInvoice } from "@/components/open-invoice";
import { openPatient, PatientRow } from "@/components/patient-row";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { HomeSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { homeSummary, type HomeRow } from "@/utils/home-summary";

const longDate = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Opens the Invoices tab. */
function openInvoices(): void {
  router.navigate("/(invoices)");
}

/**
 * Home: find the patient you're seeing, then see what needs invoicing or chasing.
 * Patients and invoices open their screens; "See all" opens the Invoices tab.
 */
function HomeScreen({ today = new Date() }: { today?: Date }) {
  const practice = usePracticeData();
  const [query, setQuery] = useState("");
  const summary = useMemo(() => homeSummary(practice), [practice]);
  const matches = useMemo(
    () => searchPatients(practice.patients, query),
    [practice.patients, query],
  );
  const searching = query.trim() !== "";

  return (
    <Screen eyebrow={longDate.format(today)} title="Who are you seeing?">
      <View className="gap-4">
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
        ) : summary.recentPatients.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm text-muted">Recent patients</Text>
            <View accessibilityLabel="Recent patients" className="flex-row flex-wrap gap-2">
              {summary.recentPatients.map((patient) => (
                <Chip
                  key={patient.id}
                  variant="soft"
                  color="accent"
                  className="min-h-11"
                  accessibilityRole="button"
                  onPress={() => openPatient(patient.id)}
                >
                  {patient.fullName}
                </Chip>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View className="gap-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
            Invoices
          </Text>
          <Button variant="ghost" className="-mr-3 min-h-11" onPress={openInvoices}>
            See all
          </Button>
        </View>
        {summary.allCaughtUp ? (
          <Card className="items-center px-6 py-10">
            <Text className="font-medium text-foreground">You're all caught up</Text>
            <Text className="text-center text-sm text-muted">
              Nothing to invoice, send or chase right now.
            </Text>
          </Card>
        ) : (
          <View className="gap-4">
            {/* A row in the first group is a patient; in the others, an invoice. */}
            <Group title="Ready to invoice" rows={summary.readyToInvoice} onOpen={openPatient} />
            <Group title="Not sent yet" rows={summary.notSentYet} onOpen={openInvoice} />
            <Group
              title="Waiting on payment"
              rows={summary.waitingOnPayment}
              onOpen={openInvoice}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

function Group({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: HomeRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <Card accessibilityLabel={title} className="gap-2 p-4">
      <View className="flex-row items-center gap-2">
        <Text accessibilityRole="header" className="font-medium text-foreground">
          {title}
        </Text>
        <Chip size="sm" variant="soft" color={rows.length > 0 ? "accent" : "default"}>
          {String(rows.length)}
        </Chip>
      </View>
      {rows.length > 0 ? (
        <View>
          {rows.map((row, index) => (
            <Row key={row.id} row={row} divider={index > 0} onOpen={() => onOpen(row.id)} />
          ))}
        </View>
      ) : (
        <Text className="text-sm text-muted">Nothing here.</Text>
      )}
    </Card>
  );
}

function Row({
  row,
  divider,
  onOpen,
}: {
  row: HomeRow;
  divider: boolean;
  onOpen: () => void;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      className={`min-h-11 flex-row items-center gap-3 py-2 active:opacity-70 ${divider ? "border-t border-separator" : ""}`}
    >
      <View className="flex-1">
        <Text className="font-medium text-foreground">{row.title}</Text>
        <Text className="text-sm text-muted">{row.detail}</Text>
      </View>
      {row.amount ? (
        <Text className="font-medium text-foreground tabular-nums">{row.amount}</Text>
      ) : null}
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
