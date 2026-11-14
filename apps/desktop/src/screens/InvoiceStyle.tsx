import { Plus } from "@gravity-ui/icons";
import {
  Button,
  Dropdown,
  FieldError,
  Label,
  Radio,
  RadioGroup,
  Skeleton,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  accentColorSchema,
  headerLayoutSchema,
  type AccentColor,
  type HeaderLayout,
  type InvoiceFont,
  type InvoiceStyle as InvoiceStyleRecord,
  LOGO_TYPES,
  invoiceNumberLabel,
} from "@kineo/shared";
import { renderInvoiceHtml } from "@kineo/invoice-template";
import { invoiceAccents, invoiceFonts } from "@kineo/tokens";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PendingButton } from "../components/PendingButton";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { useLogoSrc } from "../data/useLogoSrc";
import { InvoiceFrame } from "../invoice/InvoiceFrame";
import { stylePreviewInput } from "../invoice/styleSample";

const FOOTER_LIMIT = 500;

const ACCENTS = accentColorSchema.options;
// Clean first: it's the default and the app's own font.
const FONTS = ["clean", "serif", "nunito"] as const satisfies readonly InvoiceFont[];
const LAYOUTS = headerLayoutSchema.options;
const LAYOUT_LABELS: Record<HeaderLayout, string> = {
  "logo-left": "Logo left",
  centred: "Centred",
};

interface StyleDraft {
  accentColor: AccentColor;
  font: InvoiceFont;
  headerLayout: HeaderLayout;
  footerNote: string;
  /** The chosen logo, as the store's uploadLogo returned it, or null for no logo. */
  logoPath: string | null;
  /** The chosen footer logo, the same way. */
  footerLogoPath: string | null;
  showMadeWith: boolean;
}

/** Invoice style (desktop only): how invoices look to patients. */
export function InvoiceStyle() {
  const store = useStore();
  const state = usePracticeData();
  const saved = state.invoiceStyle;
  const [draft, setDraft] = useState<StyleDraft>(() => {
    const { accentColor, font, headerLayout, footerNote, logoPath, footerLogoPath, showMadeWith } =
      saved;
    return { accentColor, font, headerLayout, footerNote, logoPath, footerLogoPath, showMadeWith };
  });
  const [saving, setSaving] = useState(false);

  const logoSrc = useLogoSrc(draft.logoPath);
  const footerLogoSrc = useLogoSrc(draft.footerLogoPath);
  const draftStyle = useMemo<InvoiceStyleRecord>(() => ({ ...saved, ...draft }), [saved, draft]);
  const previewInput = useMemo(
    () => stylePreviewInput(state, draftStyle, logoSrc, footerLogoSrc),
    [state, draftStyle, logoSrc, footerLogoSrc],
  );
  const previewHtml = useMemo(() => renderInvoiceHtml(previewInput), [previewInput]);
  const previewIsSample = state.invoices.length === 0;
  const previewNumber = invoiceNumberLabel(
    previewInput.invoice,
    state.settings.invoiceNumberFormat,
  );
  const isDirty =
    draft.accentColor !== saved.accentColor ||
    draft.font !== saved.font ||
    draft.headerLayout !== saved.headerLayout ||
    draft.footerNote.trim() !== saved.footerNote ||
    draft.logoPath !== saved.logoPath ||
    draft.footerLogoPath !== saved.footerLogoPath ||
    draft.showMadeWith !== saved.showMadeWith;

  const footerLength = draft.footerNote.trim().length;
  const footerTooLong = footerLength > FOOTER_LIMIT;

  function update(change: Partial<StyleDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (footerTooLong) return;
    setSaving(true);
    try {
      const result = await store.saveInvoiceStyle(draft);
      setDraft((current) => ({ ...current, footerNote: result.footerNote }));
      notify("Style saved");
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      back
      wide
      title="Invoice style"
      action={
        <PendingButton
          type="submit"
          form="invoice-style-form"
          variant="primary"
          className="h-11 px-5"
          isDisabled={footerTooLong}
          pending={saving}
          pendingLabel="Saving…"
        >
          Save style
        </PendingButton>
      }
    >
      <p className="text-muted">
        Choose how your invoices look. Applies to every invoice in Kineō, including ones already
        sent. PDFs you've already shared don't change.
      </p>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form
          id="invoice-style-form"
          className="flex flex-col gap-8"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <BrandingField
            paths={{ header: draft.logoPath, footer: draft.footerLogoPath }}
            srcs={{ header: logoSrc, footer: footerLogoSrc }}
            onChange={(slot, path) =>
              update(slot === "header" ? { logoPath: path } : { footerLogoPath: path })
            }
          />

          <Choice
            label="Header layout"
            value={draft.headerLayout}
            options={LAYOUTS}
            onChange={(headerLayout) => update({ headerLayout })}
          >
            {LAYOUTS.map((key) => (
              <Option key={key} value={key} label={LAYOUT_LABELS[key]}>
                <LayoutPicture layout={key} />
              </Option>
            ))}
          </Choice>

          <Choice
            label="Accent colour"
            value={draft.accentColor}
            options={ACCENTS}
            onChange={(accentColor) => update({ accentColor })}
          >
            {ACCENTS.map((key) => (
              <Option key={key} value={key} label={invoiceAccents[key].label}>
                <span
                  aria-hidden
                  className="size-8 rounded-full border border-border"
                  style={{ background: invoiceAccents[key].hex }}
                />
              </Option>
            ))}
          </Choice>

          <Choice
            label="Font"
            value={draft.font}
            options={FONTS}
            onChange={(font) => update({ font })}
          >
            {FONTS.map((key) => (
              <Option key={key} value={key} label={invoiceFonts[key].label}>
                <span
                  aria-hidden
                  className="text-2xl leading-8"
                  style={{ fontFamily: invoiceFonts[key].stack }}
                >
                  Aa
                </span>
              </Option>
            ))}
          </Choice>

          <TextField
            value={draft.footerNote}
            onChange={(footerNote) => update({ footerNote })}
            isInvalid={footerTooLong}
          >
            <Label>Footer note (optional)</Label>
            <TextArea
              rows={3}
              placeholder="e.g. Thank you. Please keep this receipt for your insurance claim."
            />
            <p
              className={`text-sm ${footerTooLong ? "text-danger" : "text-muted"}`}
              aria-live="polite"
            >
              {footerLength} of {FOOTER_LIMIT} characters
            </p>
            <FieldError>Keep the footer note to {FOOTER_LIMIT} characters or fewer.</FieldError>
          </TextField>

          <Switch
            isSelected={draft.showMadeWith}
            onChange={(showMadeWith) => update({ showMadeWith })}
          >
            {/* Content is the clickable label, so the switch goes inside it. */}
            <Switch.Content className="flex min-h-11 flex-row items-center justify-between gap-3">
              <span className="flex flex-col">
                <span>Show “Made with Kineō”</span>
                <span className="text-sm text-muted">Free to turn off during the beta.</span>
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </form>
        <section aria-label="Preview" className="flex flex-col gap-2 lg:sticky lg:top-6">
          <h2 className="text-sm text-muted">
            {previewIsSample
              ? "Preview with a sample invoice"
              : `Preview with invoice ${previewNumber}`}
            {isDirty ? " · not saved yet" : ""}
          </h2>
          <InvoiceFrame title="Invoice style preview" html={previewHtml} />
        </section>
      </div>
    </Screen>
  );
}

/** One labelled set of options; only values from `options` are ever passed on. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={(next) => {
        const chosen = options.find((option) => option === next);
        if (chosen !== undefined) onChange(chosen);
      }}
      orientation="horizontal"
      className="flex flex-col gap-3"
    >
      <Label className="font-medium">{label}</Label>
      <div className="flex flex-wrap gap-3">{children}</div>
    </RadioGroup>
  );
}

/**
 * One choice as a card: a picture (a swatch, "Aa" or a header sketch) over its name.
 * The name is the radio's accessible name; the picture is decoration.
 */
function Option({ value, label, children }: { value: string; label: string; children: ReactNode }) {
  return (
    <Radio value={value}>
      {/* Content is the clickable label, so the whole card goes inside it. */}
      <Radio.Content className="flex min-h-11 min-w-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 py-3 data-[selected=true]:border-accent data-[selected=true]:bg-accent-soft data-[focus-visible=true]:outline-2 data-[focus-visible=true]:outline-offset-2 data-[focus-visible=true]:outline-focus">
        {children}
        <span className="text-sm font-medium">{label}</span>
      </Radio.Content>
    </Radio>
  );
}

/** A small sketch of the invoice header: logo block and lines, left or centred. */
function LayoutPicture({ layout }: { layout: HeaderLayout }) {
  return (
    <svg aria-hidden width="64" height="40" viewBox="0 0 64 40" fill="none">
      {layout === "centred" ? (
        <>
          <rect x="24" y="4" width="16" height="12" rx="3" className="fill-accent" />
          <rect x="14" y="22" width="36" height="3" rx="1.5" className="fill-muted" />
          <rect x="20" y="29" width="24" height="3" rx="1.5" className="fill-muted" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="12" rx="3" className="fill-accent" />
          <rect x="34" y="6" width="26" height="3" rx="1.5" className="fill-muted" />
          <rect x="40" y="13" width="20" height="3" rx="1.5" className="fill-muted" />
          <rect x="4" y="26" width="56" height="3" rx="1.5" className="fill-muted" />
        </>
      )}
    </svg>
  );
}

type LogoSlot = "header" | "footer";
const SLOT_LABELS: Record<LogoSlot, string> = { header: "Header logo", footer: "Footer logo" };
const SLOTS = ["header", "footer"] as const satisfies readonly LogoSlot[];

/**
 * Add, preview, replace and remove the header and footer logos. A chosen image is
 * stored straight away (uploadLogo); the style points at it once saved.
 */
function BrandingField({
  paths,
  srcs,
  onChange,
}: {
  paths: Record<LogoSlot, string | null>;
  /** Each logo as an image source; null while it loads. */
  srcs: Record<LogoSlot, string | null>;
  onChange: (slot: LogoSlot, path: string | null) => void;
}) {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<LogoSlot>("header");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<LogoSlot, boolean>>({
    header: false,
    footer: false,
  });

  const free = SLOTS.filter((slot) => paths[slot] === null);
  const set = SLOTS.filter((slot) => paths[slot] !== null);
  const busy = uploading.header || uploading.footer;

  function pick(slot: LogoSlot) {
    target.current = slot;
    input.current?.click();
  }

  async function choose(slot: LogoSlot, file: File | undefined) {
    if (!file) return;
    setUploading((current) => ({ ...current, [slot]: true }));
    try {
      onChange(slot, await store.uploadLogo(file));
      setError(null);
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      setError(message);
    } finally {
      setUploading((current) => ({ ...current, [slot]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id="branding-label">
          <span className="font-medium">Branding</span>
          {set.length === 0 ? <span className="text-muted"> · No branding</span> : null}
        </span>
        {free.length > 0 ? (
          <Dropdown>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Add a logo"
              className="size-11 min-w-11"
              isPending={busy}
            >
              <Plus width={18} height={18} aria-hidden />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label="Add a logo"
                onAction={(key) => {
                  const slot = free.find((option) => option === key);
                  if (slot !== undefined) pick(slot);
                }}
              >
                {free.map((slot) => (
                  <Dropdown.Item
                    key={slot}
                    id={slot}
                    textValue={SLOT_LABELS[slot]}
                    className="min-h-11"
                  >
                    {SLOT_LABELS[slot]}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={LOGO_TYPES.join(",")}
        aria-labelledby="branding-label"
        className="sr-only"
        onChange={(event) => {
          void choose(target.current, event.currentTarget.files?.[0]);
          // Allow choosing the same file again after removing it.
          event.currentTarget.value = "";
        }}
      />
      {set.map((slot) => (
        <div key={slot} className="flex flex-wrap items-center gap-3">
          {srcs[slot] ? (
            <img
              src={srcs[slot]}
              alt={SLOT_LABELS[slot]}
              className="h-12 max-w-32 rounded-lg border border-border bg-white object-contain p-1"
            />
          ) : (
            <Skeleton className="h-12 w-32 rounded-lg" />
          )}
          <span className="font-medium">{SLOT_LABELS[slot]}</span>
          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              className="h-11"
              isPending={uploading[slot]}
              aria-label={`Replace ${SLOT_LABELS[slot].toLowerCase()}`}
              onPress={() => pick(slot)}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              className="h-11"
              isDisabled={uploading[slot]}
              aria-label={`Remove ${SLOT_LABELS[slot].toLowerCase()}`}
              onPress={() => {
                onChange(slot, null);
                setError(null);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <p className="text-sm text-muted">PNG, JPEG or SVG, up to 1 MB.</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
