import type { Task, Edge } from "./model";
import type { Layout, Point } from "./layout";
import { width, height, fontSize, lineHeight } from "./sizing";

const siblingGap = 24;
export const layoutPadding = 24;
export function centeredTree(tasks: Task[], edges: Edge[]): Layout | null {
  const children = new Map(tasks.map((t) => [t.id, [] as Task[]]));
  const incoming = new Map<string, Edge>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const edge of edges) {
    if (
      incoming.has(edge.target) ||
      !byId.has(edge.source) ||
      !byId.has(edge.target)
    )
      return null;
    incoming.set(edge.target, edge);
    children.get(edge.source)!.push(byId.get(edge.target)!);
  }
  const roots = tasks
    .filter((t) => !incoming.has(t.id))
    .sort((a, b) => a.order - b.order);
  if (roots.length !== 1) return null;
  for (const list of children.values()) list.sort((a, b) => a.order - b.order);
  const spans = new Map<string, number>(),
    levels = new Map<string, number>(),
    rowHeights: number[] = [];
  const labelWidth = (edge?: Edge) =>
    edge?.label ? Math.min(220, [...edge.label].length * fontSize()) : 0;
  function measure(task: Task, level: number): number {
    levels.set(task.id, level);
    rowHeights[level] = Math.max(rowHeights[level] ?? 0, height(task));
    const below = children.get(task.id)!;
    const descendants =
      below.reduce((n, t) => n + measure(t, level + 1), 0) +
      Math.max(0, below.length - 1) * siblingGap;
    const span = Math.max(
      width(task),
      descendants,
      labelWidth(incoming.get(task.id)) + 12,
    );
    spans.set(task.id, span);
    return span;
  }
  measure(roots[0], 0);
  if (levels.size !== tasks.length) return null;
  const gap = edges.some((e) => e.label) ? 2 * (lineHeight() + 8) : 28;
  const rowY = [layoutPadding];
  for (let i = 1; i < rowHeights.length; i++)
    rowY[i] = rowY[i - 1] + rowHeights[i - 1] + gap;
  const positions: Record<string, Point> = {},
    routes: Layout["routes"] = {},
    labels: Layout["labels"] = {};
  function place(task: Task, left: number) {
    const span = spans.get(task.id)!;
    positions[task.id] = {
      x: left + (span - width(task)) / 2,
      y: rowY[levels.get(task.id)!],
    };
    const below = children.get(task.id)!;
    const total =
      below.reduce((n, t) => n + spans.get(t.id)!, 0) +
      Math.max(0, below.length - 1) * siblingGap;
    let x = left + (span - total) / 2;
    for (const child of below) {
      place(child, x);
      x += spans.get(child.id)! + siblingGap;
    }
  }
  place(roots[0], layoutPadding);
  for (const edge of edges) {
    const source = byId.get(edge.source)!,
      target = byId.get(edge.target)!;
    const from = {
      x: positions[source.id].x + width(source) / 2,
      y: positions[source.id].y + height(source),
    };
    const to = {
      x: positions[target.id].x + width(target) / 2,
      y: positions[target.id].y,
    };
    const busY = (from.y + to.y) / 2;
    routes[edge.id] = [from, { x: from.x, y: busY }, { x: to.x, y: busY }, to];
    if (edge.label)
      labels[edge.id] = { x: to.x - labelWidth(edge) / 2, y: busY + 3 };
  }
  return {
    positions,
    routes,
    labels,
    width: spans.get(roots[0].id)! + layoutPadding * 2,
    height: rowY.at(-1)! + rowHeights.at(-1)! + 32,
  };
}
