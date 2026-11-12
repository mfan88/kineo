import { Button, FieldError, Label, Radio, RadioGroup, TextArea, TextField } from "@heroui/react";
import {
  accentColorSchema,
  headerLayoutSchema,
  type AccentColor,
  type HeaderLayout,
  type InvoiceFont,
} from "@kineo/shared";
import { invoiceAccents, invoiceFonts } from "@kineo/tokens";
import { useState, type FormEvent, type ReactNode } from "react";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { useStore } from "../data/DemoStoreProvider";
import { StoreError } from "../data/store";

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
}

/** Invoice style (desktop only): how invoices look to patients. */
export function InvoiceStyle() {
  const store = useStore();
  const [draft, setDraft] = useState<StyleDraft>(() => {
    const { accentColor, font, headerLayout, footerNote } = store.getState().invoiceStyle;
    return { accentColor, font, headerLayout, footerNote };
  });

  const footerLength = draft.footerNote.trim().length;
  const footerTooLong = footerLength > FOOTER_LIMIT;

  function update(change: Partial<StyleDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (footerTooLong) return;
    try {
      const saved = store.saveInvoiceStyle({
        ...draft,
        logoPath: store.getState().invoiceStyle.logoPath,
      });
      setDraft((current) => ({ ...current, footerNote: saved.footerNote }));
      notify("Style saved");
    } catch (caught) {
      if (caught instanceof StoreError) {
        notifyError(caught.message);
        return;
      }
      throw caught;
    }
  }

  return (
    <Screen back title="Invoice style">
      <p className="text-muted">
        Choose how your invoices look. Patients see this on every invoice.
      </p>
      <form className="flex max-w-xl flex-col gap-8" onSubmit={save} noValidate>
        <Choice
          label="Accent colour"
          value={draft.accentColor}
          options={ACCENTS}
          onChange={(accentColor) => update({ accentColor })}
        >
          {ACCENTS.map((key) => (
            <Option key={key} value={key}>
              <span
                aria-hidden
                className="size-5 rounded-full"
                style={{ background: invoiceAccents[key].hex }}
              />
              {invoiceAccents[key].label}
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
            <Option key={key} value={key}>
              <span style={{ fontFamily: invoiceFonts[key].stack }}>{invoiceFonts[key].label}</span>
            </Option>
          ))}
        </Choice>

        <Choice
          label="Header layout"
          value={draft.headerLayout}
          options={LAYOUTS}
          onChange={(headerLayout) => update({ headerLayout })}
        >
          {LAYOUTS.map((key) => (
            <Option key={key} value={key}>
              {LAYOUT_LABELS[key]}
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

        <div>
          <Button type="submit" variant="primary" className="h-11 px-5" isDisabled={footerTooLong}>
            Save style
          </Button>
        </div>
      </form>
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
      <div className="flex flex-wrap gap-2">{children}</div>
    </RadioGroup>
  );
}

function Option({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Radio
      value={value}
      className="flex min-h-11 flex-row items-center gap-2 rounded-full border border-border bg-surface px-4 data-[selected=true]:border-accent data-[selected=true]:bg-accent-soft"
    >
      <Radio.Control>
        <Radio.Indicator />
      </Radio.Control>
      <Radio.Content className="flex flex-row items-center gap-2">{children}</Radio.Content>
    </Radio>
  );
}
