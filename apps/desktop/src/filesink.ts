import type { Result } from "@patternforge/shared";
import { err, ok } from "@patternforge/shared";
import type {
  FileSink,
  FileSinkError,
  FileWriteResult,
} from "@patternforge/export-engine";

/**
 * Desktop FileSink (Phase 5): tries the Tauri native dialog + filesystem
 * (temp file + atomic rename) when the plugins are available, otherwise
 * falls back to an anchor download that also works inside the webview.
 * This module is DOM/Tauri-only and is never imported by Node tests.
 */

interface TauriFs {
  remove: (path: string) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
}

interface TauriDialog {
  save: (options: {
    defaultPath?: string;
    filters?: Array<{ extensions: string[]; name: string }>;
  }) => Promise<string | null>;
}

async function loadTauri(): Promise<{
  dialog: TauriDialog;
  fs: TauriFs;
} | null> {
  try {
    const [fs, dialog] = await Promise.all([
      import("@tauri-apps/plugin-fs"),
      import("@tauri-apps/plugin-dialog"),
    ]);
    return {
      dialog: dialog as unknown as TauriDialog,
      fs: fs as unknown as TauriFs,
    };
  } catch {
    return null;
  }
}

function downloadFallback(
  filename: string,
  bytes: Uint8Array,
): Result<FileWriteResult, FileSinkError> {
  try {
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy.buffer as ArrayBuffer], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return ok({ byteCount: bytes.length, filename });
  } catch (error) {
    return err({
      code: "FILESYSTEM_ERROR",
      message: error instanceof Error ? error.message : "Download failed.",
    });
  }
}

export class DesktopFileSink implements FileSink {
  async writeFile(
    filename: string,
    bytes: Uint8Array,
  ): Promise<Result<FileWriteResult, FileSinkError>> {
    const tauri = await loadTauri();
    if (tauri === null) {
      return downloadFallback(filename, bytes);
    }
    try {
      const dot = filename.lastIndexOf(".");
      const ext = dot >= 0 ? filename.slice(dot + 1) : "";
      const picked = await tauri.dialog.save({
        defaultPath: filename,
        filters:
          ext.length > 0
            ? [{ extensions: [ext], name: "PatternForge export" }]
            : undefined,
      });
      if (picked === null) {
        return err({ code: "CANCELLED", message: "Save dialog cancelled." });
      }
      // Atomic-ish write: temp file in the same directory + rename.
      // On any failure the temp file is removed best-effort so no
      // partial file is left behind, then the download fallback engages.
      const temp = `${picked}.patternforge-tmp`;
      try {
        await tauri.fs.writeFile(temp, bytes);
        try {
          await tauri.fs.rename(temp, picked);
        } catch {
          try {
            await tauri.fs.remove(temp);
          } catch {
            // Best-effort cleanup only; fall through to direct write.
          }
          await tauri.fs.writeFile(picked, bytes);
        }
      } catch {
        try {
          await tauri.fs.remove(temp);
        } catch {
          // Best-effort cleanup only; fall through to download fallback.
        }
        return downloadFallback(filename, bytes);
      }
      return ok({ byteCount: bytes.length, filename: picked });
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: unknown }).code === "CANCELLED"
      ) {
        return err({ code: "CANCELLED", message: "Save dialog cancelled." });
      }
      return downloadFallback(filename, bytes);
    }
  }
}
