import type { BackgroundKind } from "./Background";
export type Appearance = {
  fill: string;
  opacity: number;
  border: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
};
export type View = { id: string; owner: string | null };
export type Lane = {
  id: string;
  view: string;
  title: string;
  width: number;
  order: number;
  archived: boolean;
  background?: BackgroundKind;
};
export type Task = {
  id: string;
  lane: string;
  title: string;
  notes: string;
  start: string;
  due: string;
  done: boolean;
  focused: boolean;
  fontFamily?: string;
  fontSize?: number;
  order: number;
  appearance: Appearance;
  created: string;
  modified: string;
  completed: string | null;
};
export type Edge = {
  id: string;
  source: string;
  target: string;
  label: string;
  dashed: boolean;
  color: string;
};
export type Band = {
  id: string;
  lane: string;
  title: string;
  y: number;
  height: number;
  appearance: Appearance;
};
export type Marker = {
  id: string;
  lane: string;
  title: string;
  y: number;
  date: string;
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
};
export type Trash = {
  id: string;
  title: string;
  kind: string;
  deleted: string;
  payload: Partial<Doc>;
};
export type Doc = {
  schema: 2;
  views: View[];
  lanes: Lane[];
  tasks: Task[];
  edges: Edge[];
  bands: Band[];
  markers: Marker[];
  trash: Trash[];
};
export type Snapshot = { revision: number; document: Doc };
export const id = () => crypto.randomUUID();
export const appearance = (): Appearance => ({
  fill: "#ffffff",
  opacity: 1,
  border: "#b3b8b5",
  lineWidth: 1,
  lineStyle: "solid",
});
export const createTask = (
  lane: string,
  title: string,
  order: number,
): Task => ({
  id: id(),
  lane,
  title,
  notes: "",
  start: "",
  due: "",
  done: false,
  focused: false,
  order,
  appearance: appearance(),
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  completed: null,
});
export const createLane = (
  view: string,
  order: number,
  title = "新泳道",
): Lane => ({ id: id(), view, title, width: 320, order, archived: false });
export function initial(): Doc {
  return {
    schema: 2,
    views: [{ id: "root", owner: null }],
    lanes: [{ ...createLane("root", 0, "我的事项"), id: "lane-first" }],
    tasks: [],
    edges: [],
    bands: [],
    markers: [],
    trash: [],
  };
}
export function depth(d: Doc, view: string) {
  let n = 0;
  let v = d.views.find((v) => v.id === view);
  const seen = new Set<string>();
  while (v?.owner) {
    if (seen.has(v.id)) throw Error("内部视图循环");
    seen.add(v.id);
    n++;
    const t = d.tasks.find((t) => t.id === v!.owner);
    const l = d.lanes.find((l) => l.id === t?.lane);
    v = d.views.find((v) => v.id === l?.view);
  }
  return n;
}
export function canConnect(d: Doc, a: string, b: string, exclude?: string) {
  const t = d.tasks.find((t) => t.id === a),
    u = d.tasks.find((t) => t.id === b);
  if (!t || !u) return "连接端点不存在";
  if (a === b) return "不能连接自己";
  if (t.lane !== u.lane) return "只能连接同一条泳道";
  const edges = d.edges.filter((e) => e.id !== exclude);
  if (edges.some((e) => e.source === a && e.target === b))
    return "已有这条连接";
  const pending = [b],
    seen = new Set<string>();
  while (pending.length) {
    const v = pending.pop()!;
    if (v === a) return "这条连接会形成环";
    if (seen.has(v)) continue;
    seen.add(v);
    pending.push(...edges.filter((e) => e.source === v).map((e) => e.target));
  }
  return null;
}
export function connect(d: Doc, a: string, b: string, exclude?: string) {
  const reason = canConnect(d, a, b, exclude);
  if (reason) throw Error(reason);
  if (exclude) {
    const e = d.edges.find((e) => e.id === exclude)!;
    e.source = a;
    e.target = b;
  } else
    d.edges.push({
      id: id(),
      source: a,
      target: b,
      label: "",
      dashed: false,
      color: "#7b827e",
    });
}
export function pathOf(d: Doc, task: string): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  let t = d.tasks.find((t) => t.id === task);
  while (t && !seen.has(t.id)) {
    seen.add(t.id);
    const l = d.lanes.find((l) => l.id === t!.lane);
    parts.unshift(l?.title ?? "", t.title);
    const v = d.views.find((v) => v.id === l?.view);
    t = d.tasks.find((t) => t.id === v?.owner);
  }
  return parts;
}
export function internalView(d: Doc, task: string): string {
  const existing = d.views.find((v) => v.owner === task);
  if (existing) return existing.id;
  const t = d.tasks.find((t) => t.id === task);
  const lane = d.lanes.find((l) => l.id === t?.lane);
  if (!lane || depth(d, lane.view) >= 2) throw Error("L2 事项只有详情");
  const view = { id: id(), owner: task };
  d.views.push(view);
  return view.id;
}
export function removeObjects(
  d: Doc,
  kind: "task" | "lane",
  selected: string[],
) {
  const taskIds = new Set(kind === "task" ? selected : []),
    laneIds = new Set(kind === "lane" ? selected : []),
    viewIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of d.tasks)
      if (laneIds.has(t.lane) && !taskIds.has(t.id)) {
        taskIds.add(t.id);
        changed = true;
      }
    for (const v of d.views)
      if (v.owner && taskIds.has(v.owner) && !viewIds.has(v.id)) {
        viewIds.add(v.id);
        changed = true;
      }
    for (const l of d.lanes)
      if (viewIds.has(l.view) && !laneIds.has(l.id)) {
        laneIds.add(l.id);
        changed = true;
      }
  }
  const payload: Partial<Doc> = {
    tasks: d.tasks.filter((t) => taskIds.has(t.id)),
    views: d.views.filter((v) => viewIds.has(v.id)),
    lanes: d.lanes.filter((l) => laneIds.has(l.id)),
    edges: d.edges.filter(
      (e) => taskIds.has(e.source) || taskIds.has(e.target),
    ),
    bands: d.bands.filter((b) => laneIds.has(b.lane)),
    markers: d.markers.filter((m) => laneIds.has(m.lane)),
  };
  const title =
    kind === "task"
      ? d.tasks.find((t) => selected.includes(t.id))?.title
      : d.lanes.find((l) => selected.includes(l.id))?.title;
  for (const k of [
    "tasks",
    "views",
    "lanes",
    "edges",
    "bands",
    "markers",
  ] as const) {
    const removed = new Set(payload[k]?.map((x) => x.id));
    (d as unknown as Record<string, unknown>)[k] = d[k].filter(
      (x) => !removed.has(x.id),
    );
  }
  d.trash.push({
    id: id(),
    title: title ?? "已删除内容",
    kind,
    deleted: new Date().toISOString(),
    payload,
  });
  return { tasks: taskIds.size, lanes: laneIds.size };
}
export function restoreTrash(d: Doc, trashId: string) {
  const item = d.trash.find((t) => t.id === trashId);
  if (!item) throw Error("回收项不存在");
  for (const k of ["views", "lanes", "tasks", "bands", "markers"] as const)
    (d[k] as { id: string }[]).push(...(item.payload[k] ?? []));
  for (const e of item.payload.edges ?? []) {
    const reason = canConnect(d, e.source, e.target);
    if (reason) throw Error("恢复连接冲突：" + reason);
    d.edges.push(e);
  }
  d.trash = d.trash.filter((t) => t.id !== trashId);
}
export function copyTasks(
  d: Doc,
  selected: string[],
  includeInside: boolean,
  destLane?: string,
) {
  const roots = d.tasks.filter((t) => selected.includes(t.id));
  if (!roots.length) return [];
  const ids = new Map<string, string>();
  const copies: Task[] = [];
  function copy(t: Task, lane: string): Task {
    const n = {
      ...structuredClone(t),
      id: id(),
      lane,
      done: false,
      focused: false,
      completed: null,
      created: new Date().toISOString(),
      order: Date.now() + copies.length,
    };
    ids.set(t.id, n.id);
    d.tasks.push(n);
    copies.push(n);
    if (includeInside) {
      const v = d.views.find((v) => v.owner === t.id);
      if (v) {
        const newView = internalView(d, n.id);
        for (const oldLane of [...d.lanes].filter((l) => l.view === v.id)) {
          const l = { ...oldLane, id: id(), view: newView };
          d.lanes.push(l);
          for (const task of [...d.tasks].filter((x) => x.lane === oldLane.id))
            copy(task, l.id);
          d.bands.push(
            ...d.bands
              .filter((b) => b.lane === oldLane.id)
              .map((b) => ({ ...structuredClone(b), id: id(), lane: l.id })),
          );
          d.markers.push(
            ...d.markers
              .filter((m) => m.lane === oldLane.id)
              .map((m) => ({ ...m, id: id(), lane: l.id })),
          );
        }
      }
    }
    return n;
  }
  for (const t of roots) copy(t, destLane ?? t.lane);
  d.edges.push(
    ...d.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        ...e,
        id: id(),
        source: ids.get(e.source)!,
        target: ids.get(e.target)!,
      })),
  );
  return copies;
}
export function resizeBand(
  d: Doc,
  bandId: string,
  edge: "top" | "bottom",
  position: number,
) {
  const b = d.bands.find((b) => b.id === bandId)!;
  const others = d.bands
    .filter((x) => x.lane === b.lane && x.id !== b.id)
    .sort((a, b) => a.y - b.y);
  if (edge === "top") {
    let y = Math.min(position, b.y + b.height - 24);
    const previous = others.filter((x) => x.y < b.y).at(-1);
    if (previous) {
      y = Math.max(y, previous.y + 24);
      if (y < previous.y + previous.height) previous.height = y - previous.y;
    }
    b.height += b.y - y;
    b.y = y;
  } else {
    let end = Math.max(position, b.y + 24);
    const next = others.find((x) => x.y >= b.y + b.height);
    if (next) {
      end = Math.min(end, next.y + next.height - 24);
      if (end > next.y) {
        next.height -= end - next.y;
        next.y = end;
      }
    }
    b.height = end - b.y;
  }
}
export function markdown(d: Doc) {
  const out = ["# 顺水意流 / floward\n"];
  function view(vid: string, level: number) {
    for (const l of d.lanes
      .filter((l) => l.view === vid)
      .sort((a, b) => a.order - b.order)) {
      out.push(
        `${"#".repeat(Math.min(6, level))} ${l.title}${l.archived ? "（归档）" : ""}\n`,
      );
      for (const t of d.tasks
        .filter((t) => t.lane === l.id)
        .sort((a, b) => a.order - b.order)) {
        out.push(
          `- [${t.done ? "x" : " "}] ${t.title}${t.start ? " · 开始 " + t.start : ""}${t.due ? " · 截止 " + t.due : ""}`,
        );
        if (t.notes) out.push("\n" + t.notes + "\n");
        for (const e of d.edges.filter((e) => e.source === t.id))
          out.push(
            `  → ${d.tasks.find((t) => t.id === e.target)?.title ?? ""}${e.label ? " [" + e.label + "]" : ""}${e.dashed ? "（虚线）" : ""}`,
          );
        const child = d.views.find((v) => v.owner === t.id);
        if (child) view(child.id, level + 1);
      }
      for (const b of d.bands.filter((b) => b.lane === l.id))
        out.push(`\n情境：${b.title}`);
      for (const m of d.markers.filter((m) => m.lane === l.id))
        out.push(`\n横线：${m.title} ${m.date}`);
    }
  }
  view("root", 2);
  return out.join("\n") + "\n";
}
