import { FundingRuleError, type FundingDetail } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { toFundingType, toInvoice, toPatientFunding } from "../src/mappers";
import type { FundingTypeRow, InvoiceRow, PatientFundingRow } from "../src/schema";
import { testDatabase } from "./sqlite";

// Made-up test data only.
const OWNER = "user_test";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:00:00.000Z";
const TODAY = "2026-11-12";

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;
let ids: number;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DETAIL = uuid(700);
const detail = (over: Partial<FundingDetail> = {}): FundingDetail => ({
  id: DETAIL,
  label: "Billing number",
  kind: "text",
  showOnInvoice: true,
  ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({
  name: "Autism Funding",
  recipientName: "Example Branch",
  recipientAddress: "PO Box 1",
  details: [detail()],
  ...over,
});

const types = () => store.rows<FundingTypeRow>("funding_types").map(toFundingType);
const fundings = () => store.rows<PatientFundingRow>("patient_fundings").map(toPatientFunding);
const invoices = () => store.rows<InvoiceRow>("invoices").map(toInvoice);

let patientId: string;

beforeEach(async () => {
  store = testDatabase();
  clock = T1;
  ids = 0;
  writer = new PracticeWriter(store.db, {
    ownerId: OWNER,
    now: () => clock,
    today: () => TODAY,
    newId: () => uuid(++ids),
  });
  patientId = (await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" })).id;
});

/** An invoice already billed through a funding, as F11 will create them. */
function insertInvoice(id: string, status: "draft" | "sent", fundingId: string, number: number) {
  store.run(
    `INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points,
       sent_at, created_at, updated_at, bill_to_kind, bill_to_name, bill_to_address,
       bill_to_funding_name, patient_funding_id, bill_to_details)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'funding', 'Old Recipient', 'Old Address', 'Old Name', ?, ?)`,
    id,
    OWNER,
    patientId,
    number,
    status,
    status === "sent" ? T1 : null,
    T1,
    T1,
    fundingId,
    JSON.stringify([{ id: DETAIL, label: "Old label", value: "old value" }]),
  );
}

describe("saveFundingType", () => {
  it("saves a new type, trimmed, with details as JSON with snake_case keys", async () => {
    const type = await writer.saveFundingType(
      draft({ name: "  Autism Funding ", details: [detail({ label: " Billing number " })] }),
    );
    expect(type).toMatchObject({
      id: uuid(2),
      ownerId: OWNER,
      name: "Autism Funding",
      details: [{ label: "Billing number" }],
      createdAt: T1,
    });
    expect(types()).toEqual([type]);
    const [row] = store.rows<FundingTypeRow>("funding_types");
    expect(JSON.parse(row?.details ?? "")).toEqual([
      { id: DETAIL, label: "Billing number", kind: "text", show_on_invoice: true },
    ]);
  });

  it("saves a type with no recipient yet", async () => {
    await writer.saveFundingType(draft({ recipientName: "", recipientAddress: "" }));
    expect(types()[0]).toMatchObject({ recipientName: "", recipientAddress: "" });
  });

  it("updates an existing type and keeps when it was created", async () => {
    const type = await writer.saveFundingType(draft());
    clock = T2;
    const updated = await writer.saveFundingType({ ...draft({ name: "ICBC" }), id: type.id });
    expect(updated).toMatchObject({ id: type.id, name: "ICBC", createdAt: T1, updatedAt: T2 });
    expect(types()).toEqual([updated]);
  });

  it("refuses a blank name, a repeated label and a type that's gone, writing nothing", async () => {
    await expect(writer.saveFundingType(draft({ name: "  " }))).rejects.toThrow(
      new FundingRuleError("Add a name for this funding type."),
    );
    await expect(
      writer.saveFundingType(
        draft({ details: [detail(), detail({ id: uuid(701), label: "billing number" })] }),
      ),
    ).rejects.toThrow(new FundingRuleError("Two details can't have the same name."));
    await expect(writer.saveFundingType({ ...draft(), id: uuid(999) })).rejects.toThrow(
      new WriteError("That funding type no longer exists."),
    );
    expect(types()).toEqual([]);
  });

  it("refreshes a draft's recipient and labels, and leaves a sent invoice alone", async () => {
    const type = await writer.saveFundingType(draft());
    const funding = await writer.addPatientFunding({
      patientId,
      fundingTypeId: type.id,
      detailValues: { [DETAIL]: "4821" },
      periodStart: null,
      periodEnd: null,
    });
    insertInvoice(uuid(801), "draft", funding.id, 1);
    insertInvoice(uuid(802), "sent", funding.id, 2);
    clock = T2;
    await writer.saveFundingType({
      ...draft({
        name: "Renamed",
        recipientName: "New Recipient",
        recipientAddress: "New Address",
        details: [detail({ label: "Authorization number" })],
      }),
      id: type.id,
    });
    const [draftInvoice, sentInvoice] = invoices();
    expect(draftInvoice?.billTo).toEqual({
      kind: "funding",
      patientFundingId: funding.id,
      fundingName: "Renamed",
      name: "New Recipient",
      address: "New Address",
      details: [{ id: DETAIL, label: "Authorization number", value: "4821" }],
    });
    expect(draftInvoice?.updatedAt).toBe(T2);
    expect(sentInvoice?.billTo).toMatchObject({
      fundingName: "Old Name",
      name: "Old Recipient",
      details: [{ label: "Old label", value: "old value" }],
    });
    expect(sentInvoice?.updatedAt).toBe(T1);
  });
});

const fundingInput = (typeId: string) => ({
  patientId,
  fundingTypeId: typeId,
  detailValues: { [DETAIL]: "4821" },
  periodStart: null,
  periodEnd: null,
});

describe("deleteFundingType", () => {
  it("deletes a type nobody uses", async () => {
    const type = await writer.saveFundingType(draft());
    await writer.deleteFundingType(type.id);
    expect(types()).toEqual([]);
  });

  it("refuses while a patient has an active funding of it", async () => {
    const type = await writer.saveFundingType(draft());
    await writer.addPatientFunding(fundingInput(type.id));
    await expect(writer.deleteFundingType(type.id)).rejects.toThrow(
      new FundingRuleError("Move this type's patients to another type before deleting it."),
    );
    expect(types()).toHaveLength(1);
  });

  it("allows it once the funding has ended, and unlinks that funding", async () => {
    const type = await writer.saveFundingType(draft());
    const funding = await writer.addPatientFunding(fundingInput(type.id));
    await writer.endPatientFunding(funding.id);
    await writer.deleteFundingType(type.id);
    expect(types()).toEqual([]);
    expect(fundings()).toMatchObject([{ id: funding.id, fundingTypeId: null, endedOn: TODAY }]);
  });

  it("allows it when the funding's period has passed", async () => {
    const type = await writer.saveFundingType(draft());
    await writer.addPatientFunding({ ...fundingInput(type.id), periodEnd: "2026-11-11" });
    await writer.deleteFundingType(type.id);
    expect(types()).toEqual([]);
  });

  it("says when the type is already gone", async () => {
    await expect(writer.deleteFundingType(uuid(999))).rejects.toThrow(
      new WriteError("That funding type no longer exists."),
    );
  });
});

describe("patient fundings", () => {
  let typeId: string;
  beforeEach(async () => {
    typeId = (await writer.saveFundingType(draft())).id;
  });
  const input = (over: Record<string, unknown> = {}) => ({
    patientId,
    fundingTypeId: typeId,
    detailValues: { [DETAIL]: " 4821 " },
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    ...over,
  });

  it("adds a funding with trimmed values and a period", async () => {
    const funding = await writer.addPatientFunding(input());
    expect(funding).toMatchObject({
      patientId,
      fundingTypeId: typeId,
      detailValues: { [DETAIL]: "4821" },
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      endedOn: null,
    });
    expect(fundings()).toEqual([funding]);
  });

  it("drops values for details the type doesn't have", async () => {
    const funding = await writer.addPatientFunding(
      input({ detailValues: { [DETAIL]: "4821", [uuid(555)]: "stray" } }),
    );
    expect(Object.keys(funding.detailValues)).toEqual([DETAIL]);
  });

  it("asks for a shown detail's value, and for sensible dates", async () => {
    await expect(writer.addPatientFunding(input({ detailValues: {} }))).rejects.toThrow(
      new FundingRuleError("Add the billing number."),
    );
    await expect(
      writer.addPatientFunding(input({ periodStart: "2027-04-01", periodEnd: "2027-03-31" })),
    ).rejects.toThrow(new FundingRuleError("The period can't end before it starts."));
    expect(fundings()).toEqual([]);
  });

  it("refuses a patient or type that's gone", async () => {
    await expect(writer.addPatientFunding(input({ patientId: uuid(999) }))).rejects.toThrow(
      new WriteError("That patient no longer exists."),
    );
    await expect(writer.addPatientFunding(input({ fundingTypeId: uuid(999) }))).rejects.toThrow(
      new WriteError("That funding type no longer exists."),
    );
  });

  it("ends a funding today, and undoes it", async () => {
    const funding = await writer.addPatientFunding(input());
    expect(await writer.endPatientFunding(funding.id)).toMatchObject({ endedOn: TODAY });
    expect(fundings()[0]?.endedOn).toBe(TODAY);
    expect(await writer.undoEndPatientFunding(funding.id)).toMatchObject({ endedOn: null });
    expect(fundings()[0]?.endedOn).toBeNull();
  });

  it("says when a funding is gone", async () => {
    for (const run of [
      () => writer.endPatientFunding(uuid(999)),
      () => writer.undoEndPatientFunding(uuid(999)),
      () =>
        writer.updatePatientFunding(uuid(999), {
          detailValues: {},
          periodStart: null,
          periodEnd: null,
        }),
    ]) {
      await expect(run()).rejects.toThrow(new WriteError("That funding no longer exists."));
    }
  });

  it("updates values, refreshing a draft's detail but not a sent invoice's", async () => {
    const funding = await writer.addPatientFunding(input());
    insertInvoice(uuid(801), "draft", funding.id, 1);
    insertInvoice(uuid(802), "sent", funding.id, 2);
    clock = T2;
    const updated = await writer.updatePatientFunding(funding.id, {
      detailValues: { [DETAIL]: "9999" },
      periodStart: null,
      periodEnd: "2027-06-30",
    });
    expect(updated).toMatchObject({ periodStart: null, periodEnd: "2027-06-30", updatedAt: T2 });
    const [draftInvoice, sentInvoice] = invoices();
    expect(draftInvoice?.billTo).toMatchObject({
      kind: "funding",
      name: "Example Branch",
      details: [{ id: DETAIL, label: "Billing number", value: "9999" }],
    });
    expect(sentInvoice?.billTo).toMatchObject({ details: [{ value: "old value" }] });
  });

  it("refuses an update with a missing shown value", async () => {
    const funding = await writer.addPatientFunding(input());
    await expect(
      writer.updatePatientFunding(funding.id, {
        detailValues: { [DETAIL]: " " },
        periodStart: null,
        periodEnd: null,
      }),
    ).rejects.toThrow(new FundingRuleError("Add the billing number."));
    expect(fundings()[0]?.detailValues[DETAIL]).toBe("4821");
  });
});
