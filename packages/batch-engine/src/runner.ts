import type { CancellationSignal } from "@patternforge/shared";

import { deriveBatchSeed } from "./request";
import type {
  BatchItemProducer,
  BatchItemResult,
  BatchProgressCallback,
  BatchRequest,
  BatchSummary,
} from "./types";

/**
 * Run a batch strictly sequentially (concurrency = 1). Each item:
 * derive seed -> produce -> record -> release -> checkpoint.
 * Item failures are isolated (recorded, batch continues). Cancellation
 * stops before the next item; completed items keep their results, no
 * partial item is reported as success.
 */
export async function runBatch(
  request: BatchRequest,
  produceItem: BatchItemProducer,
  signal?: CancellationSignal,
  onProgress?: BatchProgressCallback,
): Promise<BatchSummary> {
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let cancelled = false;

  for (let index = 0; index < request.count; index += 1) {
    if (signal?.isCancelled() === true) {
      cancelled = true;
      break;
    }
    const seedResult = deriveBatchSeed(request.startSeed, index);
    if (!seedResult.ok) {
      failed += 1;
      const failedItem = { error: seedResult.error.message, index, seed: "" };
      results.push(failedItem);
      onProgress?.({ completed: index + 1, total: request.count });
      continue;
    }
    try {
      const item = await produceItem(index, seedResult.value);
      results.push(item);
      if (item.error === undefined) {
        succeeded += 1;
      } else {
        failed += 1;
      }
      onProgress?.({
        completed: index + 1,
        currentFilename: item.filename,
        total: request.count,
      });
    } catch (error) {
      failed += 1;
      results.push({
        error: error instanceof Error ? error.message : "Unknown batch error.",
        index,
        seed: seedResult.value,
      });
      onProgress?.({ completed: index + 1, total: request.count });
    }
  }

  return {
    cancelled,
    failed,
    results,
    succeeded,
    total: request.count,
  };
}
