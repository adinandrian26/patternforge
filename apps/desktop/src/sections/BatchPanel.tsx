import { useRef, useState } from "preact/hooks";
import type { GenerationConfig } from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  computeImageChecksum,
  renderTile,
} from "@patternforge/renderer-engine";
import {
  buildFilename,
  DEFAULT_STOCK_EPS_SIZE,
  exportPatternEps,
  exportPatternSvg,
  exportRaster,
  validateExportConfig,
  type FileSink,
} from "@patternforge/export-engine";
import {
  MAX_BATCH_COUNT,
  runBatch,
  validateBatchRequest,
  type BatchItemResult,
  type BatchSummary,
} from "@patternforge/batch-engine";

export interface BatchPanelProps {
  readonly baseConfig: GenerationConfig | null;
  readonly sink: FileSink;
}

interface BatchUiState {
  readonly progress: string;
  readonly results: readonly BatchItemResult[];
  readonly running: boolean;
  readonly summary: BatchSummary | null;
}

/** Bounded sequential batch: generate + export per item, one at a time. */
export function BatchPanel({ baseConfig, sink }: BatchPanelProps) {
  const [count, setCount] = useState(5);
  const [startSeed, setStartSeed] = useState(
    baseConfig === null ? "1000" : String(baseConfig.seed),
  );
  const [format, setFormat] = useState<"png" | "jpeg" | "svg" | "eps">("png");
  const [state, setState] = useState<BatchUiState>({
    progress: "",
    results: [],
    running: false,
    summary: null,
  });
  const cancelRef = useRef(false);

  if (baseConfig === null) {
    return (
      <section className="control-panel" aria-label="Batch">
        <h2>Batch</h2>
        <p className="hint-text">
          Generate a pattern first — batch reuses the current configuration with
          a seed sequence.
        </p>
      </section>
    );
  }
  const config = baseConfig;

  const handleCancel = (): void => {
    cancelRef.current = true;
  };

  const handleRun = async (): Promise<void> => {
    const request = validateBatchRequest({
      baseConfig: config,
      count,
      format,
      startSeed,
    });
    if (!request.ok) {
      setState({
        progress: `Error: ${request.error.message}`,
        results: [],
        running: false,
        summary: null,
      });
      return;
    }
    cancelRef.current = false;
    setState({
      progress: "Starting…",
      results: [],
      running: true,
      summary: null,
    });
    const summary = await runBatch(
      request.value,
      async (index, seed) => {
        const generated = generatePattern({
          algorithmVersion: PATTERN_ALGORITHM_VERSION,
          dimensions: { height: config.height, width: config.width },
          options: {
            colorOrder: config.colorOrder,
            lineThickness: config.lineThickness,
            opacityMax: config.opacityMax,
            opacityMin: config.opacityMin,
          },
          palette: config.palette,
          parameters: {
            canvasHeight: config.height,
            canvasWidth: config.width,
            complexity: config.complexity,
            density: config.density,
            positionJitter: config.positionJitter,
            primitiveType: config.primitiveType,
            rotationRange: config.rotationRange,
            scale: config.scale,
          },
          schemaVersion: SCHEMA_VERSION,
          seed,
        });
        if (!generated.ok) {
          return { error: generated.error.message, index, seed: String(seed) };
        }
        const rendered = renderTile(
          generated.value.primitives,
          config.width,
          config.height,
          {
            background: config.backgroundColor,
            foreground: config.palette.colors[0] ?? {
              a: 255,
              b: 0,
              g: 0,
              r: 0,
            },
          },
        );
        if (!rendered.ok) {
          return { error: rendered.error.message, index, seed: String(seed) };
        }
        const checksum = computeImageChecksum(rendered.value);
        const exportConfig = validateExportConfig({
          background: config.backgroundColor,
          format: request.value.format,
          quality: request.value.quality,
        });
        if (!exportConfig.ok) {
          return {
            error: exportConfig.error.message,
            index,
            seed: String(seed),
          };
        }
        const encoded =
          request.value.format === "svg"
            ? exportPatternSvg(generated.value, {
                ...exportConfig.value,
                background: config.backgroundColor,
                filename: "batch.svg",
              })
            : request.value.format === "eps"
              ? exportPatternEps(
                  generated.value,
                  {
                    ...exportConfig.value,
                    background: config.backgroundColor,
                    filename: "batch.eps",
                  },
                  DEFAULT_STOCK_EPS_SIZE,
                )
              : exportRaster(rendered.value, exportConfig.value);
        if (!encoded.ok) {
          return { error: encoded.error.message, index, seed: String(seed) };
        }
        const name = buildFilename(
          seed,
          config.width,
          config.height,
          request.value.format,
          index,
        );
        const filename = name.ok ? name.value : `batch-${index}`;
        const written = await sink.writeFile(filename, encoded.value.bytes);
        if (!written.ok) {
          return {
            error: written.error.message,
            index,
            seed: String(seed),
          };
        }
        return {
          byteCount: encoded.value.bytes.length,
          checksum,
          filename,
          index,
          seed: String(seed),
        };
      },
      {
        isCancelled: () => cancelRef.current,
        operationId: "batch" as never,
      },
      (progress) => {
        setState((s) => ({
          ...s,
          progress: `Item ${progress.completed}/${progress.total}…`,
        }));
      },
    );
    setState((s) => ({
      ...s,
      progress: summary.cancelled
        ? `Cancelled after ${summary.results.length} items.`
        : `Done: ${summary.succeeded} ok, ${summary.failed} failed.`,
      results: summary.results,
      running: false,
      summary,
    }));
  };

  return (
    <section className="control-panel" aria-label="Batch">
      <h2>Batch (sequential, max {MAX_BATCH_COUNT})</h2>
      <div className="control-stack">
        <label className="control-group">
          Count
          <input
            type="number"
            min={1}
            max={MAX_BATCH_COUNT}
            value={count}
            onInput={(event) => setCount(Number(event.currentTarget.value))}
          />
        </label>
        <label className="control-group">
          Start seed
          <input
            type="text"
            value={startSeed}
            onInput={(event) => setStartSeed(event.currentTarget.value)}
          />
        </label>
        <label className="control-group">
          Format
          <select
            value={format}
            onChange={(event) =>
              setFormat(
                event.currentTarget.value as "png" | "jpeg" | "svg" | "eps",
              )
            }
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="svg">SVG</option>
            <option value="eps">EPS (Shutterstock)</option>
          </select>
        </label>
        <div className="seed-row">
          <button
            type="button"
            className="generate-button"
            onClick={() => void handleRun()}
            disabled={state.running}
          >
            {state.running ? "Running…" : "Run batch"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!state.running}
          >
            Cancel
          </button>
        </div>
        {state.progress === "" ? null : (
          <p className="hint-text">{state.progress}</p>
        )}
        {state.results.length === 0 ? null : (
          <ul className="result-list">
            {state.results.map((item) => (
              <li key={item.index}>
                #{item.index} seed {item.seed} —{" "}
                {item.error === undefined
                  ? `${item.filename ?? ""} (${item.byteCount ?? 0} B)`
                  : `failed: ${item.error}`}
              </li>
            ))}
          </ul>
        )}
        <p className="hint-text">
          Seeds run as startSeed, +1, +2… Reruns reproduce identical files. One
          item at a time; failures are isolated per item.
        </p>
      </div>
    </section>
  );
}
