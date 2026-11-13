import {
  initialInvoiceGroup,
  invoiceGroupPill,
  invoiceGroups,
  type InvoiceGroupKey,
} from "@kineo/shared";
import { statusTagFor, statusTags } from "@kineo/tokens";
import { router } from "expo-router";
import { Card } from "heroui-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { StatusTag } from "@/components/status-tag";
import { openInvoice } from "@/components/open-invoice";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { ListSkeleton } from "@/components/skeletons";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { invoiceRows } from "@/utils/invoice-list";

/** What an empty group says. */
const EMPTY: Record<InvoiceGroupKey, { title: string; body: string }> = {
  notSent: { title: "Nothing to send", body: "Invoices you haven't sent yet show up here." },
  waiting: {
    title: "You're all caught up",
    body: "Sent invoices waiting on payment show up here.",
  },
  paid: { title: "No paid invoices yet", body: "Invoices you mark paid show up here." },
  cancelled: {
    title: "No cancelled invoices",
    body: "Invoices you cancel stay here as a record.",
  },
};

/**
 * Invoices in four groups, picked with pills: Not sent yet, Waiting on payment, Paid
 * and Cancelled, each with its count, newest first. The group shown is kept in the route
 * (`group`), so Home's Waiting on payment card can open that one.
 */
function InvoicesScreen({ group }: { group?: InvoiceGroupKey | undefined }) {
  const practice = usePracticeData();
  const groups = useMemo(() => invoiceGroups(practice.invoices), [practice.invoices]);
  const rows = useMemo(
    () => new Map(invoiceRows(practice).map((row) => [row.id, row])),
    [practice],
  );

  if (practice.invoices.length === 0) {
    return (
      <Screen title="Invoices">
        <Card className="items-center px-6 py-10">
          <Text className="font-medium text-foreground">No invoices yet</Text>
          <Text className="text-center text-sm text-muted">
            Invoice a patient's visits and they'll show up here.
          </Text>
        </Card>
      </Screen>
    );
  }

  const shownKey = initialInvoiceGroup(groups, group);
  const shown = groups.find((candidate) => candidate.key === shownKey);
  const shownRows = (shown?.invoices ?? []).flatMap((invoice) => rows.get(invoice.id) ?? []);

  return (
    <Screen title="Invoices">
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Invoice groups"
        className="-mt-2 flex-row flex-wrap gap-2"
      >
        {groups.map((candidate) => {
          const pill = invoiceGroupPill(candidate);
          const selected = candidate.key === shownKey;
          return (
            <Pressable
              key={candidate.key}
              accessibilityRole="tab"
              accessibilityLabel={pill.accessibilityLabel}
              accessibilityState={{ selected }}
              onPress={() => router.setParams({ group: candidate.key })}
              className={`min-h-11 justify-center rounded-full px-4 active:opacity-70 ${
                selected ? "bg-accent" : "border border-border bg-surface"
              }`}
            >
              <Text
                className={`font-medium tabular-nums ${
                  selected ? "text-accent-foreground" : "text-foreground"
                }`}
              >
                {pill.text}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {shownRows.length === 0 ? (
        <Card className="items-center px-6 py-10">
          <Text className="font-medium text-foreground">{EMPTY[shownKey].title}</Text>
          <Text className="text-center text-sm text-muted">{EMPTY[shownKey].body}</Text>
        </Card>
      ) : (
        <Card accessibilityLabel={`Invoices: ${shown?.label ?? ""}`} className="px-4 py-1">
          {shownRows.map((row, index) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`${row.number}, ${row.patientName}, ${row.total}, ${statusTags[statusTagFor(row.status)].label}`}
              onPress={() => openInvoice(row.id)}
              className={`min-h-14 flex-row items-center gap-3 py-2 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
            >
              <View className="flex-1">
                <Text className="font-medium text-foreground">{row.patientName}</Text>
                <Text className="text-sm text-muted tabular-nums">{row.number}</Text>
              </View>
              {/* Total over its tag, so a long tag never squeezes the patient's name. */}
              <View className="items-end gap-1">
                <Text className="font-medium text-foreground tabular-nums">{row.total}</Text>
                <StatusTag status={row.status} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

/** Invoices, behind a skeleton in its shape until the practice has been read. */
export function Invoices({ group }: { group?: InvoiceGroupKey | undefined }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => (
        <ListSkeleton title="Invoices" label="Loading invoices" showBlocks={showBlocks} />
      )}
    >
      <InvoicesScreen group={group} />
    </PracticeGate>
  );
}
