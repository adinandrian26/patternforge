import { err, ok, type Result } from "@patternforge/shared";

import type { KeyValueStorage } from "./presets";

/**
 * Recent-pattern history. Entries carry checksum, seed, a configuration
 * summary, and a creation timestamp that is UI metadata ONLY — it never
 * enters the generator, so history cannot alter deterministic output.
 * Bounded to MAX_HISTORY_ENTRIES (oldest evicted first).
 */

export const MAX_HISTORY_ENTRIES = 50;
const HISTORY_KEY = "patternforge.history";

export interface HistoryEntry {
  readonly checksum: string;
  readonly createdAt: string;
  readonly seed: string;
  readonly summary: string;
}

export type HistoryErrorCode = "INVALID_ENTRY" | "STORAGE_ERROR";

export interface HistoryError {
  readonly code: HistoryErrorCode;
  readonly message: string;
}

function historyError(
  code: HistoryErrorCode,
  message: string,
): Result<never, HistoryError> {
  return err({ code, message });
}

export function validateHistoryEntry(
  input: unknown,
): Result<HistoryEntry, HistoryError> {
  if (typeof input !== "object" || input === null) {
    return historyError("INVALID_ENTRY", "History entry must be an object.");
  }
  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.checksum !== "string" ||
    candidate.checksum.length === 0 ||
    typeof candidate.seed !== "string" ||
    candidate.seed.length === 0 ||
    typeof candidate.summary !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return historyError(
      "INVALID_ENTRY",
      "History entry needs checksum, seed, summary, and createdAt strings.",
    );
  }
  return ok({
    checksum: candidate.checksum,
    createdAt: candidate.createdAt,
    seed: candidate.seed,
    summary: candidate.summary,
  });
}

function readAll(storage: KeyValueStorage): HistoryEntry[] {
  const raw = storage.getItem(HISTORY_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const entries: HistoryEntry[] = [];
    for (const item of parsed) {
      const validated = validateHistoryEntry(item);
      if (validated.ok) {
        entries.push(validated.value);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export class HistoryStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  /** Newest first. Corrupt entries are skipped, never thrown. */
  list(): HistoryEntry[] {
    return readAll(this.storage);
  }

  push(entry: HistoryEntry): Result<HistoryEntry, HistoryError> {
    const validated = validateHistoryEntry(entry);
    if (!validated.ok) {
      return validated;
    }
    const next = [validated.value, ...readAll(this.storage)].slice(
      0,
      MAX_HISTORY_ENTRIES,
    );
    try {
      this.storage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      return historyError("STORAGE_ERROR", "History storage write failed.");
    }
    return ok(validated.value);
  }

  clear(): void {
    this.storage.removeItem(HISTORY_KEY);
  }
}
