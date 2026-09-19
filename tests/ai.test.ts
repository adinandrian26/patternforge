import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION_CONFIG } from "@patternforge/core";
import {
  intentToGenerationConfig,
  MockAIProvider,
  OpenAICompatibleProvider,
} from "@patternforge/ai-provider";

describe("mock AI provider", () => {
  it("is deterministic per prompt", async () => {
    const provider = new MockAIProvider();
    expect(provider.offlineCapable).toBe(true);
    const first = await provider.analyze("dark blue circles, dense");
    const second = await provider.analyze("dark blue circles, dense");
    expect(first).toEqual(second);
    expect(first.primitiveType).toBe("circle");
    expect(first.density).toBe(14);
  });

  it("maps keywords to intents", async () => {
    const provider = new MockAIProvider();
    const lines = await provider.analyze("thin white lines, sparse");
    expect(lines.primitiveType).toBe("line");
    expect(lines.density).toBe(3);
    expect(lines.scale).toBe(0.3);
    const poly = await provider.analyze("intricate hexagons, no rotation");
    expect(poly.primitiveType).toBe("polygon");
    expect(poly.complexity).toBe(7);
    expect(poly.rotationDegrees).toBe(0);
    const empty = await provider.analyze("something completely unrelated xyz");
    expect(empty).toEqual({});
  });
});

describe("intent validation", () => {
  it("merges valid intents over the base config", () => {
    const config = intentToGenerationConfig(
      {
        backgroundHex: "#000000",
        density: 12,
        paletteHex: ["#ff0000", "#00ff00"],
        primitiveType: "circle",
        rotationDegrees: 90,
      },
      DEFAULT_GENERATION_CONFIG,
    );
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.value.density).toBe(12);
      expect(config.value.rotationRange).toBeCloseTo(Math.PI / 2, 12);
      expect(config.value.palette.colors).toHaveLength(2);
      expect(config.value.backgroundColor).toEqual({
        a: 255,
        b: 0,
        g: 0,
        r: 0,
      });
    }
  });

  it("rejects invalid intent fields", () => {
    expect(intentToGenerationConfig({ primitiveType: "triangle" }).ok).toBe(
      false,
    );
    expect(intentToGenerationConfig({ density: 500 }).ok).toBe(false);
    expect(intentToGenerationConfig({ backgroundHex: "nope" }).ok).toBe(false);
    expect(
      intentToGenerationConfig({ paletteHex: ["#ff0000", "bogus"] }).ok,
    ).toBe(false);
    expect(intentToGenerationConfig({ rotationDegrees: 999 }).ok).toBe(false);
    expect(intentToGenerationConfig(null as never).ok).toBe(false);
  });
});

describe("openai-compatible provider", () => {
  it("requires configuration and https URLs without calling network", async () => {
    const missing = new OpenAICompatibleProvider({ endpoint: "", model: "" });
    await expect(missing.analyze("circles")).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
    const badScheme = new OpenAICompatibleProvider({
      endpoint: "ftp://host",
      model: "m",
    });
    await expect(badScheme.analyze("circles")).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
    expect(missing.offlineCapable).toBe(false);
  });

  it("surfaces unavailability for unreachable hosts", async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: "http://127.0.0.1:9",
      model: "test",
      timeoutMs: 1500,
    });
    await expect(provider.analyze("circles")).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
  }, 10000);
});
