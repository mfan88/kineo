import { renderInvoiceHtml } from "@kineo/invoice-template";
import { formatInvoiceNumber } from "@kineo/shared";
import { router } from "expo-router";
import { Button, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { useInvoicePending, usePracticeData, usePracticeWriter } from "@/data/practice-data";
import { pdfFileName, previewHtml, sendProblems } from "@/utils/invoice-preview";
import { sharePdf, ShareUnavailableError } from "@/utils/share-pdf";
import { userMessage } from "@/utils/user-message";

/** Invoice preview: exactly what the patient receives, and the place to send it. */
export function InvoicePreview({ invoiceId }: { invoiceId: string }) {
  const writer = usePracticeWriter();
  const { invoices, patients, visits, lineItems, profile, settings, invoiceStyle } =
    usePracticeData();
  const { toast } = useToast();
  // Until it reaches the server, its number may still change (another device used it).
  const pending = useInvoicePending(invoiceId);
  const [busy, setBusy] = useState(false);

  const invoice = invoices.find((candidate) => candidate.id === invoiceId);

  const html = useMemo(() => {
    if (!invoice) return "";
    return renderInvoiceHtml({
      invoice,
      lines: lineItems.filter((line) => line.invoiceId === invoice.id),
      patient: patients.find((candidate) => candidate.id === invoice.patientId) ?? null,
      visits: visits.filter((visit) => visit.invoiceId === invoice.id),
      profile,
      settings,
      style: invoiceStyle,
    });
  }, [invoice, lineItems, patients, visits, profile, settings, invoiceStyle]);

  if (!invoice) {
    return (
      <Screen back title="Invoice not found">
        <Text className="text-muted">
          This invoice isn't on this phone any more. Go back and pick one from Invoices.
        </Text>
      </Screen>
    );
  }

  const number = formatInvoiceNumber(settings.invoiceNumberPrefix, invoice.number);
  const lineCount = lineItems.filter((line) => line.invoiceId === invoice.id).length;
  const problems = sendProblems({ invoice, lineCount, profile, pending });

  async function send() {
    if (!invoice) return;
    setBusy(true);
    try {
      await writer.sendInvoice(invoice.id);
      toast.show("Invoice sent");
      // Back to the editor, which now shows it as sent.
      if (router.canGoBack()) router.back();
    } catch (caught) {
      // A rule's own message is safe to show; anything else may hold patient details.
      toast.show({
        variant: "danger",
        label: userMessage(caught) ?? "The invoice couldn't be marked as sent. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      await sharePdf(html, pdfFileName(number));
    } catch (caught) {
      toast.show({
        variant: "danger",
        label:
          caught instanceof ShareUnavailableError
            ? caught.message
            : "The PDF couldn't be made. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back title="Preview" eyebrow={`Invoice ${number}`}>
      {problems.length > 0 ? (
        <View accessibilityRole="alert" className="gap-1 rounded-2xl bg-danger-soft p-4">
          {problems.map((problem) => (
            <Text key={problem} className="text-danger">
              {problem}
            </Text>
          ))}
        </View>
      ) : null}

      {/* A letter page, scaled to the width of the screen. No scripts: it's only shown. */}
      <View
        accessibilityLabel={`Invoice ${number} as the patient sees it`}
        className="aspect-[17/22] w-full overflow-hidden rounded-2xl bg-white shadow-surface"
      >
        <WebView
          originWhitelist={["*"]}
          source={{ html: previewHtml(html) }}
          javaScriptEnabled={false}
          scrollEnabled={false}
          style={{ flex: 1, backgroundColor: "transparent" }}
        />
      </View>

      <View className="gap-3">
        {invoice.status === "draft" ? (
          <Button
            className="min-h-11 self-start"
            isDisabled={problems.length > 0 || busy}
            onPress={() => void send()}
          >
            Mark as sent
          </Button>
        ) : (
          <Text className="text-muted">
            {invoice.status === "paid"
              ? "This invoice has been paid."
              : "This invoice has been sent."}
          </Text>
        )}
        <Button
          variant="secondary"
          className="min-h-11 self-start"
          // A PDF goes to the patient, so not before the number is final.
          isDisabled={(invoice.status === "draft" && pending) || busy}
          onPress={() => void share()}
        >
          Share PDF
        </Button>
      </View>
    </Screen>
  );
}
