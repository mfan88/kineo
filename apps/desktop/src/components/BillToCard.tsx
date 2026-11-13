import { CircleExclamation } from "@gravity-ui/icons";
import { Button, FieldError, Input, Label, Popover, TextArea, TextField } from "@heroui/react";
import {
  billToOptions,
  localDateString,
  parseDayInput,
  resolvedBillTo,
  type BillToOption,
  type BillToProblem,
  type Invoice,
  type Patient,
} from "@kineo/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { usePracticeData, useStore } from "../data/PracticeStoreProvider";
import { FundingChip } from "./FundingChip";
import { notify, notifyError } from "./Toasts";
import { userMessage } from "./userMessage";

const DATE_MESSAGE = "Enter a date like 1 Apr 2026.";

/** An error in the error colour with an alert icon. */
function Problem({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className="inline-flex items-center gap-1 text-sm text-danger">
      <CircleExclamation width={16} height={16} aria-hidden className="flex-none" />
      {message}
    </p>
  );
}

/** Runs a store change, showing a refused one as an error toast. */
function attempt(change: () => Promise<unknown>): void {
  change().catch((caught: unknown) => {
    const message = userMessage(caught);
    if (message === null) throw caught;
    notifyError(message);
  });
}

/**
 * Who a draft invoice is billed to. A funded invoice shows the funding, the recipient and
 * each detail to fill in (saved on leaving the field); a self-pay one shows the patient and
 * their address. "Change" opens the choices in a popover. Anything that blocks sending
 * shows here as soon as it's true.
 */
export function BillToCard({
  invoice,
  patient,
  problems,
}: {
  invoice: Invoice;
  patient: Patient;
  problems: BillToProblem[];
}) {
  const store = useStore();
  const navigate = useNavigate();
  const { fundingTypes, patientFundings } = usePracticeData();
  const billTo = resolvedBillTo(invoice, patient);
  const today = localDateString(new Date());
  const [changing, setChanging] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  // What's typed in each detail, until it's saved on leaving the field.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [dateErrors, setDateErrors] = useState<Record<string, boolean>>({});

  const options = billToOptions({
    patient,
    fundings: patientFundings,
    types: fundingTypes,
    today,
    current: billTo,
  });
  // Self-pay is always one of the options, so a funding to change to means more than one.
  const canChange = billTo.kind === "funding" || options.length > 1;

  const funding =
    billTo.kind === "funding"
      ? patientFundings.find((candidate) => candidate.id === billTo.patientFundingId)
      : undefined;
  const fundingType = fundingTypes.find((type) => type.id === funding?.fundingTypeId);
  const recipientProblem = problems.find((problem) => problem.target.kind === "recipient");

  function saveDetail(detailId: string, stored: string) {
    const text = (typed[detailId] ?? stored).trim();
    const isDate = fundingType?.details.find((detail) => detail.id === detailId)?.kind === "date";
    if (isDate && !parseDayInput(text).ok) {
      setDateErrors((current) => ({ ...current, [detailId]: true }));
      return;
    }
    setDateErrors((current) => ({ ...current, [detailId]: false }));
    if (text !== stored) attempt(() => store.setBillToDetail(invoice.id, detailId, text));
  }

  async function saveAddress() {
    setSavingAddress(true);
    try {
      await store.setSelfPayAddress(invoice.id, address);
      notify("Address saved");
      setEditingAddress(false);
    } catch (caught) {
      const message = userMessage(caught);
      if (message === null) throw caught;
      notifyError(message);
    } finally {
      setSavingAddress(false);
    }
  }

  function choose(option: BillToOption) {
    setChanging(false);
    if (option.selected) return;
    attempt(() =>
      store.setBillTo(
        invoice.id,
        option.key === "patient"
          ? { kind: "patient" }
          : { kind: "funding", patientFundingId: option.key },
      ),
    );
  }

  const change = canChange ? (
    <Popover isOpen={changing} onOpenChange={setChanging}>
      <Button variant="ghost" className="-mr-3 h-11">
        Change
      </Button>
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog aria-label="Change who to bill" className="p-2">
          <div role="radiogroup" aria-label="Bill to" className="flex flex-col gap-1">
            {options.map((option) => (
              <label
                key={option.key}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                  option.selected ? "bg-accent-soft text-accent-soft-foreground" : ""
                }`}
              >
                <input
                  type="radio"
                  name="bill-to"
                  className="size-[18px] flex-none accent-accent"
                  checked={option.selected}
                  onChange={() => choose(option)}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{option.title}</span>
                  {option.detail === "" ? null : (
                    <span className={`text-sm ${option.selected ? "" : "text-muted"}`}>
                      {option.detail}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  ) : null;

  return (
    <section aria-labelledby="bill-to-heading" className="flex flex-col gap-2">
      <h2 id="bill-to-heading" className="text-[15px] font-semibold text-muted">
        Bill to
      </h2>
      <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4 shadow-surface">
        {billTo.kind === "funding" ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <FundingChip variant="funding" label={billTo.fundingName} />
              {change}
            </div>
            {billTo.name.trim() === "" ? null : (
              <p className="font-semibold [overflow-wrap:anywhere]">{billTo.name}</p>
            )}
            {recipientProblem ? (
              <div role="alert" className="flex flex-col items-start gap-0.5">
                <Problem message={recipientProblem.message} />
                <a
                  href={`/settings/funding-types/${fundingType?.id ?? ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    void navigate(
                      fundingType
                        ? `/settings/funding-types/${fundingType.id}`
                        : "/settings/funding-types",
                    );
                  }}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-danger underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Open Funding types
                </a>
              </div>
            ) : null}
            {billTo.details.map((detail) => {
              const problem = problems.find(
                (candidate) =>
                  candidate.target.kind === "detail" && candidate.target.detailId === detail.id,
              );
              const message = dateErrors[detail.id] ? DATE_MESSAGE : (problem?.message ?? null);
              const errorId = `bill-to-error-${detail.id}`;
              return (
                <TextField
                  key={detail.id}
                  value={typed[detail.id] ?? detail.value}
                  onChange={(value) => setTyped((current) => ({ ...current, [detail.id]: value }))}
                  isInvalid={message !== null}
                  isRequired
                >
                  <span className="flex items-baseline">
                    <Label>{detail.label}</Label>
                    <span className="ml-1.5 text-[13px] text-field-placeholder">Required</span>
                  </span>
                  <Input
                    className="h-11 text-[15px] tabular-nums"
                    autoComplete="off"
                    aria-label={detail.label}
                    data-detail-id={detail.id}
                    onBlur={() => saveDetail(detail.id, detail.value)}
                    {...(message === null
                      ? {}
                      : { "aria-invalid": true, "aria-describedby": errorId })}
                  />
                  <FieldError>
                    {message === null ? null : <Problem id={errorId} message={message} />}
                  </FieldError>
                </TextField>
              );
            })}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <FundingChip variant="selfPay" label="Self-pay" />
              {change}
            </div>
            <p className="font-semibold">{billTo.name}</p>
            {editingAddress ? (
              <div className="flex flex-col gap-2">
                <TextField value={address} onChange={setAddress} autoFocus>
                  <span className="flex items-baseline">
                    <Label>Address</Label>
                    <span className="ml-1.5 text-[13px] text-field-placeholder">Optional</span>
                  </span>
                  <TextArea rows={3} className="text-[15px]" aria-label="Address" />
                </TextField>
                <div className="-ml-3 flex gap-1">
                  <Button
                    variant="ghost"
                    className="h-11"
                    isDisabled={savingAddress}
                    onPress={() => void saveAddress()}
                  >
                    Save address
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11"
                    isDisabled={savingAddress}
                    onPress={() => setEditingAddress(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {billTo.address.trim() === "" ? (
                  <p className="text-sm text-muted">
                    No address yet. A name is enough, an address is optional.
                  </p>
                ) : (
                  <div aria-label="Address" role="group">
                    {billTo.address.split("\n").map((line, index) => (
                      <p key={`${index}-${line}`} className="text-sm">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="-ml-3 h-11 self-start"
                  onPress={() => {
                    setAddress(billTo.address);
                    setEditingAddress(true);
                  }}
                >
                  {billTo.address.trim() === "" ? "Add address" : "Edit address"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
