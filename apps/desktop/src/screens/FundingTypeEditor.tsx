import { CircleExclamation, Plus, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  FUNDING_PRESETS,
  buildInvoiceNumber,
  fundingTypeErrors,
  fundingTypeUsage,
  localDateString,
  nextInvoiceNumber,
  presetDraft,
  type FundingDetail,
  type FundingTypeDraft,
} from "@kineo/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { PendingButton } from "../components/PendingButton";
import { Screen } from "../components/Screen";
import { notify, notifyError } from "../components/Toasts";
import { userMessage } from "../components/userMessage";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";

const MAX_DETAILS = 20;
const LIST_PATH = "/settings/funding-types";

/** The hint beside a label ("Required", "Optional"), in the placeholder colour. */
function LabelWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="flex items-baseline">
      <Label>{label}</Label>
      <span className="ml-1.5 text-[13px] text-field-placeholder">{hint}</span>
    </span>
  );
}

/** A problem with a field, in the error colour with an alert icon. */
function Problem({ message }: { message: string | null }) {
  return (
    <FieldError>
      {message === null ? null : (
        <span className="inline-flex items-center gap-1">
          <CircleExclamation width={14} height={14} aria-hidden />
          {message}
        </span>
      )}
    </FieldError>
  );
}

const EMPTY: FundingTypeDraft = { name: "", recipientName: "", recipientAddress: "", details: [] };

/** Where a new type starts: a common type's starting point, or blank for an unknown key. */
function startingDraft(presetKey: string | null): FundingTypeDraft {
  const preset = FUNDING_PRESETS.find((candidate) => candidate.key === presetKey);
  return preset ? presetDraft(preset.key, () => crypto.randomUUID()) : EMPTY;
}

/**
 * Funding type editor: a type's name, recipient and the details that print on the invoice,
 * with a live preview of how they print. A new type from a common type starts filled in;
 * nothing is saved until Save funding type.
 */
export function FundingTypeEditor() {
  const store = useStore();
  const navigate = useNavigate();
  const { typeId } = useParams();
  const [search] = useSearchParams();
  const { fundingTypes, patientFundings, profile, invoices, settings } = usePracticeData();

  const existing = typeId === undefined ? null : fundingTypes.find((type) => type.id === typeId);
  const [draft, setDraft] = useState<FundingTypeDraft>(() =>
    existing
      ? {
          name: existing.name,
          recipientName: existing.recipientName,
          recipientAddress: existing.recipientAddress,
          details: existing.details,
        }
      : startingDraft(search.get("preset")),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const detailInputs = useRef(new Map<string, HTMLInputElement | null>());
  // A detail just added, whose label takes focus once it's on screen.
  const [focusDetail, setFocusDetail] = useState<string | null>(null);

  useEffect(() => {
    if (focusDetail === null) return;
    detailInputs.current.get(focusDetail)?.focus();
    setFocusDetail(null);
  }, [focusDetail]);

  if (typeId !== undefined && !existing) {
    return (
      <Screen back backLabel="Back to Funding types" title="Funding type not found">
        <p className="text-muted">
          This funding type isn't on this computer any more. Go back and pick one from the list.
        </p>
      </Screen>
    );
  }

  const errors = fundingTypeErrors(draft);
  const nameError = errors.find((error) => error.field === "name")?.message ?? null;
  const detailError = (id: string) =>
    errors.find((error) => error.field === "detail" && error.detailId === id)?.message ?? null;
  const title = draft.name.trim() === "" ? "New funding type" : draft.name.trim();
  const usage = existing
    ? fundingTypeUsage(existing.id, patientFundings, localDateString(new Date()))
    : 0;

  function updateDetail(id: string, change: Partial<FundingDetail>) {
    setDraft((current) => ({
      ...current,
      details: current.details.map((detail) =>
        detail.id === id ? { ...detail, ...change } : detail,
      ),
    }));
  }

  function addDetail() {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      details: [...current.details, { id, label: "", kind: "text", showOnInvoice: true }],
    }));
    setFocusDetail(id);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const [first] = errors;
    if (first) {
      setShowErrors(true);
      if (first.field === "name") nameInput.current?.focus();
      else detailInputs.current.get(first.detailId)?.focus();
      return;
    }
    setSaving(true);
    try {
      await store.saveFundingType({ ...draft, ...(existing ? { id: existing.id } : {}) });
      void navigate(LIST_PATH, { replace: true });
      notify("Funding type saved");
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    try {
      await store.deleteFundingType(existing.id);
      setConfirmingDelete(false);
      void navigate(LIST_PATH, { replace: true });
      notify("Funding type deleted");
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
      setConfirmingDelete(false);
      setDeleting(false);
    }
  }

  const shownDetails = draft.details.filter(
    (detail) => detail.showOnInvoice && detail.label.trim() !== "",
  );
  const usedBy = `Used by ${usage} ${usage === 1 ? "patient" : "patients"}. Move them to another type first.`;

  return (
    <Screen
      back
      backLabel="Back to Funding types"
      wide
      title={title}
      action={
        <PendingButton
          type="submit"
          form="funding-type-form"
          variant="primary"
          className="h-11 px-5"
          pending={saving}
          pendingLabel="Saving…"
        >
          Save funding type
        </PendingButton>
      }
    >
      <form
        id="funding-type-form"
        noValidate
        onSubmit={(event) => void save(event)}
        className="grid grid-cols-2 items-start gap-6"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4">
              <TextField
                value={draft.name}
                onChange={(name) => setDraft((current) => ({ ...current, name }))}
                isInvalid={showErrors && nameError !== null}
                isRequired
              >
                <Label>Type name</Label>
                <Input
                  ref={nameInput}
                  className="h-11 w-full text-[15px]"
                  autoComplete="off"
                  aria-label="Type name"
                />
                <Problem message={showErrors ? nameError : null} />
              </TextField>
              <TextField
                value={draft.recipientName}
                onChange={(recipientName) => setDraft((current) => ({ ...current, recipientName }))}
              >
                <LabelWithHint label="Recipient name" hint="Required" />
                <Input
                  className="h-11 w-full text-[15px]"
                  autoComplete="off"
                  aria-label="Recipient name"
                />
                {draft.recipientName.trim() === "" ? (
                  <span className="text-[13px] text-muted">
                    Required before you can send an invoice to this funder.
                  </span>
                ) : null}
              </TextField>
            </div>
            <TextField
              value={draft.recipientAddress}
              onChange={(recipientAddress) =>
                setDraft((current) => ({ ...current, recipientAddress }))
              }
            >
              <LabelWithHint label="Recipient address" hint="Required" />
              <TextArea rows={3} className="text-[15px]" aria-label="Recipient address" />
            </TextField>
          </div>

          <section
            aria-labelledby="details-heading"
            className="flex flex-col gap-1 rounded-2xl bg-surface px-5 pt-5 pb-2 shadow-surface"
          >
            <h2 id="details-heading" className="text-[17px] font-semibold">
              Details
            </h2>
            <p className="pb-2 text-sm text-muted">
              Details you show on the invoice must be filled in before it can be sent.
            </p>
            {draft.details.map((detail, index) => {
              const label =
                detail.label.trim() === "" ? `detail ${index + 1}` : detail.label.trim();
              const problem = detailError(detail.id);
              return (
                <div key={detail.id} className="flex flex-col gap-1 border-t border-separator py-2">
                  <div className="flex items-center gap-2">
                    <TextField
                      className="min-w-0 flex-1"
                      value={detail.label}
                      onChange={(value) => updateDetail(detail.id, { label: value })}
                      isInvalid={showErrors && problem !== null}
                    >
                      <Label className="sr-only">{`Name of detail ${index + 1}`}</Label>
                      <Input
                        ref={(node: HTMLInputElement | null) => {
                          detailInputs.current.set(detail.id, node);
                        }}
                        className="h-11 text-[15px]"
                        autoComplete="off"
                        aria-label={`Name of detail ${index + 1}`}
                      />
                    </TextField>
                    <select
                      aria-label={`Kind for ${label}`}
                      value={detail.kind}
                      onChange={(event) =>
                        updateDetail(detail.id, {
                          kind: event.target.value === "date" ? "date" : "text",
                        })
                      }
                      className="h-11 w-22 rounded-xl bg-field-background px-2 text-[15px] text-foreground"
                    >
                      <option value="text">Text</option>
                      <option value="date">Date</option>
                    </select>
                    <Switch
                      isSelected={detail.showOnInvoice}
                      onChange={(showOnInvoice) => updateDetail(detail.id, { showOnInvoice })}
                      aria-label={`Show ${label} on invoice`}
                    >
                      <Switch.Content className="flex flex-row items-center gap-3">
                        <span className="text-sm text-muted">Show on invoice</span>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                    <Button
                      isIconOnly
                      variant="ghost"
                      className="size-11 min-w-11"
                      aria-label={`Remove ${label}`}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          details: current.details.filter(
                            (candidate) => candidate.id !== detail.id,
                          ),
                        }))
                      }
                    >
                      <TrashBin width={18} height={18} aria-hidden />
                    </Button>
                  </div>
                  {showErrors && problem !== null ? (
                    <p role="alert" className="inline-flex items-center gap-1 text-sm text-danger">
                      <CircleExclamation width={14} height={14} aria-hidden />
                      {problem}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {draft.details.length >= MAX_DETAILS ? null : (
              <div className="border-t border-separator py-1">
                <Button variant="ghost" className="-ml-3 h-11" onPress={addDetail}>
                  <Plus width={16} height={16} aria-hidden />
                  Add detail
                </Button>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-muted">How it prints</h2>
          {/* The paper stays white with dark text in both modes, like the invoice itself. */}
          <div
            data-testid="paper"
            className="flex flex-col gap-4 rounded-2xl p-7 text-[13px] leading-snug"
            style={{ backgroundColor: "#FFFFFF", color: "#11181C" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-[15px] font-bold">
                  {profile.clinicName.value || "[Your clinic name]"}
                </span>
                <span style={{ color: "#52525B" }}>
                  {(profile.fullName.value || "[Your name]") +
                    (profile.title.value ? `, ${profile.title.value}` : "")}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[15px] font-bold" style={{ color: "#0369A1" }}>
                  Invoice
                </span>
                <span>
                  {buildInvoiceNumber(
                    settings.invoiceNumberFormat,
                    nextInvoiceNumber(invoices, settings.invoiceNumberStart),
                    localDateString(new Date()),
                  )}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex min-w-0 flex-col">
                <span style={{ color: "#52525B" }}>Bill to</span>
                <span className="font-bold wrap:anywhere">
                  {draft.recipientName.trim() || "[Recipient name]"}
                </span>
                {draft.recipientAddress.trim() === "" ? (
                  <span>[Recipient address]</span>
                ) : (
                  draft.recipientAddress
                    .split("\n")
                    .filter((line) => line.trim() !== "")
                    .map((line, index) => (
                      <span key={`${index}-${line}`} className="wrap:anywhere">
                        {line.trim()}
                      </span>
                    ))
                )}
              </div>
              <div className="flex min-w-0 flex-col">
                <span style={{ color: "#52525B" }}>Bill for</span>
                <span className="font-bold">[Patient name]</span>
                {shownDetails.map((detail) => (
                  <div key={detail.id} className="mt-1 flex flex-col">
                    <span style={{ color: "#52525B" }} className="wrap:anywhere">
                      {detail.label.trim()}
                    </span>
                    <span className="font-bold wrap:anywhere">{`[${detail.label.trim()}]`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-3" style={{ borderTop: "2px solid #0369A1", color: "#52525B" }}>
              Services, dates and totals appear here.
            </div>
          </div>
          <p className="text-[13px] text-muted">
            Details that are off stay in Kineō and don't print.
          </p>

          {existing ? (
            <div className="flex flex-col items-start gap-1 pt-2">
              <Button
                variant="ghost"
                className="-ml-3 h-11"
                isDisabled={usage > 0}
                {...(usage > 0 ? { "aria-describedby": "delete-hint" } : {})}
                onPress={() => setConfirmingDelete(true)}
              >
                Delete funding type
              </Button>
              {usage > 0 ? (
                <p id="delete-hint" className="text-[13px] text-muted">
                  {usedBy}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>

      <Modal.Backdrop isOpen={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{`Delete ${existing?.name ?? "this funding type"}?`}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-muted">
                Ended fundings of this type are hidden from patients. Invoices already made keep
                their details.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="h-11" onPress={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <PendingButton
                variant="danger"
                className="h-11"
                pending={deleting}
                pendingLabel="Deleting…"
                onPress={() => void remove()}
              >
                Delete funding type
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Screen>
  );
}
