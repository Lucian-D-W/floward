import ELK, { type ElkNode } from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import type { Task, Edge } from "./model";
import { height, width, fontSize, lineHeight } from "./sizing";
import { centeredTree } from "./tree-layout";
const elk = new ELK({ workerFactory: () => new ElkWorker() });
export type Point = { x: number; y: number };
export type Layout = {
  positions: Record<string, Point>;
  routes: Record<string, Point[]>;
  labels: Record<string, Point>;
  width: number;
  height: number;
};

export async function layout(tasks: Task[], edges: Edge[]): Promise<Layout> {
  // Pack independent components without changing the geometry inside a branch.
  const adjacency = new Map(tasks.map((t) => [t.id, [] as string[]]));
  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  }
  const seen = new Set<string>();
  const result: Layout = {
    positions: {},
    routes: {},
    labels: {},
    width: 48,
    height: 80,
  };
  let offset = 0;
  for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
    if (seen.has(task.id)) continue;
    const ids = new Set<string>(),
      queue = [task.id];
    seen.add(task.id);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      ids.add(id);
      for (const next of adjacency.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const partTasks = tasks.filter((t) => ids.has(t.id)),
      partEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const part =
      centeredTree(partTasks, partEdges) ??
      (await layered(partTasks, partEdges));
    for (const [id, p] of Object.entries(part.positions))
      result.positions[id] = { x: p.x + offset, y: p.y };
    for (const [id, points] of Object.entries(part.routes))
      result.routes[id] = points.map((p) => ({ x: p.x + offset, y: p.y }));
    for (const [id, p] of Object.entries(part.labels))
      result.labels[id] = { x: p.x + offset, y: p.y };
    result.width = offset + part.width;
    result.height = Math.max(result.height, part.height);
    offset += part.width - 24;
  }
  return result;
}
async function layered(tasks: Task[], edges: Edge[]): Promise<Layout> {
  const result = await elk.layout<ElkNode>({
    id: "lane",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": "28",
      "elk.padding": "[top=24,left=24,bottom=32,right=24]",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.randomSeed": "1",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.nodePlacement.favorStraightEdges": "false",
    },
    children: [...tasks]
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        width: width(t),
        height: height(t),
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [
          {
            id: t.id + "/in",
            x: width(t) / 2,
            y: 0,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "NORTH" },
          },
          {
            id: t.id + "/out",
            x: width(t) / 2,
            y: height(t),
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "SOUTH" },
          },
        ],
      })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source + "/out"],
      targets: [e.target + "/in"],
      labels: e.label
        ? [
            {
              text: e.label,
              width: Math.min(220, e.label.length * fontSize()),
              height: lineHeight(),
            },
          ]
        : [],
    })),
  });
  const positions: Layout["positions"] = {},
    routes: Layout["routes"] = {},
    labels: Layout["labels"] = {};
  for (const n of result.children ?? [])
    positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
  for (const e of result.edges ?? []) {
    const s = e.sections?.[0];
    if (s) routes[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    if (e.labels?.[0])
      labels[e.id] = { x: e.labels[0].x ?? 0, y: e.labels[0].y ?? 0 };
  }
  return {
    positions,
    routes,
    labels,
    width: result.width ?? 216,
    height: result.height ?? 200,
  };
}
