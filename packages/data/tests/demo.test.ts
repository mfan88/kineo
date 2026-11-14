import {
  fundingTypeSchema,
  homeGroups,
  invoiceSchema,
  invoiceStyleSchema,
  lineItemSchema,
  patientFundingSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  profileSchema,
  visitItemSchema,
  visitSchema,
} from "@kineo/shared";
import { describe, expect, it } from "vitest";
import { createDemoPractice } from "../src/demo";

describe("demo practice", () => {
  it("has only records that pass the shared schemas", () => {
    const demo = createDemoPractice();
    for (const patient of demo.patients) expect(() => patientSchema.parse(patient)).not.toThrow();
    for (const visit of demo.visits) expect(() => visitSchema.parse(visit)).not.toThrow();
    for (const item of demo.visitItems) expect(() => visitItemSchema.parse(item)).not.toThrow();
    for (const invoice of demo.invoices) expect(() => invoiceSchema.parse(invoice)).not.toThrow();
    for (const line of demo.lineItems) expect(() => lineItemSchema.parse(line)).not.toThrow();
    for (const item of demo.priceItems) expect(() => priceItemSchema.parse(item)).not.toThrow();
    expect(() => profileSchema.parse(demo.profile)).not.toThrow();
    expect(() => practiceSettingsSchema.parse(demo.settings)).not.toThrow();
    expect(() => invoiceStyleSchema.parse(demo.invoiceStyle)).not.toThrow();
    for (const type of demo.fundingTypes) expect(() => fundingTypeSchema.parse(type)).not.toThrow();
    for (const funding of demo.patientFundings) {
      expect(() => patientFundingSchema.parse(funding)).not.toThrow();
    }
  });

  it("has the two funding types and one patient funding, pointing at real records", () => {
    const demo = createDemoPractice();
    expect(demo.fundingTypes.map((t) => t.name)).toEqual(["Autism Funding", "ICBC"]);
    expect(demo.fundingTypes[1]?.recipientName).toBe("");
    const types = new Set(demo.fundingTypes.map((t) => t.id));
    const patients = new Set(demo.patients.map((p) => p.id));
    expect(demo.patientFundings).toHaveLength(1);
    for (const funding of demo.patientFundings) {
      expect(types.has(funding.fundingTypeId ?? "")).toBe(true);
      expect(patients.has(funding.patientId)).toBe(true);
      const detailIds = demo.fundingTypes.flatMap((t) => t.details.map((d) => d.id));
      for (const id of Object.keys(funding.detailValues)) expect(detailIds).toContain(id);
    }
  });

  it("has visit items only on uninvoiced visits, in order from 0,; the style defaults to no footer logo and Made with on", () => {
    const demo = createDemoPractice();
    expect(demo.visitItems.length).toBeGreaterThan(0);
    const visits = new Map(demo.visits.map((visit) => [visit.id, visit]));
    for (const item of demo.visitItems) {
      expect(visits.get(item.visitId)?.invoiceId).toBeNull();
    }
    const positions = demo.visitItems.map((item) => item.position);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(positions[0]).toBe(0);
    expect(demo.invoiceStyle).toMatchObject({ footerLogoPath: null, showMadeWith: true });
  });

  it("uses each ID once", () => {
    const demo = createDemoPractice();
    const ids = [
      demo.patients,
      demo.visits,
      demo.visitItems,
      demo.invoices,
      demo.lineItems,
      demo.priceItems,
      demo.fundingTypes,
      demo.patientFundings,
    ].flatMap((records) => records.map((record) => record.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only refers to records that exist, for the right patient", () => {
    const demo = createDemoPractice();
    const patients = new Set(demo.patients.map((p) => p.id));
    const invoices = new Map(demo.invoices.map((i) => [i.id, i]));
    const priceItems = new Set(demo.priceItems.map((p) => p.id));
    for (const visit of demo.visits) expect(patients.has(visit.patientId)).toBe(true);
    const invoiced = demo.visits.filter((visit) => visit.invoiceId !== null);
    expect(invoiced.length).toBeGreaterThan(0);
    for (const visit of invoiced) {
      expect(invoices.get(visit.invoiceId ?? "")?.patientId).toBe(visit.patientId);
    }
    for (const invoice of demo.invoices) expect(patients.has(invoice.patientId)).toBe(true);
    for (const line of demo.lineItems) expect(invoices.has(line.invoiceId)).toBe(true);
    const linked = demo.lineItems.filter((line) => line.priceItemId !== null);
    for (const line of linked) expect(priceItems.has(line.priceItemId ?? "")).toBe(true);
  });

  it("belongs to one made-up owner", () => {
    const demo = createDemoPractice();
    const owners = new Set(
      [
        demo.patients,
        demo.visits,
        demo.visitItems,
        demo.invoices,
        demo.lineItems,
        demo.priceItems,
        demo.fundingTypes,
        demo.patientFundings,
      ]
        .flatMap((records) => records.map((record) => record.ownerId))
        .concat([demo.profile.ownerId, demo.settings.ownerId, demo.invoiceStyle.ownerId]),
    );
    expect([...owners]).toEqual(["user_seed_demo"]);
  });

  it("fills every Home group, which is what the demo is for", () => {
    const { visits, invoices } = createDemoPractice();
    const groups = homeGroups(visits, invoices);
    expect(groups.readyToInvoice.length).toBeGreaterThan(0);
    expect(groups.notSentYet.length).toBeGreaterThan(0);
    expect(groups.waitingOnPayment.length).toBeGreaterThan(0);
    expect(invoices.some((invoice) => invoice.status === "paid")).toBe(true);
  });

  it("hands out independent copies", () => {
    const first = createDemoPractice();
    const second = createDemoPractice();
    first.patients[0]!.fullName = "Changed Example";
    first.profile.fullName.value = "Changed Example";
    expect(second.patients[0]?.fullName).not.toBe("Changed Example");
    expect(second.profile.fullName.value).not.toBe("Changed Example");
  });
});
