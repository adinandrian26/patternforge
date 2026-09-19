import { useState } from "preact/hooks";
import type { GenerationConfig, GenerationResult } from "@patternforge/core";
import type { FileSink } from "@patternforge/export-engine";
import type { RasterImage } from "@patternforge/renderer-engine";

import { describeExport, prepareTileExport } from "../exporting";

export interface ExportPanelProps {
  readonly config: GenerationConfig | null;
  readonly pattern: GenerationResult | null;
  readonly sink: FileSink;
  readonly tile: RasterImage | null;
}

/** Export tab: format/quality/filename + status. No batch here. */
export function ExportPanel({ config, pattern, sink, tile }: ExportPanelProps) {
  const [format, setFormat] = useState<"png" | "jpeg" | "svg">("png");
  const [quality, setQuality] = useState(90);
  const [filename, setFilename] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (config === null || pattern === null || tile === null) {
    return (
      <section className="control-panel" aria-label="Export">
        <h2>Export</h2>
        <p className="hint-text">
          Generate a pattern first — export encodes the current preview tile.
        </p>
      </section>
    );
  }

  const currentConfig = config;
  const currentPattern = pattern;
  const currentTile = tile;

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    setStatus(null);
    try {
      const prepared = prepareTileExport(
        currentTile,
        currentPattern,
        currentConfig,
        { filename, format, quality },
      );
      if (!prepared.ok) {
        setStatus(`Error: ${prepared.error.message}`);
        return;
      }
      const written = await sink.writeFile(
        prepared.value.file.filename,
        prepared.value.file.bytes,
      );
      if (!written.ok) {
        setStatus(
          written.error.code === "CANCELLED"
            ? "Save cancelled."
            : `Error: ${written.error.message}`,
        );
        return;
      }
      setStatus(`Saved ${describeExport(prepared.value.file)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="control-panel" aria-label="Export">
      <h2>Export</h2>
      <div className="control-stack">
        <label className="control-group">
          Format
          <select
            value={format}
            onChange={(event) =>
              setFormat(event.currentTarget.value as "png" | "jpeg" | "svg")
            }
          >
            <option value="png">PNG (lossless RGBA)</option>
            <option value="jpeg">JPEG (lossy, quality)</option>
            <option value="svg">SVG (vector)</option>
          </select>
        </label>
        {format === "jpeg" ? (
          <label className="control-group">
            Quality: {quality}
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={quality}
              onInput={(event) => setQuality(Number(event.currentTarget.value))}
            />
          </label>
        ) : null}
        <label className="control-group">
          Filename (empty = deterministic)
          <input
            type="text"
            value={filename}
            placeholder={`patternforge-${String(currentConfig.seed)}-${currentConfig.width}x${currentConfig.height}`}
            onInput={(event) => setFilename(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="generate-button"
          onClick={() => void handleExport()}
          disabled={busy}
        >
          {busy ? "Exporting…" : "Export"}
        </button>
        {status === null ? null : <p className="hint-text">{status}</p>}
        <p className="hint-text">
          PNG/JPEG encode the rendered {currentTile.width}×{currentTile.height}{" "}
          tile. SVG serializes pattern vectors with 9 seamless copies. Files
          save via native dialog when available, otherwise browser download.
        </p>
      </div>
    </section>
  );
}
