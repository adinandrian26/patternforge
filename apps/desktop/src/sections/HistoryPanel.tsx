import type { HistoryStore } from "@patternforge/library";

export interface HistoryPanelProps {
  readonly store: HistoryStore;
}

/** Read-only recent-pattern history (newest first). */
export function HistoryPanel({ store }: HistoryPanelProps) {
  const entries = store.list();
  return (
    <section className="control-panel" aria-label="History">
      <h2>History</h2>
      {entries.length === 0 ? (
        <p className="hint-text">
          No generations yet. Each Generate adds one entry (checksum, seed,
          summary). Timestamps are display metadata only.
        </p>
      ) : (
        <ul className="result-list">
          {entries.map((entry) => (
            <li key={`${entry.createdAt}-${entry.checksum}`}>
              <strong>{entry.checksum}</strong> · seed {entry.seed}
              <br />
              <span className="hint-text">
                {entry.summary} · {entry.createdAt}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entries.length === 0 ? null : (
        <button type="button" onClick={() => store.clear()}>
          Clear history
        </button>
      )}
    </section>
  );
}
