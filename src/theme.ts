import { useEffect, useState } from "react";
import { localState, stateSet } from "./store";
import type { Appearance } from "./model";
import { fill } from "./ui";
export type Theme = "light" | "dark";
export function applyTheme(value: string, persist = false) {
  const theme: Theme = value === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event("floward-theme"));
  if (persist) stateSet("theme", theme);
}
export function useTheme(): Theme {
  const read = () =>
    (document.documentElement.dataset.theme ??
      localState("theme", "light")) as Theme;
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const update = () => setTheme(read());
    window.addEventListener("floward-theme", update);
    return () => window.removeEventListener("floward-theme", update);
  }, []);
  return theme;
}
export function cardColors(a: Appearance, theme: Theme) {
  const normal = a.fill.toLowerCase() === "#ffffff";
  const hex = normal && theme === "dark" ? "#171d26" : a.fill;
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const base = theme === "dark" ? 12 : 255;
  const brightness = channels.reduce(
    (sum, c, i) =>
      sum +
      (c * a.opacity + base * (1 - a.opacity)) * [0.2126, 0.7152, 0.0722][i],
    0,
  );
  return {
    background: fill({ ...a, fill: hex }),
    color: brightness > 140 ? "#272d33" : "#f3f6fb",
    borderColor:
      theme === "dark" && a.border === "#b3b8b5" ? "#647184" : a.border,
  };
}
