import { randomUUID } from "expo-crypto";
import { localDate } from "@/utils/local-date";
import { createDatabase, LOCAL_OWNER_ID } from "./database";
import { PracticeStore } from "./practice-store";

/** The app's one store, on the phone's local database. Started by the root layout. */
export const practiceStore = new PracticeStore(createDatabase(), {
  ownerId: LOCAL_OWNER_ID,
  now: () => new Date().toISOString(),
  today: () => localDate(new Date()),
  newId: () => randomUUID(),
});
