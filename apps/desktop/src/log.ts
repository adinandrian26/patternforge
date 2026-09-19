/**
 * Local development logger (Phase 20). No telemetry, no persistence:
 * debug lines only in Vite dev, silent in production builds.
 */
export function devLog(...args: readonly unknown[]): void {
  const env =
    typeof import.meta === "object" &&
    import.meta !== null &&
    "env" in import.meta
      ? (import.meta as { env?: { DEV?: boolean } }).env
      : undefined;
  if (env?.DEV === true) {
    console.log(...args);
  }
}
