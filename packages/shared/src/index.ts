export type Brand<T, TBrand extends string> = T & {
  readonly __brand: TBrand;
};

export type AlgorithmVersion = Brand<string, "AlgorithmVersion">;
export type SchemaVersion = Brand<string, "SchemaVersion">;
export type PackageVersion = Brand<string, "PackageVersion">;
export type EntityId = Brand<string, "EntityId">;
export type OperationId = Brand<string, "OperationId">;

export interface Seed {
  readonly value: string;
  readonly algorithmVersion: AlgorithmVersion;
}

export interface CancellationSignal {
  readonly operationId: OperationId;
  isCancelled(): boolean;
}

export type FoundationErrorCode =
  | "INVALID_INPUT"
  | "RESOURCE_LIMIT"
  | "UNSUPPORTED_OPERATION"
  | "CANCELLED"
  | "INTERNAL_FAILURE";

export interface FoundationError {
  readonly code: FoundationErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, boolean | number | string | null>>;
}

export type Result<T, E> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: E;
    };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export const PATTERN_ALGORITHM_VERSION = "pattern-v1" as AlgorithmVersion;
export const PRNG_ALGORITHM_VERSION = "prng-v1" as AlgorithmVersion;
export const ALGORITHM_VERSION = PATTERN_ALGORITHM_VERSION;
export const SCHEMA_VERSION = "schema-v1" as SchemaVersion;
export const PACKAGE_VERSION = "0.1.0" as PackageVersion;
export const SHARED_PACKAGE_NAME = "@patternforge/shared" as const;
