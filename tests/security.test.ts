import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES } from "@patternforge/library";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import { serializeSvg } from "@patternforge/export-engine";

// Raw source contents via Vite glob (no node:fs needed in tests).
const packageSources = import.meta.glob<string>("/packages/**/*.{ts,tsx}", {
  import: "default",
  eager: true,
  query: "?raw",
});
const desktopSources = import.meta.glob<string>(
  "/apps/desktop/src/**/*.{ts,tsx}",
  { import: "default", eager: true, query: "?raw" },
);
const testSources = import.meta.glob<string>("/tests/*.test.ts", {
  import: "default",
  eager: true,
  query: "?raw",
});

function allSources(): Array<[string, string]> {
  return [
    ...Object.entries(packageSources),
    ...Object.entries(desktopSources),
    ...Object.entries(testSources),
  ];
}

function patternForTemplate(index: number) {
  const template = BUILTIN_TEMPLATES[index];
  if (template === undefined) {
    throw new Error("missing template");
  }
  const generated = generatePattern({
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: {
      height: template.config.height,
      width: template.config.width,
    },
    palette: template.config.palette,
    parameters: {
      canvasHeight: template.config.height,
      canvasWidth: template.config.width,
      complexity: template.config.complexity,
      density: template.config.density,
      positionJitter: template.config.positionJitter,
      primitiveType: template.config.primitiveType,
      rotationRange: template.config.rotationRange,
      scale: template.config.scale,
    },
    schemaVersion: SCHEMA_VERSION,
    seed: template.config.seed,
  });
  if (!generated.ok) {
    throw new Error("generation failed");
  }
  return generated.value;
}

describe("security audit", () => {
  it("contains no dynamic code execution or shell access", () => {
    const banned = [
      "eval(",
      "new Function",
      "child_process",
      "execSync",
      "spawnSync",
      "process.env.PATTERNFORGE_API_KEY",
    ];
    const files = allSources().filter(
      ([path]) =>
        !path.endsWith("tests/security.test.ts") && !path.includes("/dist/"),
    );
    expect(files.length).toBeGreaterThan(10);
    const violations: string[] = [];
    for (const [path, content] of files) {
      for (const token of banned) {
        if (content.includes(token)) {
          violations.push(`${path}: ${token}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("emits safe SVG for every template pattern", () => {
    for (let i = 0; i < BUILTIN_TEMPLATES.length; i += 1) {
      const pattern = patternForTemplate(i);
      const svg = serializeSvg(pattern, {
        background: { a: 255, b: 255, g: 255, r: 255 },
        fallbackFill: { a: 255, b: 0, g: 0, r: 0 },
      });
      expect(svg.ok).toBe(true);
      if (!svg.ok) {
        continue;
      }
      const lower = svg.value.toLowerCase();
      expect(lower).not.toContain("<script");
      expect(lower).not.toMatch(/\son\w+\s*=/);
      expect(lower).not.toContain("javascript");
      expect(
        lower.replace('xmlns="http://www.w3.org/2000/svg"', ""),
      ).not.toContain("http");
    }
  });

  it("never persists API keys", () => {
    const violations: string[] = [];
    for (const [path, content] of allSources()) {
      if (/sk-[A-Za-z0-9]{8}/.test(content)) {
        violations.push(path);
      }
    }
    expect(violations).toEqual([]);
  });
});
