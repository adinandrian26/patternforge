import { describe, expect, it } from "vitest";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import { renderTile } from "@patternforge/renderer-engine";
import { buildFilename } from "@patternforge/export-engine";
import {
  MAX_BATCH_COUNT,
  runBatch,
  type BatchItemResult,
} from "@patternforge/batch-engine";
import { MemoryFileSink } from "@patternforge/export-engine";
import {
  exportRaster,
  validateExportConfig,
} from "@patternforge/export-engine";
import { prepareTileExport } from "../apps/desktop/src/exporting";
import { normalizeUiForm, DEFAULT_UI_FORM } from "../apps/desktop/src/config";

function configFor(seed: string) {
  const normalized = normalizeUiForm({ ...DEFAULT_UI_FORM, seed });
  if (!normalized.ok) {
    throw new Error("config invalid");
  }
  return normalized.value;
}

describe("desktop export orchestration", () => {
  it("encodes the current tile with deterministic naming", () => {
    const config = configFor("12345");
    const generated = generatePattern({
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: config.height, width: config.width },
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
      seed: config.seed,
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
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
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) {
      return;
    }
    const prepared = prepareTileExport(
      rendered.value,
      generated.value,
      config,
      {
        format: "png",
      },
    );
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.value.file.filename).toBe(
        `patternforge-12345-${config.width}x${config.height}.png`,
      );
      const again = prepareTileExport(rendered.value, generated.value, config, {
        format: "png",
      });
      expect(again.ok && again.value.file.bytes).toEqual(
        prepared.value.file.bytes,
      );
    }
    const named = prepareTileExport(rendered.value, generated.value, config, {
      filename: "custom-name",
      format: "jpeg",
      quality: 80,
    });
    expect(named.ok).toBe(true);
    if (named.ok) {
      expect(named.value.file.filename).toBe("custom-name.jpg");
    }
    expect(
      prepareTileExport(rendered.value, generated.value, config, {
        filename: "../evil",
        format: "png",
      }).ok,
    ).toBe(false);
  });
});

describe("end-to-end batch determinism", () => {
  async function runOnce(sink: MemoryFileSink) {
    const config = configFor("1000");
    return runBatch(
      {
        baseConfig: config,
        count: 3,
        format: "png",
        quality: 90,
        startSeed: "1000",
      },
      async (index, seed): Promise<BatchItemResult> => {
        const generated = generatePattern({
          algorithmVersion: PATTERN_ALGORITHM_VERSION,
          dimensions: { height: 32, width: 32 },
          palette: config.palette,
          parameters: {
            canvasHeight: 32,
            canvasWidth: 32,
            complexity: 3,
            density: 5,
            positionJitter: 0.1,
            primitiveType: "circle",
            rotationRange: Math.PI,
            scale: 0.5,
          },
          schemaVersion: SCHEMA_VERSION,
          seed,
        });
        if (!generated.ok) {
          return { error: generated.error.message, index, seed: String(seed) };
        }
        const rendered = renderTile(generated.value.primitives, 32, 32);
        if (!rendered.ok) {
          return { error: rendered.error.message, index, seed: String(seed) };
        }
        const exportConfig = validateExportConfig({ format: "png" });
        if (!exportConfig.ok) {
          return {
            error: exportConfig.error.message,
            index,
            seed: String(seed),
          };
        }
        const encoded = exportRaster(rendered.value, {
          ...exportConfig.value,
          background: config.backgroundColor,
          filename: "batch.png",
        });
        if (!encoded.ok) {
          return { error: encoded.error.message, index, seed: String(seed) };
        }
        const name = buildFilename(seed, 32, 32, "png", index);
        const filename = name.ok ? name.value : `batch-${index}.png`;
        await sink.writeFile(filename, encoded.value.bytes);
        return {
          byteCount: encoded.value.bytes.length,
          filename,
          index,
          seed: String(seed),
        };
      },
    );
  }

  it(`reproduces seed sequences ${"1000-1002"} with identical files`, async () => {
    expect(MAX_BATCH_COUNT).toBe(100);
    const first = await runOnce(new MemoryFileSink());
    const sink = new MemoryFileSink();
    const second = await runOnce(sink);
    expect(first.results).toEqual(second.results);
    expect(first.succeeded).toBe(3);
    expect(sink.listFiles()).toEqual([
      "patternforge-1000-32x32-0.png",
      "patternforge-1001-32x32-1.png",
      "patternforge-1002-32x32-2.png",
    ]);
  });
});
