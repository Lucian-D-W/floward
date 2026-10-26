import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { native, stateGet, useStore } from "./store";
export type Typography = { family: string; size: number };
export const defaultFamily = '"Microsoft YaHei UI", "Segoe UI", sans-serif';
export function readTypography(): Typography {
  return {
    family: document.documentElement.dataset.fontFamily ?? "",
    size: parseFloat(document.documentElement.style.fontSize) || 11,
  };
}
let writes = Promise.resolve();
function apply(value: Typography) {
  document.documentElement.dataset.fontFamily = value.family;
  document.documentElement.style.fontFamily = value.family
    ? JSON.stringify(value.family) + ", sans-serif"
    : defaultFamily;
  document.documentElement.style.fontSize = value.size + "px";
  document.documentElement.style.setProperty(
    "--task-line",
    Math.max(17, Math.ceil(value.size * 1.5)) + "px",
  );
  window.dispatchEvent(new Event("floward-font"));
}
export function setTypography(value: Typography) {
  apply(value);
  localStorage.setItem("floward-typography", JSON.stringify(value));
  if (native)
    writes = writes
      .then(async () => {
        await invoke("state_set", { key: "global/typography", value });
        await emit("floward-typography", value);
      })
      .catch((error) => {
        useStore.setState({ error: "字体设置未保存：" + String(error) });
      });
}
export async function initTypography() {
  const unlisten = native
    ? await listen<Typography>("floward-typography", (e) => apply(e.payload))
    : () => {};
  const saved = native
    ? await invoke<Typography | null>("state_get", { key: "global/typography" })
    : JSON.parse(localStorage.getItem("floward-typography") ?? "null");
  apply(saved ?? { family: "", size: await stateGet("font", 11) });
  return unlisten;
}
let fonts: Promise<string[]> | undefined;
export function systemFonts() {
  return (fonts ??= native
    ? invoke<string[]>("system_fonts").catch((error) => {
        fonts = undefined;
        throw error;
      })
    : Promise.resolve([]));
}
