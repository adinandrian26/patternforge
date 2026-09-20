import { useCallback, useMemo, useState } from "preact/hooks";
import {
  colorToHex,
  DEFAULT_GENERATION_CONFIG,
  radiansToDegrees,
  type GenerationConfig,
} from "@patternforge/core";
import { AppShell, PreviewCanvas } from "@patternforge/ui";
import {
  HistoryStore,
  MemoryStorage,
  PresetStore,
  type KeyValueStorage,
} from "@patternforge/library";
import {
  CUSTOM_PALETTE_ID,
  DEFAULT_UI_FORM,
  PALETTE_PRESETS,
  formatConfigError,
  normalizeUiForm,
  type UiFormState,
} from "./config";
import { devLog } from "./log";
import { DesktopFileSink } from "./filesink";
import {
  formatPipelineError,
  runGenerationPipeline,
  type PreviewData,
} from "./pipeline";
import { ExportPanel } from "./sections/ExportPanel";
import { BatchPanel } from "./sections/BatchPanel";
import { LibraryPanel } from "./sections/LibraryPanel";
import { HistoryPanel } from "./sections/HistoryPanel";
import { AiPanel } from "./sections/AiPanel";
import { ProjectPanel } from "./sections/ProjectPanel";

const PREVIEW_MIN = 16;
const PREVIEW_MAX = 512;

type TabId =
  | "generate"
  | "batch"
  | "library"
  | "history"
  | "ai"
  | "export"
  | "project";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "generate", label: "Generator" },
  { id: "batch", label: "Batch" },
  { id: "library", label: "Presets" },
  { id: "history", label: "History" },
  { id: "ai", label: "AI" },
  { id: "export", label: "Export" },
  { id: "project", label: "Project" },
];

function clampPreviewSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 128;
  }
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.floor(value)));
}

function createWebStorage(): KeyValueStorage {
  try {
    const backend = globalThis.localStorage;
    backend.getItem("__patternforge_probe__");
    return {
      getItem: (key) => {
        try {
          return backend.getItem(key);
        } catch {
          return null;
        }
      },
      removeItem: (key) => {
        try {
          backend.removeItem(key);
        } catch {
          return;
        }
      },
      setItem: (key, value) => {
        try {
          backend.setItem(key, value);
        } catch {
          return;
        }
      },
    };
  } catch {
    return new MemoryStorage();
  }
}

function configToForm(config: GenerationConfig): UiFormState {
  return {
    arrangement: config.arrangement,
    backgroundHex: colorToHex(config.backgroundColor),
    colorOrder: config.colorOrder,
    complexity: config.complexity,
    customPaletteHex: config.palette.colors
      .map((c) => colorToHex(c))
      .join(", "),
    density: config.density,
    height: config.height,
    lineThickness: config.lineThickness,
    opacityMax: config.opacityMax,
    opacityMin: config.opacityMin,
    paletteId: CUSTOM_PALETTE_ID,
    positionJitter: config.positionJitter,
    primitiveType: config.primitiveType,
    rotationBaseDegrees: Math.round(radiansToDegrees(config.rotationBase)),
    rotationDegrees: Math.round(radiansToDegrees(config.rotationRange)),
    scale: config.scale,
    seed: String(config.seed),
    width: config.width,
  };
}

/**
 * PatternForge shell: tabbed workspace over the Phase 4 generator.
 * State stays separated (form -> config -> pattern -> pixels); every
 * heavy action runs behind an explicit button, never on keystroke.
 */
export function App() {
  const [tab, setTab] = useState<TabId>("generate");
  const [form, setForm] = useState<UiFormState>(DEFAULT_UI_FORM);
  const [zoom, setZoom] = useState(50);
  const [previewMode, setPreviewMode] = useState<"single" | "grid">("grid");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [lastConfig, setLastConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);

  const storage = useMemo(() => createWebStorage(), []);
  const presetStore = useMemo(() => new PresetStore(storage), [storage]);
  const historyStore = useMemo(() => new HistoryStore(storage), [storage]);
  const sink = useMemo(() => new DesktopFileSink(), []);

  const patchForm = useCallback((patch: Partial<UiFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const handleRandomizeSeed = useCallback(() => {
    const cryptoRef =
      typeof globalThis.crypto === "object" ? globalThis.crypto : null;
    if (cryptoRef !== null && typeof cryptoRef.getRandomValues === "function") {
      const buffer = new Uint32Array(1);
      cryptoRef.getRandomValues(buffer);
      setForm((current) => ({ ...current, seed: String(buffer[0] ?? 0) }));
      return;
    }
    setForm((current) => {
      const parsed = Number.parseInt(current.seed, 10);
      const next = Number.isSafeInteger(parsed) ? parsed + 1 : 0;
      return { ...current, seed: String(next) };
    });
  }, []);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    try {
      const normalized = normalizeUiForm({
        ...form,
        height: clampPreviewSize(form.height),
        width: clampPreviewSize(form.width),
      });
      if (!normalized.ok) {
        setError(formatConfigError(normalized.error));
        setPreview(null);
        return;
      }
      const config = normalized.value;
      patchForm({ height: config.height, width: config.width });
      const result = runGenerationPipeline(config);
      if (!result.ok) {
        setError(formatPipelineError(result.error));
        setPreview(null);
        return;
      }
      setError(null);
      setPreview(result.value);
      setLastConfig(config);
      const pushed = historyStore.push({
        checksum: result.value.checksum,
        createdAt: new Date().toISOString(),
        seed: String(config.seed),
        summary: `${config.width}x${config.height} ${config.primitiveType} density ${config.density}`,
      });
      if (!pushed.ok) {
        devLog("history push failed", pushed.error);
      }
      setHistoryToken((token) => token + 1);
    } finally {
      setGenerating(false);
    }
  }, [form, patchForm, historyStore]);

  const handleLoadConfig = useCallback((config: GenerationConfig) => {
    setForm(configToForm(config));
    setTab("generate");
  }, []);

  const handleFitZoom = useCallback(() => {
    if (preview === null) {
      return;
    }
    const image = previewMode === "grid" ? preview.grid : preview.tile;
    const largest = Math.max(image.width, image.height);
    setZoom(Math.min(100, Math.max(10, Math.round((420 * 100) / largest))));
  }, [preview, previewMode]);

  const status =
    preview === null
      ? "Ready · press Generate"
      : `Tile ${preview.tile.width}×${preview.tile.height} · ${preview.pattern.primitiveCount} primitives · checksum ${preview.checksum}`;

  const tabBar = TABS.map((entry) => (
    <button
      key={entry.id}
      type="button"
      className={tab === entry.id ? "tab-active" : "tab"}
      aria-current={tab === entry.id ? "page" : undefined}
      onClick={() => setTab(entry.id)}
    >
      {entry.label}
    </button>
  ));

  const backgroundColorInput =
    form.backgroundHex.length === 9
      ? form.backgroundHex.slice(0, 7)
      : form.backgroundHex;

  const generatorPanel = (
    <div className="control-stack">
      <label className="control-group">
        Seed
        <div className="seed-row">
          <input
            type="text"
            value={form.seed}
            onInput={(event) => patchForm({ seed: event.currentTarget.value })}
          />
          <button type="button" onClick={handleRandomizeSeed}>
            Randomize
          </button>
        </div>
      </label>
      <label className="control-group">
        Primitive
        <select
          value={form.primitiveType}
          onChange={(event) =>
            patchForm({ primitiveType: event.currentTarget.value })
          }
        >
          <option value="circle">Circle</option>
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="line">Line</option>
          <option value="polygon">Polygon</option>
          <option value="star">Star</option>
          <option value="ring">Ring</option>
          <option value="flower">Flower</option>
          <option value="wave">Wave</option>
        </select>
      </label>
      <label className="control-group">
        Arrangement
        <select
          value={form.arrangement}
          onChange={(event) =>
            patchForm({ arrangement: event.currentTarget.value })
          }
        >
          <option value="scatter">Scatter (organic)</option>
          <option value="grid">Grid (neat)</option>
          <option value="rows">Rows (stripes)</option>
        </select>
      </label>
      <label className="control-group">
        Density: {form.density}
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={form.density}
          onInput={(event) =>
            patchForm({ density: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        Scale: {form.scale.toFixed(2)}
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={form.scale}
          onInput={(event) =>
            patchForm({ scale: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        Rotation: {form.rotationDegrees}°
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={form.rotationDegrees}
          onInput={(event) =>
            patchForm({
              rotationDegrees: Number(event.currentTarget.value),
            })
          }
        />
      </label>
      <label className="control-group">
        Direction: {form.rotationBaseDegrees}°
        <input
          type="range"
          min={0}
          max={360}
          step={5}
          value={form.rotationBaseDegrees}
          onInput={(event) =>
            patchForm({
              rotationBaseDegrees: Number(event.currentTarget.value),
            })
          }
        />
      </label>
      <label className="control-group">
        Complexity: {form.complexity}
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={form.complexity}
          onInput={(event) =>
            patchForm({ complexity: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        Jitter: {form.positionJitter.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={form.positionJitter}
          onInput={(event) =>
            patchForm({
              positionJitter: Number(event.currentTarget.value),
            })
          }
        />
      </label>
      <label className="control-group">
        Line thickness: {form.lineThickness.toFixed(1)}px
        <input
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          value={form.lineThickness}
          onInput={(event) =>
            patchForm({ lineThickness: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        Opacity: {form.opacityMin.toFixed(2)}–{form.opacityMax.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={form.opacityMin}
          aria-label="Minimum opacity"
          onInput={(event) =>
            patchForm({
              opacityMin: Math.min(
                Number(event.currentTarget.value),
                form.opacityMax,
              ),
            })
          }
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={form.opacityMax}
          aria-label="Maximum opacity"
          onInput={(event) =>
            patchForm({
              opacityMax: Math.max(
                Number(event.currentTarget.value),
                form.opacityMin,
              ),
            })
          }
        />
      </label>
      <label className="control-group">
        Color order
        <select
          value={form.colorOrder}
          onChange={(event) =>
            patchForm({ colorOrder: event.currentTarget.value })
          }
        >
          <option value="random">Random (seeded)</option>
          <option value="sequential">Sequential cycle</option>
        </select>
      </label>
      <label className="control-group">
        Palette
        <select
          value={form.paletteId}
          onChange={(event) =>
            patchForm({ paletteId: event.currentTarget.value })
          }
        >
          {PALETTE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
          <option value={CUSTOM_PALETTE_ID}>Custom</option>
        </select>
      </label>
      {form.paletteId === CUSTOM_PALETTE_ID ? (
        <label className="control-group">
          Custom hex colors (comma separated)
          <input
            type="text"
            value={form.customPaletteHex}
            onInput={(event) =>
              patchForm({
                customPaletteHex: event.currentTarget.value,
              })
            }
          />
        </label>
      ) : null}
      <label className="control-group">
        Background
        <div className="seed-row">
          <input
            type="color"
            value={backgroundColorInput}
            onInput={(event) =>
              patchForm({ backgroundHex: event.currentTarget.value })
            }
          />
          <input
            type="text"
            value={form.backgroundHex}
            onInput={(event) =>
              patchForm({ backgroundHex: event.currentTarget.value })
            }
          />
        </div>
      </label>
      <button
        type="button"
        className="generate-button"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? "Generating…" : "Generate"}
      </button>
      {error === null ? null : <p className="error-text">{error}</p>}
    </div>
  );

  const previewImage =
    preview === null
      ? null
      : previewMode === "grid"
        ? preview.grid
        : preview.tile;

  const previewPanel = (
    <div className="preview-stack">
      <PreviewCanvas image={previewImage} zoomPercent={zoom} />
      <p
        className={preview?.seamless.pass === false ? "seam-fail" : "seam-pass"}
      >
        {preview === null
          ? "Seamless: —"
          : preview.seamless.pass
            ? "Seamless: PASS"
            : "Seamless: FAIL"}
      </p>
      {preview === null ? null : (
        <p className="hint-text">
          {preview.pattern.primitiveCount} primitives · rotation ±
          {Math.round(
            radiansToDegrees(preview.pattern.primitives[0]?.rotation ?? 0),
          )}
          ° sample · checksum {preview.checksum}
        </p>
      )}
    </div>
  );

  const settingsPanel = (
    <div className="control-stack">
      <label className="control-group">
        Width
        <input
          type="number"
          min={PREVIEW_MIN}
          max={PREVIEW_MAX}
          value={form.width}
          onInput={(event) =>
            patchForm({ width: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        Height
        <input
          type="number"
          min={PREVIEW_MIN}
          max={PREVIEW_MAX}
          value={form.height}
          onInput={(event) =>
            patchForm({ height: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label className="control-group">
        View
        <select
          value={previewMode}
          onChange={(event) =>
            setPreviewMode(event.currentTarget.value as "single" | "grid")
          }
        >
          <option value="grid">3×3 tiles</option>
          <option value="single">1×1 tile</option>
        </select>
      </label>
      <label className="control-group">
        Zoom: {zoom}%
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={zoom}
          onInput={(event) => setZoom(Number(event.currentTarget.value))}
        />
      </label>
      <button type="button" onClick={handleFitZoom} disabled={preview === null}>
        Fit preview
      </button>
      <p className="hint-text">
        Preview is bounded to {PREVIEW_MIN}–{PREVIEW_MAX}px per tile (3×3 max
        1536px display). Rendering runs only on Generate.
      </p>
    </div>
  );

  if (tab === "generate") {
    return (
      <AppShell
        status={status}
        title="PatternForge"
        nav={tabBar}
        generator={generatorPanel}
        preview={previewPanel}
        settings={settingsPanel}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PatternForge</h1>
        <nav className="tab-bar" aria-label="Sections">
          {tabBar}
        </nav>
        <span className="app-status-dot">● Ready</span>
      </header>
      <main className="tab-page">
        {tab === "batch" ? (
          <BatchPanel baseConfig={lastConfig} sink={sink} />
        ) : null}
        {tab === "library" ? (
          <LibraryPanel
            config={lastConfig}
            onLoad={handleLoadConfig}
            store={presetStore}
          />
        ) : null}
        {tab === "history" ? (
          <HistoryPanel key={historyToken} store={historyStore} />
        ) : null}
        {tab === "ai" ? (
          <AiPanel
            base={lastConfig ?? DEFAULT_GENERATION_CONFIG}
            onApply={(config) => {
              setForm(configToForm(config));
              setTab("generate");
            }}
          />
        ) : null}
        {tab === "export" ? (
          <ExportPanel
            config={lastConfig}
            pattern={preview?.pattern ?? null}
            sink={sink}
            tile={preview?.tile ?? null}
          />
        ) : null}
        {tab === "project" ? (
          <ProjectPanel
            config={lastConfig}
            onCustomPalette={(hex) =>
              patchForm({ customPaletteHex: hex, paletteId: CUSTOM_PALETTE_ID })
            }
            onLoad={handleLoadConfig}
            sink={sink}
          />
        ) : null}
      </main>
      <footer className="app-footer">
        <span>{status}</span>
      </footer>
    </div>
  );
}
