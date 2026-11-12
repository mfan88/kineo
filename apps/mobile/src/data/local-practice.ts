import { randomUUID } from "expo-crypto";
import { localDate } from "@/utils/local-date";
import { createDatabase } from "./database";
import { PracticeStore } from "./practice-store";

/** The signed-in practitioner's store, on their own local database. */
export function createPracticeStore(userId: string): PracticeStore {
  return new PracticeStore(createDatabase(userId), {
    ownerId: userId,
    now: () => new Date().toISOString(),
    today: () => localDate(new Date()),
    newId: () => randomUUID(),
  });
}
