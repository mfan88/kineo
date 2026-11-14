import {
  countLabel,
  profileErrors,
  readyPatients,
  recentRows,
  searchPatients,
  todoCounts,
} from "@kineo/shared";
import { router } from "expo-router";
import { Button, Card, SearchField } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { openInvoiceGroup, openNewInvoice, openReadyToInvoice } from "@/components/open-invoice";
import { openPatient, PatientRow } from "@/components/patient-row";
import { Screen } from "@/components/screen";
import { HomeSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { useThemeColors } from "@/theme/theme-colors";
import { localDate } from "@/utils/local-date";

function addPatient(name?: string): void {
  router.navigate(name ? { pathname: "/patient/new", params: { name } } : "/patient/new");
}

/** Shown when nobody has been added yet: what to do first, and what an invoice will need. */
function NoPatients({
  missing,
}: {
  missing: { label: string; href: "/profile" | "/price-list" }[];
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityLabel="No patients yet" className="flex-1 items-center justify-center gap-2">
      <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Circle cx={12} cy={8} r={4} stroke={colors.mutedText} strokeWidth={2} />
        <Path
          d="M4 21c1-4 4-6 8-6s7 2 8 6"
          stroke={colors.mutedText}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
      <Text className="font-medium text-foreground">No patients yet</Text>
      <Text className="text-center text-sm text-muted">
        Add your first patient to start a note.
      </Text>
      {missing.length > 0 ? (
        <View className="flex-row flex-wrap items-center justify-center">
          <Text className="text-sm text-muted">Before you send an invoice: </Text>
          {missing.map((item, index) => (
            <View key={item.href} className="flex-row items-center">
              {index > 0 ? <Text className="text-sm text-muted"> · </Text> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={item.label}
                onPress={() => router.navigate(item.href)}
                className="min-h-11 justify-center active:opacity-70"
              >
                <Text className="text-sm text-link underline">{item.label}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

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
  const { patients, visits, invoices, profile, priceItems } = usePracticeData();
  const colors = useThemeColors();
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

  if (patients.length === 0) {
    const missing: { label: string; href: "/profile" | "/price-list" }[] = [];
    if (profileErrors(profile).length > 0) {
      missing.push({ label: "Fill in your profile", href: "/profile" });
    }
    if (priceItems.length === 0) {
      missing.push({ label: "Add a price list item", href: "/price-list" });
    }
    return (
      <Screen
        eyebrow={longDate.format(today)}
        title="Who are you seeing?"
        footer={
          <Button className="min-h-12 w-full" onPress={() => addPatient()}>
            Add patient
          </Button>
        }
      >
        <NoPatients missing={missing} />
      </Screen>
    );
  }

  return (
    <Screen eyebrow={longDate.format(today)} title="Who are you seeing?">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SearchField value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search patients"
                accessibilityLabel="Search patients"
              />
              <SearchField.ClearButton accessibilityLabel="Clear search" />
            </SearchField.Group>
          </SearchField>
        </View>
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel="Add patient"
          className="size-11"
          onPress={() => addPatient()}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path d="M12 5v14M5 12h14" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Button>
      </View>

      {searching ? (
        matches.length > 0 ? (
          <View accessibilityLabel="Matching patients" className="gap-1">
            {matches.map((patient) => (
              <PatientRow key={patient.id} patient={patient} />
            ))}
          </View>
        ) : (
          <View className="items-start gap-2">
            <Text className="text-sm text-muted">No patients match “{query.trim()}”.</Text>
            {/* A long name wraps inside the button, which grows with it. */}
            <Button
              variant="ghost"
              className="h-auto min-h-11 max-w-full py-2"
              onPress={() => addPatient(query.trim())}
            >
              <Button.Label className="shrink">Add “{query.trim()}” as a new patient</Button.Label>
            </Button>
          </View>
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
                    className={`min-h-14 flex-row items-center justify-between gap-3 py-2 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
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
                onPress={() => openInvoiceGroup("waiting")}
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
  const content = (
    <>
      {/* The label wraps at large text sizes; the count never does, so it isn't cut off. */}
      <Text className="shrink text-foreground">{label}</Text>
      <Text className="shrink-0 font-semibold text-foreground tabular-nums">{count}</Text>
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
