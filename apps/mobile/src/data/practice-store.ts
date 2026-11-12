import {
  PracticeWriter,
  RowError,
  watchPracticeData,
  type PracticeData,
  type WatchableDatabase,
  type WritableDatabase,
  type WriteEnvironment,
} from "@kineo/data";

/** What the store needs from the local database (PowerSync's database has all of it). */
export type PracticeDatabase = WatchableDatabase &
  WritableDatabase & {
    /** Opens the database; safe to call again. */
    init(): Promise<void>;
  };

/**
 * Where the first read stands: `loading` until every table has been read, then
 * `ready` with the data (kept up to date), or `failed` if the database couldn't
 * be opened or read.
 */
export type PracticeState =
  { status: "loading" } | { status: "ready"; data: PracticeData } | { status: "failed" };

const LOADING: PracticeState = { status: "loading" };
const FAILED: PracticeState = { status: "failed" };

/**
 * The practice as the screens see it, backed by the phone's local database: reads
 * are watched (so every local write, and later sync, shows straight away) and
 * writes go through PracticeWriter's rules.
 */
export class PracticeStore {
  /** Makes changes, following the rules in `@kineo/shared`. */
  readonly writer: PracticeWriter;
  private state: PracticeState = LOADING;
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | null = null;
  /** Counts starts, so a slow open from an earlier start can't change the state. */
  private run = 0;

  constructor(
    private readonly db: PracticeDatabase,
    private readonly env: WriteEnvironment,
  ) {
    this.writer = new PracticeWriter(db, env);
  }

  /** Opens the database and starts watching it. Call again to try again after a failure. */
  start(): void {
    this.stop();
    const run = this.run;
    this.setState(LOADING);
    this.stopWatching = watchPracticeData(
      this.db,
      this.env.ownerId,
      {
        onData: (data) => this.setState({ status: "ready", data }),
        onError: (error) => {
          // A row that couldn't be read is left out and the rest still arrives. A
          // failed query before anything has been shown means there's nothing to show.
          if (error instanceof RowError) return;
          if (this.state.status === "loading") this.setState(FAILED);
        },
      },
      this.env.now,
    );
    this.db.init().catch(() => {
      // Never the error's contents: they can hold patient details.
      if (run === this.run && this.state.status === "loading") this.setState(FAILED);
    });
  }

  stop(): void {
    this.run += 1;
    this.stopWatching?.();
    this.stopWatching = null;
  }

  getState = (): PracticeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(next: PracticeState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
