import { useState } from "preact/hooks";
import type { GenerationConfig } from "@patternforge/core";
import type { FileSink } from "@patternforge/export-engine";
import {
  parseProjectFile as parseProject,
  PROJECT_FILE_EXTENSION,
  serializeProject as serialize,
} from "@patternforge/library";

export interface ProjectPanelProps {
  readonly config: GenerationConfig | null;
  readonly onCustomPalette: (hex: string) => void;
  readonly onLoad: (config: GenerationConfig) => void;
  readonly sink: FileSink;
}

/** Local project save/load (.patternforge JSON) + palette text import. */
export function ProjectPanel({
  config,
  onCustomPalette,
  onLoad,
  sink,
}: ProjectPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [paletteText, setPaletteText] = useState("#ff0000, #00ff00, #0000ff");
  const [busy, setBusy] = useState(false);

  const handleSave = async (): Promise<void> => {
    if (config === null) {
      setStatus("Generate a pattern first.");
      return;
    }
    setBusy(true);
    try {
      const text = serialize(config);
      const bytes = new TextEncoder().encode(text);
      const filename = `patternforge-project-${String(config.seed)}${PROJECT_FILE_EXTENSION}`;
      const written = await sink.writeFile(filename, bytes);
      setStatus(
        written.ok
          ? `Saved ${written.value.filename} (${written.value.byteCount} B).`
          : `Error: ${written.error.message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) {
      return;
    }
    const text = await file.text();
    const parsed = parseProject(text);
    if (!parsed.ok) {
      setStatus(`Invalid project: ${parsed.error.message}`);
      return;
    }
    onLoad(parsed.value.config);
    setStatus("Project loaded — press Generate to render.");
  };

  return (
    <div className="tab-columns">
      <section className="control-panel" aria-label="Project">
        <h2>Project file</h2>
        <div className="control-stack">
          <button
            type="button"
            className="generate-button"
            onClick={() => void handleSave()}
            disabled={busy || config === null}
          >
            {busy ? "Saving…" : "Save project"}
          </button>
          <label className="control-group">
            Open {PROJECT_FILE_EXTENSION} file
            <input
              type="file"
              accept={PROJECT_FILE_EXTENSION}
              onChange={(event) => {
                const files = event.currentTarget.files;
                void handleFile(
                  files !== null ? (files[0] as File | undefined) : undefined,
                );
                event.currentTarget.value = "";
              }}
            />
          </label>
          {status === null ? null : <p className="hint-text">{status}</p>}
          <p className="hint-text">
            Projects hold a versioned generation config only — validated on
            open, never executed. Reloading + Generate reproduces the same
            checksum.
          </p>
        </div>
      </section>
      <section className="control-panel" aria-label="Palette import">
        <h2>Palette import</h2>
        <div className="control-stack">
          <label className="control-group">
            Hex colors (comma separated)
            <input
              type="text"
              value={paletteText}
              onInput={(event) => setPaletteText(event.currentTarget.value)}
            />
          </label>
          <button type="button" onClick={() => onCustomPalette(paletteText)}>
            Use as custom palette
          </button>
          <p className="hint-text">
            Imported colors are validated before entering the generator.
          </p>
        </div>
      </section>
    </div>
  );
}
