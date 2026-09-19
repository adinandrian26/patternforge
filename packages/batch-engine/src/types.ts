import type { GenerationConfig } from "@patternforge/core";
import type { ExportFormat } from "@patternforge/export-engine";
import type { SeedInput } from "@patternforge/pattern-engine";

/**
 * Bounded batch generation. Concurrency is fixed at 1 (strictly
 * sequential): no parallel renders, peak memory stays at one item plus
 * encoder buffers. `MAX_BATCH_COUNT` caps total work before allocation.
 */
export const MAX_BATCH_COUNT = 100;

export interface BatchRequest {
  readonly baseConfig: GenerationConfig;
  readonly count: number;
  readonly format: ExportFormat;
  readonly quality: number;
  readonly startSeed: SeedInput;
}

export interface BatchRequestInput {
  readonly baseConfig?: unknown;
  readonly count?: unknown;
  readonly format?: unknown;
  readonly quality?: unknown;
  readonly startSeed?: unknown;
}

export type BatchErrorCode =
  | "INVALID_COUNT"
  | "INVALID_SEED"
  | "INVALID_CONFIG"
  | "INVALID_FORMAT"
  | "CANCELLED";

export interface BatchError {
  readonly code: BatchErrorCode;
  readonly message: string;
  readonly details?:
    | Readonly<Record<string, boolean | number | string | null>>
    | null
    | undefined;
}

/** Per-item outcome. `error` set on isolated failure; batch continues. */
export interface BatchItemResult {
  readonly byteCount?: number;
  readonly checksum?: string;
  readonly error?: string;
  readonly filename?: string;
  readonly index: number;
  readonly seed: string;
}

export interface BatchSummary {
  readonly cancelled: boolean;
  readonly failed: number;
  readonly results: readonly BatchItemResult[];
  readonly succeeded: number;
  readonly total: number;
}

export interface BatchProgress {
  readonly completed: number;
  readonly currentFilename?: string;
  readonly total: number;
}

/** Injected item producer (desktop wires generator+renderer+exporter). */
export type BatchItemProducer = (
  index: number,
  seed: SeedInput,
) => Promise<BatchItemResult> | BatchItemResult;

export type BatchProgressCallback = (progress: BatchProgress) => void;
