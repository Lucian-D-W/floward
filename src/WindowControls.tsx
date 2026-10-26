import { getCurrentWindow } from "@tauri-apps/api/window";
import { native, surface, flushPending, useStore } from "./store";
export function WindowControls() {
  if (!native || surface !== "main") return null;
  const run = (action: () => Promise<void>) =>
    void action().catch((e) => useStore.setState({ error: String(e) }));
  return (
    <div className="window-controls">
      <button
        aria-label="最小化"
        onClick={() => run(() => getCurrentWindow().minimize())}
      >
        −
      </button>
      <button
        aria-label="最大化或还原"
        onClick={() => run(() => getCurrentWindow().toggleMaximize())}
      >
        □
      </button>
      <button
        aria-label="关闭窗口"
        onClick={() =>
          run(async () => {
            await flushPending();
            await getCurrentWindow().close();
          })
        }
      >
        ×
      </button>
    </div>
  );
}
