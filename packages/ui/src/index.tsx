import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface AppShellProps {
  readonly generator: ComponentChildren;
  readonly nav?: ComponentChildren;
  readonly preview: ComponentChildren;
  readonly settings: ComponentChildren;
  readonly status: string;
  readonly title: string;
}

export function AppShell({
  generator,
  nav,
  preview,
  settings,
  status,
  title,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{title}</h1>
        {nav === undefined ? null : (
          <nav className="tab-bar" aria-label="Sections">
            {nav}
          </nav>
        )}
        <span className="app-status-dot">● Ready</span>
      </header>
      <main className="app-main">
        <section className="control-panel" aria-label="Generator">
          <h2>Generator</h2>
          {generator}
        </section>
        <section className="preview-panel" aria-label="Preview">
          <h2>3×3 Tile Preview</h2>
          {preview}
        </section>
        <section className="control-panel" aria-label="Settings">
          <h2>Settings</h2>
          {settings}
        </section>
      </main>
      <footer className="app-footer">
        <span>{status}</span>
      </footer>
    </div>
  );
}

export interface PreviewImageData {
  readonly data: Uint8Array;
  readonly height: number;
  readonly width: number;
}

export interface PreviewCanvasProps {
  readonly image: PreviewImageData | null;
  readonly zoomPercent: number;
}

/**
 * Display adapter: core raster buffer -> Canvas display.
 * The core renderer stays DOM-free and testable; this component only
 * copies the deterministic RGBA buffer into an `ImageData` surface.
 */
export function PreviewCanvas({ image, zoomPercent }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) {
      return;
    }
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }
    const clamped = new Uint8ClampedArray(image.data);
    const imageData = new ImageData(clamped, image.width, image.height);
    context.putImageData(imageData, 0, 0);
  }, [image]);

  if (image === null) {
    return <p className="preview-empty">Press Generate to render a preview.</p>;
  }

  const displayWidth = Math.max(
    1,
    Math.round((image.width * zoomPercent) / 100),
  );
  const displayHeight = Math.max(
    1,
    Math.round((image.height * zoomPercent) / 100),
  );

  return (
    <canvas
      ref={canvasRef}
      className="preview-canvas"
      style={{ height: `${displayHeight}px`, width: `${displayWidth}px` }}
    />
  );
}

export const UI_PACKAGE_NAME = "@patternforge/ui" as const;
