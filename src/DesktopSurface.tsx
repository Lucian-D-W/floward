import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  localState,
  native,
  stateGet,
  stateSet,
  surface,
  useStore,
} from "./store";
type Placement = { x: number; y: number; zoom: number };
export function DesktopSurface({ children }: { children: ReactNode }) {
  const desktop =
    surface.startsWith("desktop-") ||
    (!native && new URLSearchParams(location.search).has("desktop"));
  const [placement, setPlacement] = useState<Placement>(() =>
    localState("desktop-placement", { x: 0, y: 0, zoom: 1 }),
  );
  const [adjust, setAdjust] = useState(false);
  const [ready, setReady] = useState(false);
  const [, resize] = useState(0);
  const zoomQueue = useRef(Promise.resolve());
  useEffect(() => {
    if (!desktop) return;
    void stateGet("desktop-placement", placement).then((v) => {
      setPlacement(v);
      setReady(true);
    });
    void stateGet("desktop-adjust", false).then(setAdjust);
    const begin = () => {
      setAdjust(true);
      stateSet("desktop-adjust", true);
    };
    window.addEventListener("floward-adjust-desktop", begin);
    const pending = native ? listen("floward-adjust-desktop", begin) : null;
    const onResize = () => resize((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("floward-adjust-desktop", begin);
      void pending?.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!desktop || !ready) return;
    stateSet("desktop-placement", placement);
    if (native)
      zoomQueue.current = zoomQueue.current
        .then(() => getCurrentWebview().setZoom(1))
        .catch((e) => useStore.setState({ error: "桌面比例未更新：" + e }));
    window.dispatchEvent(new Event("floward-desktop-placement"));
  }, [placement, ready]);
  if (!desktop) return <>{children}</>;
  const update = (next: Placement) =>
    setPlacement({ ...next, zoom: Math.max(0.3, Math.min(2, next.zoom)) });
  function drag(e: React.PointerEvent, scale = false) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const start = { ...placement },
      x = e.clientX,
      y = e.clientY;
    const move = (ev: PointerEvent) =>
      update(
        scale
          ? {
              ...start,
              zoom: start.zoom + (ev.clientX - x) / 600,
            }
          : {
              ...start,
              x: Math.max(
                -innerWidth * 0.8,
                Math.min(innerWidth * 0.8, start.x + (ev.clientX - x)),
              ),
              y: Math.max(
                0,
                Math.min(innerHeight * 0.8, start.y + (ev.clientY - y)),
              ),
            },
      );
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  const fit = () => {
    const lanes = [...document.querySelectorAll<HTMLElement>("main > .lane")];
    const total = lanes.reduce((s, e) => s + e.offsetWidth, 0);
    const graphs = lanes.map((e) =>
      parseFloat(
        (e.querySelector(".react-flow") as HTMLElement)?.style.getPropertyValue(
          "--graph-height",
        ) || "0",
      ),
    );
    update({
      x: 0,
      y: 0,
      zoom: Math.min(
        1,
        innerWidth / Math.max(1, total),
        innerHeight / Math.max(1, Math.max(...graphs, 0) + 70),
      ),
    });
  };
  return (
    <>
      <div
        className="desktop-content"
        style={{
          left: placement.x / placement.zoom,
          top: placement.y / placement.zoom,
          width: (innerWidth - Math.max(0, placement.x)) / placement.zoom,
          height: (innerHeight - placement.y) / placement.zoom,
          zoom: placement.zoom,
        }}
      >
        {children}
      </div>
      {adjust && (
        <div className="desktop-adjust" style={{ fontSize: 12 }}>
          <div
            className="desktop-adjust-toolbar"
            style={{ padding: 8, gap: 8 }}
          >
            <span>桌面布局</span>
            <button className="desktop-move" onPointerDown={(e) => drag(e)}>
              拖动移动
            </button>
            <button
              className="desktop-scale"
              onPointerDown={(e) => drag(e, true)}
            >
              拖动缩放
            </button>
            <input
              aria-label="桌面缩放"
              type="range"
              min="30"
              max="200"
              value={Math.round(placement.zoom * 100)}
              onChange={(e) =>
                update({ ...placement, zoom: +e.target.value / 100 })
              }
            />
            <span>{Math.round(placement.zoom * 100)}%</span>
            <button onClick={fit}>适应当前屏幕</button>
            <button
              onClick={() => {
                const w =
                  [
                    ...document.querySelectorAll<HTMLElement>("main > .lane"),
                  ].reduce((s, e) => s + e.offsetWidth, 0) * placement.zoom;
                update({
                  ...placement,
                  x: Math.max(0, (innerWidth - w) / 2),
                  y: 0,
                });
              }}
            >
              居中
            </button>
            <button onClick={() => update({ ...placement, zoom: 1 })}>
              100%
            </button>
            <button onClick={() => update({ x: 0, y: 0, zoom: 1 })}>
              重置位置
            </button>
            <button
              onClick={() => {
                setAdjust(false);
                stateSet("desktop-adjust", false);
              }}
            >
              完成
            </button>
          </div>
        </div>
      )}
    </>
  );
}
