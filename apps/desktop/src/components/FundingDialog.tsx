import { CircleExclamation } from "@gravity-ui/icons";
import { Button, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import {
  dayInputValue,
  fundingTypeProblem,
  parseDayInput,
  patientFundingErrors,
  type Patient,
  type PatientFunding,
} from "@kineo/shared";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { PendingButton } from "./PendingButton";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

const DATE_PLACEHOLDER = "e.g. 1 Apr 2026";

/** A label with its hint ("Required", "Optional") beside it, in the placeholder colour. */
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

/**
 * The dialog that adds a funding for a patient, or edits one (`funding`): choose a funding
 * type (fixed when editing), fill in its details and an optional period, then Save funding.
 * Recipients and detail labels are set in Settings, under Funding types.
 */
export function FundingDialog({
  patient,
  funding,
  onClose,
}: {
  patient: Patient;
  funding: PatientFunding | null;
  onClose: () => void;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const { fundingTypes } = usePracticeData();
  const types = useMemo(
    () => fundingTypes.toSorted((a, b) => a.name.localeCompare(b.name)),
    [fundingTypes],
  );
  const [typeId, setTypeId] = useState<string | null>(
    () => funding?.fundingTypeId ?? types[0]?.id ?? null,
  );
  const [values, setValues] = useState<Record<string, string>>(() => funding?.detailValues ?? {});
  const [start, setStart] = useState(() => dayInputValue(funding?.periodStart ?? null));
  const [end, setEnd] = useState(() => dayInputValue(funding?.periodEnd ?? null));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement | null>());

  const type = types.find((candidate) => candidate.id === typeId) ?? null;
  const title = `${funding ? "Edit" : "Add"} funding for ${patient.fullName}`;

  /** A link inside the dialog: closes it, then goes there. */
  const openSettings = (path: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    onClose();
    void navigate(path);
  };

  const errors = type
    ? new Map(
        patientFundingErrors({
          type,
          detailValues: values,
          periodStart: start,
          periodEnd: end,
        }).map((error) => [error.field, error.message]),
      )
    : new Map<string, string>();
  const problem = (field: string) => (showErrors ? (errors.get(field) ?? null) : null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!type) return;
    const [first] = errors.keys();
    if (first !== undefined) {
      setShowErrors(true);
      inputs.current.get(first)?.focus();
      return;
    }
    const periodStart = parseDayInput(start);
    const periodEnd = parseDayInput(end);
    if (!periodStart.ok || !periodEnd.ok) return;
    setSaving(true);
    try {
      const period = { periodStart: periodStart.value, periodEnd: periodEnd.value };
      if (funding) {
        await store.updatePatientFunding(funding.id, { detailValues: values, ...period });
      } else {
        await store.addPatientFunding({
          patientId: patient.id,
          fundingTypeId: type.id,
          detailValues: values,
          ...period,
        });
      }
      notify(funding ? "Funding saved" : "Funding added");
      onClose();
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
      setSaving(false);
    }
  }

  const recipientProblem = type ? fundingTypeProblem(type) : null;

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => (open ? undefined : onClose())}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-[520px]">
          <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-4">
            <Modal.Header>
              <Modal.Heading className="text-xl font-bold">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {type === null ? (
                <p className="text-muted">
                  You haven't made any funding types yet.{" "}
                  <a
                    href="/settings/funding-types"
                    onClick={openSettings("/settings/funding-types")}
                    className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    Open Funding types
                  </a>
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="funding-type" className="text-sm font-medium">
                      Funding type
                    </label>
                    <select
                      id="funding-type"
                      value={type.id}
                      disabled={funding !== null}
                      onChange={(event) => {
                        setTypeId(event.target.value);
                        setValues({});
                        setShowErrors(false);
                      }}
                      className="h-11 rounded-xl bg-field-background px-3 text-[15px] text-foreground disabled:opacity-60"
                    >
                      {types.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {type.details.map((detail, index) => (
                    <TextField
                      key={`${type.id}-${detail.id}`}
                      value={values[detail.id] ?? ""}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, [detail.id]: value }))
                      }
                      isInvalid={problem(detail.id) !== null}
                      isRequired={detail.showOnInvoice}
                      autoFocus={index === 0}
                    >
                      <LabelWithHint
                        label={detail.label}
                        hint={detail.showOnInvoice ? "Required" : "Optional"}
                      />
                      <Input
                        ref={(node: HTMLInputElement | null) => {
                          inputs.current.set(detail.id, node);
                        }}
                        className="h-11 text-[15px]"
                        autoComplete="off"
                        aria-label={detail.label}
                        {...(detail.kind === "date" ? { placeholder: DATE_PLACEHOLDER } : {})}
                      />
                      <Problem message={problem(detail.id)} />
                    </TextField>
                  ))}

                  <div className="grid grid-cols-2 items-start gap-3">
                    <TextField
                      value={start}
                      onChange={setStart}
                      isInvalid={problem("periodStart") !== null}
                    >
                      <LabelWithHint label="Period starts" hint="Optional" />
                      <Input
                        ref={(node: HTMLInputElement | null) => {
                          inputs.current.set("periodStart", node);
                        }}
                        className="h-11 text-[15px]"
                        placeholder={DATE_PLACEHOLDER}
                        autoComplete="off"
                        aria-label="Period starts"
                      />
                      <Problem message={problem("periodStart")} />
                    </TextField>
                    <TextField
                      value={end}
                      onChange={setEnd}
                      isInvalid={problem("periodEnd") !== null}
                    >
                      <LabelWithHint label="Period ends" hint="Optional" />
                      <Input
                        ref={(node: HTMLInputElement | null) => {
                          inputs.current.set("periodEnd", node);
                        }}
                        className="h-11 text-[15px]"
                        placeholder={DATE_PLACEHOLDER}
                        autoComplete="off"
                        aria-label="Period ends"
                      />
                      <Problem message={problem("periodEnd")} />
                    </TextField>
                  </div>

                  <div
                    aria-label="Bill to"
                    role="group"
                    className="flex flex-col gap-0.5 rounded-xl bg-field-background px-3.5 py-3 text-sm"
                  >
                    {recipientProblem === null ? (
                      <>
                        <span className="text-field-placeholder">Bill to</span>
                        <span className="text-foreground">{type.recipientName}</span>
                        <span className="text-field-placeholder">
                          {type.recipientAddress
                            .split("\n")
                            .map((line) => line.trim())
                            .filter((line) => line !== "")
                            .join(", ")}
                          . Change this in Settings.
                        </span>
                      </>
                    ) : (
                      <span className="flex items-start gap-2 text-danger">
                        <CircleExclamation
                          width={16}
                          height={16}
                          aria-hidden
                          className="mt-px flex-none"
                        />
                        <span>
                          {type.name} has no recipient yet. Add it in Settings before you send.{" "}
                          <a
                            href={`/settings/funding-types/${type.id}`}
                            onClick={openSettings(`/settings/funding-types/${type.id}`)}
                            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            Open Funding types
                          </a>
                        </span>
                      </span>
                    )}
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="h-11" onPress={onClose}>
                Cancel
              </Button>
              {type === null ? null : (
                <PendingButton
                  type="submit"
                  variant="primary"
                  className="h-11"
                  pending={saving}
                  pendingLabel="Saving…"
                >
                  Save funding
                </PendingButton>
              )}
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
