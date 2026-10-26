import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { native, surface } from "./store";
if (native && surface.startsWith("desktop-")) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  function report() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const regions = [
        ...document.querySelectorAll(
          "header,[data-lane-id],[role=dialog],[role=menu],.metadata-sidebar,.metadata-form,.desktop-adjust-toolbar,.desktop-move,.desktop-scale,.text-detail,.empty-workspace",
        ),
      ]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return [
            Math.max(0, r.left),
            Math.max(0, r.top),
            Math.min(innerWidth, r.right),
            Math.min(innerHeight, r.bottom),
          ];
        })
        .filter((r) => r[2] > r[0] && r[3] > r[1]);
      void invoke("desktop_regions", { regions });
    }, 40);
  }
  const observer = new MutationObserver(report);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("resize", report);
  window.addEventListener("floward-desktop-placement", report);
  window.addEventListener("pointerup", report);
  window.addEventListener("scroll", report, true);
  void listen("wallpaper://reattached", report);
  report();
}
