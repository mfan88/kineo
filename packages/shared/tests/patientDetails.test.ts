import { describe, expect, it } from "vitest";
import {
  invoicePatientDetails,
  invoiceSchema,
  normalisePatientDetails,
  patientDetailsErrors,
  patientSchema,
} from "../src/index";

// Made-up test data only.
const owner = "user_test_owner";
const now = "2026-11-11T09:30:00Z";
const ids = {
  patient: "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60",
  invoice: "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f",
  detailA: "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091",
  detailB: "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102",
};

const oldPatient = {
  id: ids.patient,
  ownerId: owner,
  fullName: "Jordan Example",
  reasonForVisit: "Sore shoulder",
  createdAt: now,
  updatedAt: now,
};

const fullPatient = {
  ...oldPatient,
  isChild: false,
  parentNames: [] as string[],
  parentNamesOnInvoice: false,
  email: "jordan@example.com",
  emailOnInvoice: true,
  phone: "604-555-0100",
  phoneOnInvoice: true,
  customDetails: [
    {
      id: ids.detailA,
      label: "PHN",
      value: "9999 000 001",
      showOnInvoice: true,
    },
  ],
  detailsRequired: true,
};

const draftInvoice = {
  id: ids.invoice,
  ownerId: owner,
  patientId: ids.patient,
  number: 1,
  status: "draft",
  taxEnabled: false,
  taxRateBasisPoints: 0,
  sentAt: null,
  paidAt: null,
  cancelledAt: null,
  cancelledVisitDates: null,
  createdAt: now,
  updatedAt: now,
};

const makeCustomDetails = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    label: `Detail ${i + 1}`,
    value: `Value ${i + 1}`,
    showOnInvoice: false,
  }));

describe("patientSchema patient details", () => {
  it("parses an old patient record and fills new fields with defaults", () => {
    const parsed = patientSchema.parse(oldPatient);
    expect(parsed).toMatchObject({
      ...oldPatient,
      isChild: false,
      parentNames: [],
      parentNamesOnInvoice: false,
      email: "",
      emailOnInvoice: false,
      phone: "",
      phoneOnInvoice: false,
      customDetails: [],
      detailsRequired: false,
    });
  });

  it("accepts a full required adult patient and a full required child patient", () => {
    expect(patientSchema.safeParse(fullPatient).success).toBe(true);
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        isChild: true,
        parentNames: ["Alex Example", "Taylor Example"],
        parentNamesOnInvoice: true,
      }).success,
    ).toBe(true);
  });

  it("rejects a non-child patient with parent names", () => {
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        isChild: false,
        parentNames: ["Alex Example"],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid email when non-blank, and allows blank when details are not required", () => {
    expect(
      patientSchema.safeParse({
        ...oldPatient,
        email: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      patientSchema.safeParse({
        ...oldPatient,
        email: "",
        detailsRequired: false,
      }).success,
    ).toBe(true);
  });

  it("allows up to 4 parents and rejects 5", () => {
    const fourParents = ["Parent One", "Parent Two", "Parent Three", "Parent Four"];
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        isChild: true,
        parentNames: fourParents,
      }).success,
    ).toBe(true);
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        isChild: true,
        parentNames: [...fourParents, "Parent Five"],
      }).success,
    ).toBe(false);
  });

  it("allows up to 20 custom details and rejects 21", () => {
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        customDetails: makeCustomDetails(20),
      }).success,
    ).toBe(true);
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        customDetails: makeCustomDetails(21),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate custom detail labels (ignoring case and outer spaces) and duplicate ids", () => {
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        customDetails: [
          { id: ids.detailA, label: "Allergy", value: "None", showOnInvoice: false },
          { id: ids.detailB, label: " allergy ", value: "Latex", showOnInvoice: false },
        ],
      }).success,
    ).toBe(false);

    expect(
      patientSchema.safeParse({
        ...fullPatient,
        customDetails: [
          { id: ids.detailA, label: "Allergy", value: "None", showOnInvoice: false },
          { id: ids.detailA, label: "Birth year", value: "1990", showOnInvoice: false },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects detailsRequired: true when email, phone, or child parent name is missing", () => {
    expect(
      patientSchema.safeParse({
        ...fullPatient,
        detailsRequired: true,
        email: "   ",
      }).success,
    ).toBe(false);

    expect(
      patientSchema.safeParse({
        ...fullPatient,
        detailsRequired: true,
        phone: "",
      }).success,
    ).toBe(false);

    expect(
      patientSchema.safeParse({
        ...fullPatient,
        detailsRequired: true,
        isChild: true,
        parentNames: [],
      }).success,
    ).toBe(false);
  });
});

describe("invoiceSchema patientDetails", () => {
  it("accepts invoices without patientDetails or with valid patientDetails", () => {
    expect(invoiceSchema.safeParse(draftInvoice).success).toBe(true);
    expect(
      invoiceSchema.safeParse({
        ...draftInvoice,
        patientDetails: [
          { id: "parents", label: "Parents", value: "Alex Example, Taylor Example" },
          { id: "email", label: "Email", value: "jordan@example.com" },
          { id: "phone", label: "Phone", value: "604-555-0100" },
          { id: ids.detailA, label: "Clinic note", value: "Sample Clinic referral" },
        ],
      }).success,
    ).toBe(true);
  });

  it("allows up to 23 patientDetails items and rejects 24", () => {
    const items = Array.from({ length: 23 }, (_, i) => ({
      id: `detail-${i}`,
      label: `Label ${i}`,
      value: `Value ${i}`,
    }));
    expect(invoiceSchema.safeParse({ ...draftInvoice, patientDetails: items }).success).toBe(true);
    expect(
      invoiceSchema.safeParse({
        ...draftInvoice,
        patientDetails: [...items, { id: "detail-23", label: "Extra", value: "Over limit" }],
      }).success,
    ).toBe(false);
  });

  it("allows a value of 500 characters and rejects 501", () => {
    expect(
      invoiceSchema.safeParse({
        ...draftInvoice,
        patientDetails: [{ id: ids.detailA, label: "Notes", value: "x".repeat(500) }],
      }).success,
    ).toBe(true);
    expect(
      invoiceSchema.safeParse({
        ...draftInvoice,
        patientDetails: [{ id: ids.detailA, label: "Notes", value: "x".repeat(501) }],
      }).success,
    ).toBe(false);
  });
});

describe("normalisePatientDetails", () => {
  it("trims all fields, trims non-blank parents, and drops blank parent entries for a child", () => {
    const result = normalisePatientDetails({
      fullName: "  Jordan Example  ",
      isChild: true,
      parentNames: ["  Alex Example  ", "", "   ", " Taylor Example "],
      parentNamesOnInvoice: true,
      email: "  jordan@example.com  ",
      emailOnInvoice: true,
      phone: "  604-555-0100  ",
      phoneOnInvoice: false,
      customDetails: [
        {
          id: `  ${ids.detailA}  `,
          label: "  Care card  ",
          value: "  12345  ",
          showOnInvoice: true,
        },
      ],
    });

    expect(result).toEqual({
      fullName: "Jordan Example",
      isChild: true,
      parentNames: ["Alex Example", "Taylor Example"],
      parentNamesOnInvoice: true,
      email: "jordan@example.com",
      emailOnInvoice: true,
      phone: "604-555-0100",
      phoneOnInvoice: false,
      customDetails: [
        {
          id: ids.detailA,
          label: "Care card",
          value: "12345",
          showOnInvoice: true,
        },
      ],
    });
  });

  it("clears parentNames and turns off parentNamesOnInvoice when isChild is false", () => {
    const result = normalisePatientDetails({
      fullName: "Jordan Example",
      isChild: false,
      parentNames: ["Alex Example"],
      parentNamesOnInvoice: true,
      email: "jordan@example.com",
      emailOnInvoice: false,
      phone: "604-555-0100",
      phoneOnInvoice: false,
      customDetails: [],
    });

    expect(result.isChild).toBe(false);
    expect(result.parentNames).toEqual([]);
    expect(result.parentNamesOnInvoice).toBe(false);
  });

  it("handles omitted optional fields cleanly for both adult and child inputs", () => {
    expect(normalisePatientDetails({ fullName: "  Jordan Example  " })).toEqual({
      fullName: "Jordan Example",
      isChild: false,
      parentNames: [],
      parentNamesOnInvoice: false,
      email: "",
      emailOnInvoice: false,
      phone: "",
      phoneOnInvoice: false,
      customDetails: [],
    });

    expect(normalisePatientDetails({ fullName: "Jordan Example", isChild: true })).toEqual({
      fullName: "Jordan Example",
      isChild: true,
      parentNames: [],
      parentNamesOnInvoice: false,
      email: "",
      emailOnInvoice: false,
      phone: "",
      phoneOnInvoice: false,
      customDetails: [],
    });
  });
});

describe("patientDetailsErrors", () => {
  const validRequiredAdult = {
    fullName: "Jordan Example",
    isChild: false,
    parentNames: [],
    email: "jordan@example.com",
    phone: "604-555-0100",
    customDetails: [
      { id: ids.detailA, label: "Clinic", value: "Sample Clinic", showOnInvoice: true },
      { id: ids.detailB, label: "Referral", value: "Dr. Example", showOnInvoice: false },
    ],
  };

  it("returns no errors for valid full adult and child forms", () => {
    expect(patientDetailsErrors(validRequiredAdult, { required: true })).toEqual({});
    expect(
      patientDetailsErrors(
        {
          ...validRequiredAdult,
          isChild: true,
          parentNames: ["Alex Example"],
        },
        { required: true },
      ),
    ).toEqual({});
  });

  it("requires fullName, email, phone, and parent name when required is true", () => {
    expect(
      patientDetailsErrors(
        {
          fullName: "   ",
          isChild: true,
          parentNames: [],
          email: "  ",
          phone: "",
          customDetails: [],
        },
        { required: true },
      ),
    ).toEqual({
      fullName: "Add the patient's name.",
      parentNames: "Add a parent's name.",
      email: "Add an email so you can reach this patient.",
      phone: "Add a phone number so you can reach this patient.",
    });

    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          isChild: true,
        },
        { required: true },
      ),
    ).toEqual({
      parentNames: "Add a parent's name.",
      email: "Add an email so you can reach this patient.",
      phone: "Add a phone number so you can reach this patient.",
    });
  });

  it("treats a child with only blank parent entries as missing a parent name when required", () => {
    expect(
      patientDetailsErrors(
        {
          ...validRequiredAdult,
          isChild: true,
          parentNames: ["", "   "],
        },
        { required: true },
      ),
    ).toEqual({
      parentNames: "Add a parent's name.",
    });
  });

  it("validates email format when non-blank even if required is false", () => {
    expect(
      patientDetailsErrors(
        {
          ...validRequiredAdult,
          email: "not-an-email",
        },
        { required: true },
      ),
    ).toEqual({
      email: "Enter an email like name@example.com.",
    });

    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          email: "jordan@",
          phone: "",
        },
        { required: false },
      ),
    ).toEqual({
      email: "Enter an email like name@example.com.",
    });
  });

  it("allows blank email, phone, and parents when required is false, while still checking fullName", () => {
    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          isChild: true,
          parentNames: ["  "],
          email: "   ",
          phone: "",
          customDetails: [],
        },
        { required: false },
      ),
    ).toEqual({});

    expect(
      patientDetailsErrors(
        {
          fullName: "   ",
          email: "",
          phone: "",
        },
        { required: false },
      ),
    ).toEqual({
      fullName: "Add the patient's name.",
    });
  });

  it("rejects blank custom detail labels or values even when required is false", () => {
    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          customDetails: [{ id: ids.detailA, label: "  ", value: "123", showOnInvoice: true }],
        },
        { required: false },
      ),
    ).toEqual({
      customDetails: "Give each detail a label and a value.",
    });

    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          customDetails: [
            { id: ids.detailA, label: "Referral", value: "   ", showOnInvoice: true },
          ],
        },
        { required: false },
      ),
    ).toEqual({
      customDetails: "Give each detail a label and a value.",
    });
  });

  it("rejects duplicate custom detail labels ignoring case and outer spaces", () => {
    expect(
      patientDetailsErrors(
        {
          fullName: "Jordan Example",
          customDetails: [
            { id: ids.detailA, label: "Health number", value: "111", showOnInvoice: true },
            { id: ids.detailB, label: "  health number ", value: "222", showOnInvoice: false },
          ],
        },
        { required: false },
      ),
    ).toEqual({
      customDetails: "Each detail needs its own label.",
    });
  });
});

describe("invoicePatientDetails", () => {
  it("orders parents, email, phone, and custom details with trimmed values", () => {
    const lines = invoicePatientDetails({
      isChild: true,
      parentNames: ["  Alex Example ", " Taylor Example  "],
      parentNamesOnInvoice: true,
      email: "  jordan@example.com ",
      emailOnInvoice: true,
      phone: " 604-555-0100 ",
      phoneOnInvoice: true,
      customDetails: [
        { id: ids.detailA, label: " Clinic ", value: " Sample Clinic ", showOnInvoice: true },
        { id: ids.detailB, label: " Member ID ", value: " M-42 ", showOnInvoice: true },
      ],
    });

    expect(lines).toEqual([
      { id: "parents", label: "Parents", value: "Alex Example, Taylor Example" },
      { id: "email", label: "Email", value: "jordan@example.com" },
      { id: "phone", label: "Phone", value: "604-555-0100" },
      { id: ids.detailA, label: "Clinic", value: "Sample Clinic" },
      { id: ids.detailB, label: "Member ID", value: "M-42" },
    ]);
  });

  it('uses singular "Parent" when a child has one non-blank parent name', () => {
    expect(
      invoicePatientDetails({
        isChild: true,
        parentNames: ["  Alex Example  ", "   "],
        parentNamesOnInvoice: true,
        email: "",
        emailOnInvoice: false,
        phone: "",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([{ id: "parents", label: "Parent", value: "Alex Example" }]);
  });

  it("skips parents when isChild is false, when switch is off, or when names are all blank", () => {
    expect(
      invoicePatientDetails({
        isChild: false,
        parentNames: ["Alex Example"],
        parentNamesOnInvoice: true,
        email: "",
        emailOnInvoice: false,
        phone: "",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([]);

    expect(
      invoicePatientDetails({
        isChild: true,
        parentNames: ["Alex Example"],
        parentNamesOnInvoice: false,
        email: "",
        emailOnInvoice: false,
        phone: "",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([]);

    expect(
      invoicePatientDetails({
        isChild: true,
        parentNames: ["", "   "],
        parentNamesOnInvoice: true,
        email: "",
        emailOnInvoice: false,
        phone: "",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([]);
  });

  it("skips hidden or empty email, phone, and custom details (including empty custom label)", () => {
    expect(
      invoicePatientDetails({
        isChild: false,
        parentNames: [],
        parentNamesOnInvoice: false,
        email: "jordan@example.com",
        emailOnInvoice: false,
        phone: "   ",
        phoneOnInvoice: true,
        customDetails: [
          { id: ids.detailA, label: "Hidden", value: "Secret", showOnInvoice: false },
          { id: ids.detailB, label: "Empty value", value: "   ", showOnInvoice: true },
          {
            id: "7a8b9c0d-1e2f-4a3b-8c5d-6e7f80910213",
            label: "   ",
            value: "Orphan value",
            showOnInvoice: true,
          },
        ],
      }),
    ).toEqual([]);

    expect(
      invoicePatientDetails({
        isChild: false,
        parentNames: [],
        parentNamesOnInvoice: false,
        email: "   ",
        emailOnInvoice: true,
        phone: "604-555-0100",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([]);
  });

  it("returns an empty array when all invoice switches are off and fields are empty", () => {
    expect(
      invoicePatientDetails({
        isChild: false,
        parentNames: [],
        parentNamesOnInvoice: false,
        email: "",
        emailOnInvoice: false,
        phone: "",
        phoneOnInvoice: false,
        customDetails: [],
      }),
    ).toEqual([]);
  });
});
