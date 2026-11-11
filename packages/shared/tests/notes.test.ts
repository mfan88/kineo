import { describe, expect, it } from "vitest";
import {
  NoteRuleError,
  addToNote,
  isNoteLocked,
  replaceNote,
  visitSchema,
  type Visit,
} from "../src/index";

const created = "2026-11-01T09:00:00Z";
const now = "2026-11-11T10:00:00Z";

// Made-up test data only.
const visit: Visit = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  ownerId: "user_test_owner",
  patientId: "8f3b0b8e-2c1d-4a8e-9f1a-1b2c3d4e5f60",
  visitDate: "2026-11-01",
  note: "Shoulder flexion 120°.",
  noteEditedAt: created,
  invoiceId: null,
  createdAt: created,
  updatedAt: created,
};
const empty: Visit = { ...visit, note: "" };

describe("isNoteLocked", () => {
  it("is unlocked with no invoice, a draft or a sent invoice", () => {
    expect(isNoteLocked(null)).toBe(false);
    expect(isNoteLocked("draft")).toBe(false);
    expect(isNoteLocked("sent")).toBe(false);
  });

  it("is locked on a paid invoice", () => {
    expect(isNoteLocked("paid")).toBe(true);
  });
});

describe("addToNote", () => {
  it("appends after a blank line and sets the edit timestamp", () => {
    const result = addToNote(visit, "Added theraband exercises.", null, now);
    expect(result.note).toBe("Shoulder flexion 120°.\n\nAdded theraband exercises.");
    expect(result.noteEditedAt).toBe(now);
    expect(result.updatedAt).toBe(now);
    expect(visitSchema.safeParse(result).success).toBe(true);
  });

  it("doesn't add a separator to an empty note", () => {
    expect(addToNote(empty, "First entry.", null, now).note).toBe("First entry.");
    expect(addToNote({ ...visit, note: "  \n " }, "First entry.", null, now).note).toBe(
      "First entry.",
    );
  });

  it("trims the added text and trailing space on the existing note", () => {
    expect(addToNote({ ...visit, note: "Line one.\n\n" }, "  Line two.  ", null, now).note).toBe(
      "Line one.\n\nLine two.",
    );
  });

  it("keeps everything else and doesn't change the visit passed in", () => {
    const result = addToNote(visit, "More.", "draft", now);
    expect(result).toEqual({
      ...visit,
      note: "Shoulder flexion 120°.\n\nMore.",
      noteEditedAt: now,
      updatedAt: now,
    });
    expect(visit.note).toBe("Shoulder flexion 120°.");
    expect(visit.noteEditedAt).toBe(created);
  });

  it("refuses empty text", () => {
    expect(() => addToNote(visit, "", null, now)).toThrow(
      new NoteRuleError("Type something to add to the note."),
    );
    expect(() => addToNote(visit, "   \n", null, now)).toThrow(NoteRuleError);
  });

  it("works on a sent invoice but is locked on a paid one", () => {
    expect(addToNote(visit, "More.", "sent", now).note).toContain("More.");
    expect(() => addToNote(visit, "More.", "paid", now)).toThrow(
      new NoteRuleError("This note is on a paid invoice and can't be changed."),
    );
  });
});

describe("replaceNote", () => {
  it("overwrites the note and sets the edit timestamp", () => {
    const result = replaceNote(visit, "New assessment.", null, now);
    expect(result).toEqual({
      ...visit,
      note: "New assessment.",
      noteEditedAt: now,
      updatedAt: now,
    });
  });

  it("clears the note with empty text", () => {
    expect(replaceNote(visit, "", null, now).note).toBe("");
    expect(replaceNote(visit, "   ", "draft", now).note).toBe("");
  });

  it("trims the new text", () => {
    expect(replaceNote(visit, "  Trimmed.\n", null, now).note).toBe("Trimmed.");
  });

  it("works on a sent invoice but is locked on a paid one", () => {
    expect(replaceNote(visit, "Updated.", "sent", now).note).toBe("Updated.");
    expect(() => replaceNote(visit, "Updated.", "paid", now)).toThrow(NoteRuleError);
  });
});
