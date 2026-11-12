import { BOOLEAN_COLUMNS } from "@kineo/data";
import type { PowerSyncDatabase } from "@powersync/react-native";
import { randomUUID } from "expo-crypto";
import { API_URL, Connector, type TokenSource } from "@/sync/connector";
import { Uploader } from "@/sync/upload";
import { localDate } from "@/utils/local-date";
import { createDatabase } from "./database";
import { PracticeStore } from "./practice-store";

/** The signed-in practitioner's local database, its store, and its sync connector. */
export interface LocalPractice {
  db: PowerSyncDatabase;
  store: PracticeStore;
  connector: Connector;
}

/** Opens nothing yet: the store starts reading, and sync connects, when asked. */
export function createLocalPractice(userId: string, tokens: TokenSource): LocalPractice {
  const db = createDatabase(userId);
  const store = new PracticeStore(db, {
    ownerId: userId,
    now: () => new Date().toISOString(),
    today: () => localDate(new Date()),
    newId: () => randomUUID(),
  });
  const uploader = new Uploader(API_URL, BOOLEAN_COLUMNS, (url, init) => fetch(url, init));
  return { db, store, connector: new Connector(tokens, uploader) };
}
