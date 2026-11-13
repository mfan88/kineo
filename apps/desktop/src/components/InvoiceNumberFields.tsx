import { ArrowDown, ArrowUp } from "@gravity-ui/icons";
import {
  Button,
  FieldError,
  Input,
  Label,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  INVOICE_NUMBER_PART_LABELS,
  INVOICE_NUMBER_SEPARATOR_LABELS,
  INVOICE_NUMBER_SEPARATORS,
  invoiceNumberDigitsExample,
  invoiceNumberPartExample,
  invoiceNumberSeparatorSchema,
  MAX_INVOICE_NUMBER_DIGITS,
  MAX_INVOICE_NUMBER_PREFIX,
  MIN_INVOICE_NUMBER_DIGITS,
  moveInvoiceNumberPart,
  type InvoiceNumberFormat,
  type InvoiceNumberPart,
} from "@kineo/shared";

const DIGITS = Array.from(
  { length: MAX_INVOICE_NUMBER_DIGITS - MIN_INVOICE_NUMBER_DIGITS + 1 },
  (_, index) => MIN_INVOICE_NUMBER_DIGITS + index,
);

/**
 * Price list and tax › Invoice numbers: the parts in order (prefix, year, month and
 * number, each but the number on or off, moved up or down), the prefix text, the
 * separator, how many digits the number has, and the next invoice number.
 */
export function InvoiceNumberFields({
  format,
  onFormatChange,
  next,
  onNextChange,
  nextError,
  example,
  today,
}: {
  format: InvoiceNumberFormat;
  onFormatChange: (format: InvoiceNumberFormat) => void;
  /** The next invoice number as typed. */
  next: string;
  onNextChange: (next: string) => void;
  nextError: string | null;
  /** The next invoice's number as it will look. */
  example: string;
  /** Today (YYYY-MM-DD), for the year and month examples. */
  today: string;
}) {
  const exampleNumber = /^\d+$/.test(next) ? Number(next) : 1;
  const update = (changes: Partial<InvoiceNumberFormat>) =>
    onFormatChange({ ...format, ...changes });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span id="parts-heading" className="text-sm font-medium">
          Parts, in order
        </span>
        <ol aria-labelledby="parts-heading" className="rounded-2xl bg-surface shadow-surface">
          {format.order.map((part, index) => (
            <PartRow
              key={part}
              part={part}
              example={invoiceNumberPartExample(part, format, exampleNumber, today)}
              shown={part === "number" || format.shown[part]}
              onShownChange={
                part === "number"
                  ? null
                  : (shown) => update({ shown: { ...format.shown, [part]: shown } })
              }
              isFirst={index === 0}
              isLast={index === format.order.length - 1}
              onMove={(direction) =>
                update({ order: moveInvoiceNumberPart(format.order, part, direction) })
              }
            />
          ))}
        </ol>
      </div>

      <TextField
        value={format.prefix}
        onChange={(prefix) => update({ prefix })}
        maxLength={MAX_INVOICE_NUMBER_PREFIX}
      >
        <Label>Prefix text (optional)</Label>
        <Input className="h-11" placeholder="e.g. INV" autoComplete="off" />
      </TextField>

      <div className="flex flex-col gap-2">
        <span id="separator-heading" className="text-sm font-medium">
          Between parts
        </span>
        <ToggleButtonGroup
          aria-labelledby="separator-heading"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([format.separator === "" ? "none" : format.separator])}
          onSelectionChange={(keys) => {
            const [key] = keys;
            const parsed = invoiceNumberSeparatorSchema.safeParse(
              key === "none" ? "" : String(key),
            );
            if (parsed.success) update({ separator: parsed.data });
          }}
          className="self-start"
        >
          {INVOICE_NUMBER_SEPARATORS.map((separator) => (
            <ToggleButton
              key={separator === "" ? "none" : separator}
              id={separator === "" ? "none" : separator}
              aria-label={INVOICE_NUMBER_SEPARATOR_LABELS[separator]}
              className="min-h-11 min-w-11"
            >
              {separator === "" ? "None" : separator}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      <div className="flex flex-col gap-2">
        <span id="digits-heading" className="text-sm font-medium">
          Number length
        </span>
        <ToggleButtonGroup
          aria-labelledby="digits-heading"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([String(format.digits)])}
          onSelectionChange={(keys) => {
            const [key] = keys;
            const digits = Number(key);
            if (DIGITS.includes(digits)) update({ digits });
          }}
          className="self-start"
        >
          {DIGITS.map((digits) => (
            <ToggleButton
              key={digits}
              id={String(digits)}
              aria-label={digits === 1 ? "1 digit" : `${digits} digits`}
              className="min-h-11 min-w-11 tabular-nums"
            >
              {invoiceNumberDigitsExample(digits)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      <TextField value={next} onChange={onNextChange} isInvalid={nextError !== null}>
        <Label>Next invoice number</Label>
        <Input className="h-11 w-40" inputMode="numeric" autoComplete="off" />
        <FieldError>{nextError}</FieldError>
      </TextField>
      <p className="-mt-2 text-sm text-muted">
        To carry on from invoices you made before Kineō, enter the next number you'd use.
      </p>

      <p className="rounded-xl bg-tint px-4 py-3 text-sm text-on-tint">
        Your next invoice will be <span className="font-semibold">{example}</span>. Invoices already
        sent keep their number.
      </p>
    </div>
  );
}

function PartRow({
  part,
  example,
  shown,
  onShownChange,
  isFirst,
  isLast,
  onMove,
}: {
  part: InvoiceNumberPart;
  example: string;
  shown: boolean;
  /** Null for the number, which is always shown. */
  onShownChange: ((shown: boolean) => void) | null;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const label = INVOICE_NUMBER_PART_LABELS[part];
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-separator px-4 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={shown ? "font-medium" : "font-medium text-muted"}>{label}</span>
        <span className="truncate text-sm text-muted tabular-nums">{example}</span>
      </span>
      {onShownChange === null ? (
        <span className="text-sm text-muted">Always shown</span>
      ) : (
        <Switch
          isSelected={shown}
          onChange={onShownChange}
          aria-label={`Show ${label.toLowerCase()}`}
        >
          {/* Content is the clickable label, so the switch goes inside it. */}
          <Switch.Content className="flex flex-row items-center gap-3">
            <span className="text-sm text-muted">{shown ? "Shown" : "Off"}</span>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      )}
      <span className="flex">
        <Button
          isIconOnly
          variant="ghost"
          className="size-11"
          aria-label={`Move ${label.toLowerCase()} earlier`}
          isDisabled={isFirst}
          onPress={() => onMove(-1)}
        >
          <ArrowUp width={18} height={18} aria-hidden />
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          className="size-11"
          aria-label={`Move ${label.toLowerCase()} later`}
          isDisabled={isLast}
          onPress={() => onMove(1)}
        >
          <ArrowDown width={18} height={18} aria-hidden />
        </Button>
      </span>
    </li>
  );
}
