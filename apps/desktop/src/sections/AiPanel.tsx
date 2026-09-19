import { useState } from "preact/hooks";
import type { GenerationConfig } from "@patternforge/core";
import {
  intentToGenerationConfig,
  MockAIProvider,
  OpenAICompatibleProvider,
  type PatternIntent,
} from "@patternforge/ai-provider";

export interface AiPanelProps {
  readonly base: GenerationConfig;
  readonly onApply: (config: GenerationConfig) => void;
}

/**
 * Optional AI assistant. The provider only returns a structured intent;
 * nothing is applied until the user explicitly clicks Apply. Invalid
 * intents are rejected with typed errors. Default is the offline mock —
 * no network, no key required.
 */
export function AiPanel({ base, onApply }: AiPanelProps) {
  const [providerId, setProviderId] = useState("mock");
  const [prompt, setPrompt] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [intent, setIntent] = useState<PatternIntent | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAnalyze = async (): Promise<void> => {
    setBusy(true);
    setStatus(null);
    setIntent(null);
    try {
      const provider =
        providerId === "openai"
          ? new OpenAICompatibleProvider({ apiKey, endpoint, model })
          : new MockAIProvider();
      const result = await provider.analyze(prompt);
      setIntent(result);
      setStatus("Intent ready — review below, then Apply or Cancel.");
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        "message" in error
      ) {
        const typed = error as { code: string; message: string };
        setStatus(`AI ${typed.code}: ${typed.message}`);
      } else {
        setStatus("AI request failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleApply = (): void => {
    if (intent === null) {
      return;
    }
    const config = intentToGenerationConfig(intent, base);
    if (!config.ok) {
      setStatus(`Intent rejected: ${config.error.message}`);
      return;
    }
    onApply(config.value);
    setIntent(null);
    setStatus("Applied — press Generate to render.");
  };

  const rows: Array<[string, string]> =
    intent === null
      ? []
      : [
          ["Primitive", String(intent.primitiveType ?? "—")],
          ["Density", String(intent.density ?? "—")],
          ["Scale", String(intent.scale ?? "—")],
          ["Rotation", String(intent.rotationDegrees ?? "—")],
          ["Complexity", String(intent.complexity ?? "—")],
          ["Palette", (intent.paletteHex ?? []).join(", ") || "—"],
          ["Background", String(intent.backgroundHex ?? "—")],
        ];

  return (
    <section className="control-panel" aria-label="AI assistant">
      <h2>AI assistant (optional)</h2>
      <div className="control-stack">
        <label className="control-group">
          Provider
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.currentTarget.value)}
          >
            <option value="mock">Mock (offline, no key)</option>
            <option value="openai">OpenAI-compatible (online)</option>
          </select>
        </label>
        {providerId === "openai" ? (
          <>
            <label className="control-group">
              Endpoint (https URL, session only)
              <input
                type="text"
                value={endpoint}
                placeholder="https://api.example.com/v1"
                onInput={(event) => setEndpoint(event.currentTarget.value)}
              />
            </label>
            <label className="control-group">
              Model
              <input
                type="text"
                value={model}
                onInput={(event) => setModel(event.currentTarget.value)}
              />
            </label>
            <label className="control-group">
              API key (never stored, never logged)
              <input
                type="password"
                value={apiKey}
                autoComplete="off"
                onInput={(event) => setApiKey(event.currentTarget.value)}
              />
            </label>
          </>
        ) : null}
        <label className="control-group">
          Prompt
          <textarea
            value={prompt}
            rows={3}
            placeholder="Seamless geometric pattern with dark blue circles…"
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="generate-button"
          onClick={() => void handleAnalyze()}
          disabled={busy || prompt.trim().length === 0}
        >
          {busy ? "Analyzing…" : "Analyze"}
        </button>
        {intent === null ? null : (
          <div className="control-group">
            <strong>UNDERSTANDING</strong>
            <ul className="result-list">
              {rows.map(([label, value]) => (
                <li key={label}>
                  {label}: {value}
                </li>
              ))}
            </ul>
            <div className="seed-row">
              <button type="button" onClick={handleApply}>
                Apply
              </button>
              <button type="button" onClick={() => setIntent(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {status === null ? null : <p className="hint-text">{status}</p>}
        <p className="hint-text">
          AI never writes files, never renders directly, and never overwrites
          your pattern without Apply. Core generation works fully offline.
        </p>
      </div>
    </section>
  );
}
