import { PRNG_ALGORITHM_VERSION } from "@patternforge/shared";

import type { CanonicalSeed } from "./seed";

export const PRNG_ALGORITHM = "mulberry32" as const;
export const UINT32_RANGE = 0x1_0000_0000;

export interface Rng {
  next(): number;
  nextFloat(): number;
  nextInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: CanonicalSeed): Rng {
  if (seed.algorithmVersion !== PRNG_ALGORITHM_VERSION) {
    throw new RangeError(
      `Unsupported PRNG algorithm version: ${seed.algorithmVersion}.`,
    );
  }

  let state = Number(BigInt(seed.value)) >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  function nextFloat(): number {
    return next() / UINT32_RANGE;
  }

  function nextInt(min: number, max: number): number {
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min >= max ||
      max - min > UINT32_RANGE
    ) {
      throw new RangeError(
        "nextInt requires safe integer bounds with min < max and a range no larger than uint32.",
      );
    }

    return min + Math.floor(nextFloat() * (max - min));
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("pick requires at least one item.");
    }

    return items[nextInt(0, items.length)] as T;
  }

  return { next, nextFloat, nextInt, pick };
}
