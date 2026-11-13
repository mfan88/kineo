import { invoiceFontFaceCss, renderInvoiceHtml } from "@kineo/invoice-template";
import { formatInvoiceNumber, sendProblems } from "@kineo/shared";
import { router } from "expo-router";
import { Button, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { PendingButton } from "@/components/pending-button";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { INVOICE_FONT_SOURCES } from "@/invoice/fonts.generated";
import { useLogo } from "@/invoice/logo-context";
import { FormSkeleton } from "@/components/skeletons";
import {
  PracticeGate,
  useInvoicePending,
  usePracticeData,
  usePracticeWriter,
} from "@/data/practice-data";
import { pdfFileName, previewHtml } from "@/utils/invoice-preview";
import { sharePdf, ShareUnavailableError } from "@/utils/share-pdf";
import { userMessage } from "@/utils/user-message";

/** The invoice fonts, embedded so the PDF matches desktop's (see scripts/invoice-fonts.mts). */
const FONT_FACE_CSS = invoiceFontFaceCss(INVOICE_FONT_SOURCES);

/** Your profile, in the Settings tab, where an empty field shown on invoices is filled in. */
function openProfile(): void {
  router.navigate("/profile");
}

/**
 * Invoice preview: exactly what the patient receives, and the place to send it.
 * Anything stopping a draft from going out shows above it in one alert (with a link
 * to Your profile when a field there is missing). Share PDF is the one primary
 * action; Mark as sent records that it went out.
 */
function InvoicePreviewScreen({ invoiceId }: { invoiceId: string }) {
  const writer = usePracticeWriter();
  const { invoices, patients, visits, lineItems, profile, settings, invoiceStyle } =
    usePracticeData();
  const { toast } = useToast();
  // Until it reaches the server, its number may still change (another device used it).
  const pending = useInvoicePending(invoiceId);
  // What is being done, so only that button shows it: sending or preparing the PDF.
  const [busy, setBusy] = useState<"send" | "share" | null>(null);
  const logo = useLogo(invoiceStyle.logoPath);
  const logoSrc = logo.status === "ready" ? logo.src : null;

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
      logoSrc,
      fontFaceCss: FONT_FACE_CSS,
    });
  }, [invoice, lineItems, patients, visits, profile, settings, invoiceStyle, logoSrc]);

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
  const blocked = problems.length > 0;

  async function send() {
    if (!invoice) return;
    setBusy("send");
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
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
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
      setBusy(null);
    }
  }

  const footer = (
    <View className="gap-1">
      <PendingButton
        pending={busy === "share"}
        pendingLabel="Preparing PDF…"
        label="Share PDF"
        className="min-h-12 w-full"
        // A PDF goes to the patient: not while the draft can't be sent, nor before
        // the logo is on the page.
        isDisabled={blocked || logo.status === "loading" || busy !== null}
        onPress={() => void share()}
      />
      {invoice.status === "draft" ? (
        <PendingButton
          variant="ghost"
          pending={busy === "send"}
          pendingLabel="Sending…"
          label="Mark as sent"
          className="min-h-11 w-full"
          isDisabled={blocked || busy !== null}
          onPress={() => void send()}
        />
      ) : null}
    </View>
  );

  return (
    <Screen back title="Preview" eyebrow={`Invoice ${number}`} footer={footer}>
      {invoice.status === "draft" ? null : (
        <Text className="-mt-4 text-sm text-muted">
          {invoice.status === "paid"
            ? "This invoice has been paid."
            : "This invoice has been sent."}
        </Text>
      )}

      {logo.status === "failed" ? (
        <Text className="text-muted">
          {logo.message} Until then, invoices show your name without it.
        </Text>
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

      {blocked ? (
        <View accessibilityRole="alert" className="gap-2 rounded-xl bg-danger-soft px-4 py-3">
          {problems.map((problem) => (
            <View key={problem.message} className="gap-1">
              <Text className="text-sm text-danger">{problem.message}</Text>
              {problem.inProfile ? (
                <Button variant="ghost" className="-ml-3 min-h-11 self-start" onPress={openProfile}>
                  <Button.Label className="font-semibold text-danger">
                    Open Your profile
                  </Button.Label>
                </Button>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

/** InvoicePreview, behind a skeleton in its shape until the practice has been read. */
export function InvoicePreview({ invoiceId }: { invoiceId: string }) {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Preview" showBlocks={showBlocks} />}
    >
      <InvoicePreviewScreen invoiceId={invoiceId} />
    </PracticeGate>
  );
}
