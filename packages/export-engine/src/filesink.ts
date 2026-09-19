import { err, ok, type Result } from "@patternforge/shared";

/**
 * FileSink abstraction: export core stays browser- and Tauri-independent.
 * Adapters live outside this package (desktop FileSink, tests).
 */

export interface FileWriteResult {
  readonly byteCount: number;
  readonly filename: string;
}

export interface FileSinkError {
  readonly code: "FILESYSTEM_ERROR" | "CANCELLED";
  readonly message: string;
}

export interface FileSink {
  writeFile(
    filename: string,
    bytes: Uint8Array,
  ): Promise<Result<FileWriteResult, FileSinkError>>;
}

/** In-memory sink for tests and dry runs. */
export class MemoryFileSink implements FileSink {
  private readonly files = new Map<string, Uint8Array>();

  writeFile(
    filename: string,
    bytes: Uint8Array,
  ): Promise<Result<FileWriteResult, FileSinkError>> {
    if (filename.length === 0) {
      return Promise.resolve(
        err({ code: "FILESYSTEM_ERROR", message: "Empty filename." }),
      );
    }
    this.files.set(filename, new Uint8Array(bytes));
    return Promise.resolve(ok({ byteCount: bytes.length, filename }));
  }

  readFile(filename: string): Uint8Array | undefined {
    const bytes = this.files.get(filename);
    return bytes === undefined ? undefined : new Uint8Array(bytes);
  }

  listFiles(): readonly string[] {
    return [...this.files.keys()];
  }
}
