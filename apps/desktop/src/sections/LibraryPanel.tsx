import { useState } from "preact/hooks";
import type { GenerationConfig } from "@patternforge/core";
import { BUILTIN_TEMPLATES, type PresetStore } from "@patternforge/library";

export interface LibraryPanelProps {
  readonly config: GenerationConfig | null;
  readonly onLoad: (config: GenerationConfig) => void;
  readonly store: PresetStore;
}

/** Presets: save current, load, duplicate, rename, delete + templates. */
export function LibraryPanel({ config, onLoad, store }: LibraryPanelProps) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<string[]>(() => store.listNames());
  const [status, setStatus] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = (): void => setNames(store.listNames());

  const showStatus = (message: string): void => setStatus(message);

  const handleSave = (): void => {
    if (config === null) {
      showStatus("Generate a pattern first.");
      return;
    }
    const saved = store.save({
      config,
      name,
      schemaVersion: "preset-v1",
    });
    if (!saved.ok) {
      showStatus(`Error: ${saved.error.message}`);
      return;
    }
    setName("");
    refresh();
    showStatus(`Saved preset "${saved.value.name}".`);
  };

  const handleLoad = (presetName: string): void => {
    const loaded = store.load(presetName);
    if (!loaded.ok) {
      showStatus(`Error: ${loaded.error.message}`);
      return;
    }
    onLoad(loaded.value.config);
    showStatus(`Loaded preset "${presetName}". Press Generate.`);
  };

  const handleDelete = (presetName: string): void => {
    const deleted = store.delete(presetName);
    if (!deleted.ok) {
      showStatus(`Error: ${deleted.error.message}`);
      return;
    }
    refresh();
    showStatus(`Deleted preset "${presetName}".`);
  };

  const handleDuplicate = (presetName: string): void => {
    const copyName = `${presetName} copy`;
    const duplicated = store.duplicate(presetName, copyName);
    if (!duplicated.ok) {
      showStatus(`Error: ${duplicated.error.message}`);
      return;
    }
    refresh();
    showStatus(`Duplicated as "${copyName}".`);
  };

  const handleRename = (presetName: string): void => {
    if (renaming !== presetName) {
      setRenaming(presetName);
      setRenameValue(presetName);
      return;
    }
    const result = store.rename(presetName, renameValue);
    if (!result.ok) {
      showStatus(`Error: ${result.error.message}`);
      return;
    }
    setRenaming(null);
    refresh();
    showStatus(`Renamed to "${result.value.name}".`);
  };

  return (
    <div className="tab-columns">
      <section className="control-panel" aria-label="Presets">
        <h2>Presets</h2>
        <div className="control-stack">
          <label className="control-group">
            Preset name
            <input
              type="text"
              value={name}
              placeholder="My preset"
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <button type="button" onClick={handleSave}>
            Save current as preset
          </button>
          {names.length === 0 ? (
            <p className="hint-text">No presets yet.</p>
          ) : (
            <ul className="result-list">
              {names.map((presetName) => (
                <li key={presetName}>
                  {renaming === presetName ? (
                    <span className="seed-row">
                      <input
                        type="text"
                        value={renameValue}
                        onInput={(event) =>
                          setRenameValue(event.currentTarget.value)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(presetName)}
                      >
                        OK
                      </button>
                    </span>
                  ) : (
                    <span className="preset-row">
                      <strong>{presetName}</strong>
                      <span className="preset-actions">
                        <button
                          type="button"
                          onClick={() => handleLoad(presetName)}
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRename(presetName)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(presetName)}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(presetName)}
                        >
                          Delete
                        </button>
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {status === null ? null : <p className="hint-text">{status}</p>}
        </div>
      </section>
      <section className="control-panel" aria-label="Templates">
        <h2>Templates</h2>
        <div className="control-stack">
          {BUILTIN_TEMPLATES.map((template) => (
            <div key={template.id} className="template-row">
              <div>
                <strong>{template.name}</strong>
                <p className="hint-text">{template.description}</p>
              </div>
              <button type="button" onClick={() => onLoad(template.config)}>
                Use
              </button>
            </div>
          ))}
          <p className="hint-text">
            Templates are fixed deterministic configs — no randomness, no output
            stored. Applying loads the config; press Generate.
          </p>
        </div>
      </section>
    </div>
  );
}
