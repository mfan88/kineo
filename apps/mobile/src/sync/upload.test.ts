import { describe, expect, it, vi } from "vitest";
import { RetryLater, Uploader, type Change, type Fetch } from "./upload";

const API = "https://api.test/rest/v1/";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const INVOICE = "16fd2706-8baf-433b-82eb-8c7fada847da";
const PATIENT = "886313e1-3b8a-4372-9b90-0c9aee199e5d";
const BOOLEANS = { invoices: ["tax_enabled"], profiles: ["full_name_on_invoice"] };

function setUp(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn<Fetch>((url, init) => {
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  });
  return { calls, uploader: new Uploader(API, BOOLEANS, fetchFn) };
}

const ok = () => new Response(null, { status: 201 });
function body(init: RequestInit): unknown {
  if (typeof init.body !== "string") throw new Error("Expected a JSON body.");
  return JSON.parse(init.body);
}
const headers = (init: RequestInit) => Object.fromEntries(new Headers(init.headers));

/** The transaction PracticeWriter.createInvoice makes: the invoice, then each visit. */
function newInvoice(): Change[] {
  return [
    {
      op: "PUT",
      table: "invoices",
      id: INVOICE,
      opData: {
        patient_id: PATIENT,
        number: 4,
        status: "draft",
        tax_enabled: 0,
        tax_rate_basis_points: null,
        created_at: "2026-11-12T17:00:00.000Z",
      },
    },
    { op: "PATCH", table: "visits", id: ID, opData: { invoice_id: INVOICE } },
    { op: "PATCH", table: "visits", id: ID2, opData: { invoice_id: INVOICE } },
  ];
}

describe("Uploader", () => {
  it("upserts a new row with booleans restored and the session token", async () => {
    const { calls, uploader } = setUp(ok);
    const change: Change = {
      op: "PUT",
      table: "profiles",
      id: ID,
      opData: { full_name: "Alex Example", full_name_on_invoice: 1 },
    };
    expect(await uploader.upload("session-jwt", [change])).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/rest/v1/profiles");
    expect(calls[0]?.init.method).toBe("POST");
    expect(headers(calls[0]!.init)).toMatchObject({
      authorization: "Bearer session-jwt",
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    expect(body(calls[0]!.init)).toEqual({
      id: ID,
      full_name: "Alex Example",
      full_name_on_invoice: true,
    });
  });

  it("patches only the changed columns, and skips an empty patch", async () => {
    const { calls, uploader } = setUp(ok);
    await uploader.upload("t", [
      { op: "PATCH", table: "invoices", id: ID, opData: { tax_enabled: 0 } },
      { op: "PATCH", table: "patients", id: ID2, opData: {} },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://api.test/rest/v1/invoices?id=eq.${ID}`);
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(body(calls[0]!.init)).toEqual({ tax_enabled: false });
  });

  it("deletes by ID", async () => {
    const { calls, uploader } = setUp(ok);
    await uploader.upload("t", [{ op: "DELETE", table: "price_items", id: ID }]);
    expect(calls[0]?.url).toBe(`https://api.test/rest/v1/price_items?id=eq.${ID}`);
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it("sends a new invoice and its visits as one create_invoice call", async () => {
    const { calls, uploader } = setUp(ok);
    expect(await uploader.upload("t", newInvoice())).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/rest/v1/rpc/create_invoice");
    expect(body(calls[0]!.init)).toEqual({
      p_id: INVOICE,
      p_patient_id: PATIENT,
      p_number: 4,
      p_tax_rate_basis_points: null,
      p_visit_ids: [ID, ID2],
      p_created_at: "2026-11-12T17:00:00.000Z",
      p_billing: {
        bill_to_kind: null,
        bill_to_name: null,
        bill_to_address: null,
        bill_to_funding_name: null,
        patient_funding_id: null,
        bill_to_details: null,
      },
    });
  });

  it("sends a new invoice's Bill to as p_billing, details as their JSON text", async () => {
    const { calls, uploader } = setUp(ok);
    const [invoice, ...visits] = newInvoice();
    const details = JSON.stringify([{ id: ID2, label: "Billing number", value: "4821" }]);
    await uploader.upload("t", [
      {
        ...invoice!,
        opData: {
          ...invoice!.opData,
          bill_to_kind: "funding",
          bill_to_name: "Test Funding Branch",
          bill_to_address: "PO Box 1\nTestville BC V0V 0V0",
          bill_to_funding_name: "Test Funding",
          patient_funding_id: ID,
          bill_to_details: details,
        },
      },
      ...visits,
    ]);
    expect(calls).toHaveLength(1);
    expect(body(calls[0]!.init)).toMatchObject({
      p_billing: {
        bill_to_kind: "funding",
        bill_to_name: "Test Funding Branch",
        bill_to_address: "PO Box 1\nTestville BC V0V 0V0",
        bill_to_funding_name: "Test Funding",
        patient_funding_id: ID,
        bill_to_details: details,
      },
    });
  });

  it("upserts funding types and patient fundings like any other table", async () => {
    const { calls, uploader } = setUp(ok);
    const details = JSON.stringify([
      { id: ID2, label: "Billing number", kind: "text", show_on_invoice: true },
    ]);
    await uploader.upload("t", [
      { op: "PUT", table: "funding_types", id: ID, opData: { name: "Test Funding", details } },
      { op: "PATCH", table: "patient_fundings", id: ID2, opData: { ended_on: "2026-11-13" } },
    ]);
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["https://api.test/rest/v1/funding_types", "POST"],
      [`https://api.test/rest/v1/patient_fundings?id=eq.${ID2}`, "PATCH"],
    ]);
    expect(headers(calls[0]!.init)).toMatchObject({
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    expect(body(calls[0]!.init)).toEqual({ id: ID, name: "Test Funding", details });
  });

  it("upserts visit items like any other table", async () => {
    const { calls, uploader } = setUp(ok);
    await uploader.upload("t", [
      { op: "PUT", table: "visit_items", id: ID, opData: { visit_id: ID2, quantity: 2 } },
    ]);
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["https://api.test/rest/v1/visit_items", "POST"],
    ]);
    expect(headers(calls[0]!.init)).toMatchObject({
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    expect(body(calls[0]!.init)).toEqual({ id: ID, visit_id: ID2, quantity: 2 });
  });

  it("sends invoice lines after create_invoice as upserts", async () => {
    const { calls, uploader } = setUp(ok);
    await uploader.upload("t", [
      ...newInvoice(),
      { op: "PUT", table: "invoice_lines", id: ID, opData: { invoice_id: INVOICE, quantity: 1 } },
    ]);
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["https://api.test/rest/v1/rpc/create_invoice", "POST"],
      ["https://api.test/rest/v1/invoice_lines", "POST"],
    ]);
  });

  it("sends a new invoice with no visits, and other changes after it separately", async () => {
    const { calls, uploader } = setUp(ok);
    const [invoice] = newInvoice();
    await uploader.upload("t", [
      invoice!,
      { op: "PATCH", table: "visits", id: ID, opData: { note: "Made-up note" } },
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.test/rest/v1/rpc/create_invoice",
      `https://api.test/rest/v1/visits?id=eq.${ID}`,
    ]);
    expect(body(calls[0]!.init)).toMatchObject({ p_visit_ids: [] });
  });

  it("reports the server's refusal and sends nothing after it", async () => {
    const { calls, uploader } = setUp(() =>
      Response.json(
        { code: "23514", message: "This invoice has been sent, so it can't be changed." },
        { status: 400 },
      ),
    );
    const rejection = await uploader.upload("t", [
      { op: "PATCH", table: "invoice_lines", id: ID, opData: { quantity: 2 } },
      { op: "DELETE", table: "invoice_lines", id: ID2 },
    ]);
    expect(rejection).toEqual({
      table: "invoice_lines",
      operation: "PATCH",
      status: 400,
      code: "23514",
      message: "This invoice has been sent, so it can't be changed.",
    });
    expect(calls).toHaveLength(1);
  });

  it("reports a refusal with no readable body", async () => {
    const { uploader } = setUp(() => new Response("not json", { status: 409 }));
    expect(await uploader.upload("t", [{ op: "DELETE", table: "patients", id: ID }])).toEqual({
      table: "patients",
      operation: "DELETE",
      status: 409,
      code: null,
      message: null,
    });
  });

  it.each([401, 408, 429, 500, 503])("retries later when the server answers %i", async (status) => {
    const { uploader } = setUp(() => new Response(null, { status }));
    await expect(
      uploader.upload("t", [{ op: "DELETE", table: "patients", id: ID }]),
    ).rejects.toBeInstanceOf(RetryLater);
  });

  it("retries later when the network fails, without the URL or token in the error", async () => {
    const uploader = new Uploader(API, BOOLEANS, () => Promise.reject(new TypeError("offline")));
    const failure = uploader.upload("secret-token", [{ op: "DELETE", table: "patients", id: ID }]);
    await expect(failure).rejects.toBeInstanceOf(RetryLater);
    await expect(failure).rejects.not.toThrow(/secret-token|api\.test/);
  });

  it("refuses unknown tables and IDs that aren't UUIDs without sending", async () => {
    const { calls, uploader } = setUp(ok);
    expect(await uploader.upload("t", [{ op: "DELETE", table: "ps_crud", id: ID }])).toMatchObject({
      table: "ps_crud",
      status: 0,
      message: "Not a table Kineō syncs.",
    });
    expect(
      await uploader.upload("t", [{ op: "DELETE", table: "patients", id: "1&or=x" }]),
    ).toMatchObject({ status: 0, message: "The row's ID isn't valid." });
    const [invoice] = newInvoice();
    expect(
      await uploader.upload("t", [
        invoice!,
        { op: "PATCH", table: "visits", id: "bad", opData: { invoice_id: INVOICE } },
      ]),
    ).toMatchObject({ table: "visits", status: 0 });
    expect(calls).toHaveLength(0);
  });
});
