import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION_CONFIG } from "@patternforge/core";
import {
  deriveBatchSeed,
  MAX_BATCH_COUNT,
  runBatch,
  validateBatchRequest,
  type BatchItemResult,
} from "@patternforge/batch-engine";

describe("batch seeds", () => {
  it("derives deterministic sequences with mod-2^32 wrap", () => {
    expect(MAX_BATCH_COUNT).toBe(100);
    const seeds = [0, 1, 2, 3].map((i) =>
      ((): string => {
        const r = deriveBatchSeed(1000, i);
        if (!r.ok) {
          throw new Error("seed failed");
        }
        return r.value;
      })(),
    );
    expect(seeds).toEqual(["1000", "1001", "1002", "1003"]);
    const wrapped = deriveBatchSeed(0xffff_ffff, 1);
    expect(wrapped.ok && wrapped.value).toBe("0");
    const again = deriveBatchSeed(1000, 2);
    expect(again.ok && again.value).toBe("1002");
    expect(deriveBatchSeed("nope", 0).ok).toBe(false);
  });
});

describe("batch validation", () => {
  it("accepts valid requests and rejects bad counts/seeds", () => {
    const valid = validateBatchRequest({
      baseConfig: DEFAULT_GENERATION_CONFIG,
      count: 5,
      format: "png",
      startSeed: 1000,
    });
    expect(valid.ok).toBe(true);
    expect(
      validateBatchRequest({
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 0,
        format: "png",
        startSeed: 1,
      }).ok,
    ).toBe(false);
    expect(
      validateBatchRequest({
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 101,
        format: "png",
        startSeed: 1,
      }).ok,
    ).toBe(false);
    expect(
      validateBatchRequest({
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 3,
        format: "bmp",
        startSeed: 1,
      }).ok,
    ).toBe(false);
    expect(
      validateBatchRequest({
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 3,
        format: "png",
        startSeed: "",
      }).ok,
    ).toBe(false);
    expect(
      validateBatchRequest({
        baseConfig: { ...DEFAULT_GENERATION_CONFIG, density: -1 },
        count: 3,
        format: "png",
        startSeed: 1,
      }).ok,
    ).toBe(false);
  });
});

describe("batch runner", () => {
  function producer(results: Map<number, BatchItemResult>) {
    return (index: number, seed: number | string): BatchItemResult => {
      const preset = results.get(index);
      if (preset !== undefined) {
        return preset;
      }
      return { checksum: `chk-${seed}`, index, seed: String(seed) };
    };
  }

  it("runs sequentially in order with progress", async () => {
    const seen: number[] = [];
    const progress: number[] = [];
    const summary = await runBatch(
      {
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 4,
        format: "png",
        quality: 90,
        startSeed: 1000,
      },
      (index, seed) => {
        seen.push(index);
        return { checksum: `c${seed}`, index, seed: String(seed) };
      },
      undefined,
      (p) => {
        progress.push(p.completed);
      },
    );
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(summary.results.map((r) => r.seed)).toEqual([
      "1000",
      "1001",
      "1002",
      "1003",
    ]);
    expect(summary.succeeded).toBe(4);
    expect(summary.failed).toBe(0);
    expect(summary.cancelled).toBe(false);
    expect(progress).toEqual([1, 2, 3, 4]);
  });

  it("isolates item failures and continues", async () => {
    const summary = await runBatch(
      {
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 3,
        format: "png",
        quality: 90,
        startSeed: 7,
      },
      producer(new Map([[1, { error: "boom", index: 1, seed: "8" }]])),
    );
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.results[1]?.error).toBe("boom");
    expect(summary.results[2]?.checksum).toBe("chk-9");
  });

  it("stops at cancellation without partial success", async () => {
    let calls = 0;
    const summary = await runBatch(
      {
        baseConfig: DEFAULT_GENERATION_CONFIG,
        count: 5,
        format: "png",
        quality: 90,
        startSeed: 1,
      },
      () => {
        calls += 1;
        return { index: calls - 1, seed: "x" };
      },
      {
        isCancelled: () => calls >= 2,
        operationId: "op" as never,
      },
    );
    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(2);
    expect(summary.succeeded).toBe(2);
  });

  it("reproduces identical sequences on rerun", async () => {
    const run = () =>
      runBatch(
        {
          baseConfig: DEFAULT_GENERATION_CONFIG,
          count: 3,
          format: "png",
          quality: 90,
          startSeed: "42",
        },
        producer(new Map()),
      );
    const first = await run();
    const second = await run();
    expect(first.results).toEqual(second.results);
  });
});
