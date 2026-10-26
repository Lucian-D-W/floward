import type { Task } from "./model";
export function fontSize() {
  return typeof document === "undefined"
    ? 11
    : parseFloat(getComputedStyle(document.documentElement).fontSize) || 11;
}
export function lineHeight() {
  return Math.max(17, Math.ceil(fontSize() * 1.5));
}
let probe: HTMLDivElement | undefined;
const measured = new Map<string, { width: number; height: number }>();
export function dimensions(t: Task) {
  const font = t.fontSize || fontSize(),
    line = Math.max(17, Math.ceil(font * 1.5));
  const family = t.fontFamily
    ? JSON.stringify(t.fontFamily)
    : typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.documentElement).fontFamily;
  const key = JSON.stringify([family, font, t.title, t.start, t.due]);
  const cached = measured.get(key);
  if (cached) return cached;
  const date = [t.start, t.due].filter(Boolean).join(" → ");
  if (typeof document !== "undefined" && document.body && !probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;";
    document.body.appendChild(probe);
  }
  const textHeight = (text: string, width: number) => {
    if (!text) return line;
    if (probe) {
      probe.style.fontFamily = family;
      probe.style.fontSize = font + "px";
      probe.style.lineHeight = line + "px";
      probe.style.width = width + "px";
      probe.textContent = text;
      return Math.ceil(probe.getBoundingClientRect().height);
    }
    return text
      .split("\n")
      .reduce(
        (sum, s) =>
          sum +
          Math.max(
            1,
            Math.ceil(
              [...s].reduce(
                (n, c) => n + (c.charCodeAt(0) > 255 ? font : font * 0.65),
                0,
              ) / width,
            ),
          ) *
            line,
        0,
      );
  };
  // Search integral 4×3 units, so both dimensions remain an exact ratio.
  const fits = (units: number) =>
    20 +
      textHeight(t.title, units * 4 - 24) +
      (date ? textHeight(date, units * 4 - 24) : 0) <=
    units * 3;
  let low = 16,
    high = 16;
  while (!fits(high)) high *= 2;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) high = mid;
    else low = mid + 1;
  }
  const result = { width: low * 4, height: low * 3 };
  if (measured.size > 10000) measured.clear();
  measured.set(key, result);
  return result;
}
export const width = (t: Task) => dimensions(t).width;
export const height = (t: Task) => dimensions(t).height;
