import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  ViewportPortal,
  type NodeProps,
  type EdgeProps,
  type Node as RFNode,
  type Edge as RFEdge,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  type Lane as LaneModel,
  type Task,
  type Band,
  type Marker,
  connect,
  canConnect,
  createTask,
  id,
  resizeBand,
} from "./model";
import {
  useStore,
  notify,
  stateGet,
  stateSet,
  localState,
  surface,
} from "./store";
import type { Layout, Point } from "./layout";
import { height, width, fontSize } from "./sizing";
import { arrange } from "./layout-service";
import { Draft, fill, type Action } from "./ui";
import { cardColors, useTheme } from "./theme";
import { Background } from "./Background";
import { useVisualDoc } from "./live-edit";
type TaskNode = RFNode<{
  task: Task;
  editing?: boolean;
  editTitle: (title: string) => void;
  saveTitle: (title: string) => void;
}>;
function InlineTitle({
  task,
  edit,
  save,
}: {
  task: Task;
  edit: (title: string) => void;
  save: (title: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const compositionEnded = useRef(-Infinity);
  const pendingBlur = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <textarea
      ref={input}
      className="task-editor nodrag nopan"
      aria-label="事项文字"
      defaultValue={task.title}
      placeholder="事项"
      onCompositionStart={() => {
        composing.current = true;
        pendingBlur.current = false;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        compositionEnded.current = performance.now();
        const value = e.currentTarget.value;
        edit(value);
        if (pendingBlur.current) {
          pendingBlur.current = false;
          save(value);
        }
      }}
      onChange={(e) => {
        if (!composing.current && !(e.nativeEvent as InputEvent).isComposing)
          edit(e.target.value);
      }}
      onBlur={(e) => {
        if (composing.current) {
          pendingBlur.current = true;
          return;
        }
        save(e.currentTarget.value);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          composing.current ||
          e.nativeEvent.isComposing ||
          e.nativeEvent.keyCode === 229 ||
          performance.now() - compositionEnded.current < 50
        )
          return;
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          input.current?.blur();
        }
      }}
    />
  );
}
function TaskCard({ data, selected }: NodeProps<TaskNode>) {
  const theme = useTheme();
  const t = data.task,
    a = t.appearance;
  return (
    <div
      className={"task-card" + (selected ? " selected" : "")}
      style={
        {
          fontFamily: t.fontFamily ? JSON.stringify(t.fontFamily) : undefined,
          fontSize: t.fontSize || undefined,
          "--task-line":
            Math.max(17, Math.ceil((t.fontSize || fontSize()) * 1.5)) + "px",
          width: width(t),
          height: height(t),
          padding: `${10 - a.lineWidth}px ${12 - a.lineWidth}px`,
          border: `${a.lineWidth}px ${a.lineStyle} ${a.border}`,
          ...cardColors(a, theme),
        } as React.CSSProperties
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        className="target-handle"
        style={{ top: -a.lineWidth }}
        isConnectableStart={false}
      />
      {data.editing ? (
        <InlineTitle task={t} edit={data.editTitle} save={data.saveTitle} />
      ) : (
        <div className={"task-title" + (t.done ? " done" : "")}>{t.title}</div>
      )}
      {(t.start || t.due) && (
        <div className="task-date">
          {[t.start, t.due].filter(Boolean).join(" → ")}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="source-handle"
        style={{ bottom: -a.lineWidth }}
        aria-label="从下边缘拉出连接"
      />
    </div>
  );
}
function RoutedEdge(
  p: EdgeProps<RFEdge<{ points: Point[]; labelPoint?: Point }>>,
) {
  const routed = p.data?.points;
  const from = { x: p.sourceX, y: p.sourceY },
    to = { x: p.targetX, y: p.targetY };
  const matches =
    routed?.length &&
    Math.abs(routed[0].x - from.x) < 1 &&
    Math.abs(routed[0].y - from.y) < 1 &&
    Math.abs(routed.at(-1)!.x - to.x) < 1 &&
    Math.abs(routed.at(-1)!.y - to.y) < 1;
  // Keep a visible connection while node measurements and async layout catch up.
  const points = matches
    ? routed!
    : [
        from,
        { x: from.x, y: (from.y + to.y) / 2 },
        { x: to.x, y: (from.y + to.y) / 2 },
        to,
      ];
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const middle = p.data?.labelPoint ?? points[Math.floor(points.length / 2)];
  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        markerEnd={p.markerEnd}
        style={p.style}
        interactionWidth={14}
      />
      {p.label && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(${middle.x}px,${middle.y}px)` }}
          >
            {p.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { task: TaskCard };
const edgeTypes = { routed: RoutedEdge };
type Props = {
  lane: LaneModel;
  active: boolean;
  activate: () => void;
  openTask: (id: string) => void;
  menu: (x: number, y: number, items: Action[]) => void;
  taskActions: (id: string) => Action[];
  laneActions: (id: string) => Action[];
  edgeActions: (id: string) => Action[];
  annotationActions: (kind: "bands" | "markers", id: string) => Action[];
  selected: string[];
  select: (ids: string[]) => void;
  showScrollbars: boolean;
  focusTarget: string | null;
};
export default function Lane(props: Props) {
  return (
    <ReactFlowProvider>
      <LaneInner {...props} />
    </ReactFlowProvider>
  );
}
function LaneInner(p: Props) {
  const theme = useTheme();
  const d = useVisualDoc();
  const change = useStore((s) => s.change);
  const rf = useReactFlow<TaskNode>();
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(p.lane.width);
  const [draft, setDraft] = useState<{
    point: Point;
    source?: string;
    task: Task;
  } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(
    null,
  );
  const savingEdit = useRef(false);
  useEffect(() => {
    if (editing) {
      try {
        localStorage.setItem("draft/inline/" + editing.id, editing.title);
      } catch {
        notify("编辑草稿未能缓存，请及时保存");
      }
    }
  }, [editing]);
  function startDraft(spec: { point: Point; source?: string }) {
    const task = createTask(p.lane.id, "", Date.now());
    setDraft({ ...spec, task });
    setEditing({ id: task.id, title: "" });
    p.select([task.id]);
    p.activate();
  }
  async function saveTitle(value?: string) {
    if (!editing || savingEdit.current) return;
    savingEdit.current = true;
    const edit = editing,
      title = (value ?? edit.title).trim() || "新事项";
    const isNew = draft?.task.id === edit.id;
    const ok = await change(isNew ? "新事项与连接" : "编辑事项文字", (doc) => {
      if (isNew) {
        doc.tasks.push({ ...draft!.task, title });
        if (draft!.source) connect(doc, draft!.source, edit.id);
      } else {
        const task = doc.tasks.find((t) => t.id === edit.id);
        if (!task) throw Error("事项已删除");
        if (task.title !== d.tasks.find((t) => t.id === edit.id)?.title)
          throw Error("事项文字已在其他窗口修改，请重新编辑");
        task.title = title;
        task.modified = new Date().toISOString();
      }
    });
    savingEdit.current = false;
    if (ok) {
      localStorage.removeItem("draft/inline/" + edit.id);
      setEditing((value) => (value?.id === edit.id ? null : value));
      if (isNew) setDraft(null);
    }
  }
  const [annotationDraft, setAnnotationDraft] = useState<{
    kind: "bands" | "markers";
    point: Point;
  } | null>(null);
  const [graph, setGraph] = useState<Layout>(
    () =>
      localState<{ graph: Layout }>("layout/" + p.lane.id, {
        graph: {
          positions: {},
          routes: {},
          labels: {},
          width: 216,
          height: 200,
        },
      }).graph,
  );
  const [preview, setPreview] = useState<{
    bands: Band[];
    markers: Marker[];
  } | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() =>
    localState("camera/" + p.lane.view + "/" + p.lane.id, {
      x: 0,
      y: 0,
      zoom: 1,
    }),
  );
  const touched = useRef(false);
  const connected = useRef(false);
  const viewportRef = useRef(viewport);
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollNotice, setScrollNotice] = useState(false);
  const reveal = useRef<string | null>(null);
  const escaped = useRef(false);
  const [font, setFont] = useState(fontSize);
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    const update = () => {
      setFont(fontSize());
      setFontRevision((n) => n + 1);
    };
    window.addEventListener("floward-font", update);
    return () => window.removeEventListener("floward-font", update);
  }, []);
  const previousGraph = useRef(graph);
  const tasks = [
    ...d.tasks.filter((t) => t.lane === p.lane.id),
    ...(draft && !d.tasks.some((t) => t.id === draft.task.id)
      ? [draft.task]
      : []),
  ].map((t) => (t.id === editing?.id ? { ...t, title: editing.title } : t));
  const taskIds = new Set(tasks.map((t) => t.id));
  const edges = [
    ...d.edges.filter((e) => taskIds.has(e.source)),
    ...(draft?.source
      ? [
          {
            id: "pending-" + draft.task.id,
            source: draft.source,
            target: draft.task.id,
            label: "",
            color: "#7b827e",
            dashed: false,
          },
        ]
      : []),
  ];
  const signature = JSON.stringify([
    font,
    fontRevision,
    tasks.map((t) => [
      t.id,
      t.title,
      t.start,
      t.due,
      t.order,
      t.fontFamily,
      t.fontSize,
    ]),
    edges.map((e) => [e.id, e.source, e.target, e.label]),
  ]);
  const bands = (preview?.bands ?? d.bands).filter((b) => b.lane === p.lane.id);
  const markers = (preview?.markers ?? d.markers).filter(
    (m) => m.lane === p.lane.id,
  );
  useEffect(() => setSize(p.lane.width), [p.lane.width]);
  useEffect(() => {
    let cancelled = false;
    void arrange(tasks, edges)
      .then((g) => {
        if (!cancelled) {
          const old = previousGraph.current;
          const v = viewportRef.current;
          const anchor = Object.entries(old.positions)
            .filter(
              ([id, point]) =>
                g.positions[id] &&
                point.x + v.x >= 0 &&
                point.x + v.x < size &&
                point.y + v.y >= 0 &&
                point.y + v.y < (el.current?.clientHeight ?? 600),
            )
            .sort((a, b) => a[1].y - b[1].y)[0];
          if (anchor && !reveal.current) {
            const next = {
              x: Math.min(
                0,
                Math.max(
                  Math.min(0, size - g.width),
                  v.x + anchor[1].x - g.positions[anchor[0]].x,
                ),
              ),
              y: Math.min(0, v.y + anchor[1].y - g.positions[anchor[0]].y),
              zoom: 1,
            };
            viewportRef.current = next;
            setViewport(next);
            stateSet("camera/" + p.lane.view + "/" + p.lane.id, next);
          }
          previousGraph.current = g;
          setGraph(g);
          stateSet("layout/" + p.lane.id, { signature, graph: g });
        }
      })
      .catch((e) => notify("布局未更新：" + String(e)));
    return () => {
      cancelled = true;
    };
  }, [signature]);
  const cameraKey = "camera/" + p.lane.view + "/" + p.lane.id;
  useEffect(() => {
    touched.current = false;
    void stateGet(cameraKey, viewportRef.current).then((v) => {
      if (!touched.current) {
        setViewport(v);
        viewportRef.current = v;
      }
    });
    return () => {
      if (cameraTimer.current) clearTimeout(cameraTimer.current);
      stateSet(cameraKey, viewportRef.current);
    };
  }, [cameraKey]);
  function move(v: Viewport) {
    const w = el.current?.clientWidth ?? size;
    const h = el.current?.clientHeight ?? 600;
    const contentH = Math.max(
      graph.height,
      ...bands.map((b) => b.y + b.height + 80),
      ...markers.map((m) => m.y + 80),
    );
    const next = {
      x: Math.min(0, Math.max(Math.min(0, w - graph.width), v.x)),
      y: Math.min(0, Math.max(Math.min(0, h - contentH), v.y)),
      zoom: 1,
    };
    touched.current = true;
    viewportRef.current = next;
    setViewport(next);
    if (cameraTimer.current) clearTimeout(cameraTimer.current);
    cameraTimer.current = setTimeout(() => stateSet(cameraKey, next), 160);
  }
  useEffect(() => {
    if (graph.width > size && !scrollNotice) {
      setScrollNotice(true);
      notify("此泳道可横向浏览：Ctrl＋左右，或 Shift＋滚轮");
    }
    if (graph.width <= size && viewportRef.current.x !== 0)
      move({ ...viewportRef.current, x: 0 });
  }, [graph.width, size]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") escaped.current = true;
    };
    const blur = () => {
      escaped.current = true;
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    if (reveal.current && graph.positions[reveal.current]) {
      const point = graph.positions[reveal.current];
      move({
        x: Math.min(
          0,
          size / 2 -
            point.x -
            (tasks.find((t) => graph.positions[t.id] === point)
              ? width(tasks.find((t) => graph.positions[t.id] === point)!) / 2
              : 32),
        ),
        y: Math.min(0, (el.current?.clientHeight ?? 600) / 2 - point.y),
        zoom: 1,
      });
      reveal.current = null;
    }
  }, [graph]);
  useEffect(() => {
    const locate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.lane === p.lane.id)
        move({ ...viewportRef.current, y: Math.min(0, 100 - detail.y) });
    };
    window.addEventListener("floward-locate-annotation", locate);
    return () =>
      window.removeEventListener("floward-locate-annotation", locate);
  }, [graph, size]);
  useEffect(() => {
    if (!p.focusTarget) return;
    const point = graph.positions[p.focusTarget];
    if (point) {
      const h = el.current?.clientHeight ?? 600;
      move({
        x: Math.min(0, size / 2 - point.x - 80),
        y: Math.min(0, h / 3 - point.y),
        zoom: 1,
      });
    }
  }, [p.focusTarget, graph.positions]);
  useEffect(() => {
    if (!p.active) return;
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true],[role=dialog],[role=menu]",
        )
      )
        return;
      if (
        e.ctrlKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        move({
          ...viewportRef.current,
          x:
            viewportRef.current.x +
            (e.key === "ArrowLeft" ? 80 : e.key === "ArrowRight" ? -80 : 0),
          y:
            viewportRef.current.y +
            (e.key === "ArrowUp" ? 100 : e.key === "ArrowDown" ? -100 : 0),
        });
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.altKey) {
        const task = d.tasks.find((t) => t.id === p.selected[0]);
        if (task) {
          e.preventDefault();
          setEditing({ id: task.id, title: task.title });
        }
      }
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        startDraft({
          point: {
            x: -viewportRef.current.x + 28,
            y: -viewportRef.current.y + 36,
          },
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [p.active, p.selected.join(), d.tasks, graph, size]);
  useEffect(() => {
    const element = el.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[role=menu]"))
        return;
      e.preventDefault();
      p.activate();
      move({
        ...viewportRef.current,
        x: viewportRef.current.x - (e.shiftKey ? e.deltaY : e.deltaX),
        y: viewportRef.current.y - (e.shiftKey ? 0 : e.deltaY),
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [graph, size, bands, markers]);
  function pointer(
    e: React.PointerEvent,
    update: (delta: number) => void,
    end: () => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const origin = e.clientY;
    const motion = (ev: PointerEvent) => update(ev.clientY - origin);
    const finish = () => {
      target.removeEventListener("pointermove", motion);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      end();
    };
    const cancel = () => {
      setPreview(null);
      target.removeEventListener("pointermove", motion);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
    };
    target.addEventListener("pointermove", motion);
    target.addEventListener("pointerup", finish, { once: true });
    target.addEventListener("pointercancel", cancel, { once: true });
  }
  function bandDrag(e: React.PointerEvent, b: Band, edge: "top" | "bottom") {
    let proposed = structuredClone(d);
    pointer(
      e,
      (delta) => {
        proposed = structuredClone(d);
        resizeBand(
          proposed,
          b.id,
          edge,
          (edge === "top" ? b.y : b.y + b.height) + delta,
        );
        setPreview({ bands: proposed.bands, markers: proposed.markers });
      },
      () => {
        setPreview(null);
        void change("调整色带", (latest) => {
          for (const b of proposed.bands.filter((b) => b.lane === p.lane.id)) {
            const current = latest.bands.find((x) => x.id === b.id);
            if (current) {
              current.y = b.y;
              current.height = b.height;
            }
          }
        });
      },
    );
  }
  function markerDrag(e: React.PointerEvent, m: Marker) {
    let y = m.y;
    pointer(
      e,
      (delta) => {
        y = m.y + delta;
        setPreview({
          bands: d.bands,
          markers: d.markers.map((x) => (x.id === m.id ? { ...x, y } : x)),
        });
      },
      () => {
        setPreview(null);
        void change("移动横线", (d) => {
          d.markers.find((x) => x.id === m.id)!.y = y;
        });
      },
    );
  }
  function blankMenu(e: MouseEvent | React.MouseEvent) {
    e.preventDefault();
    p.activate();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    p.menu(e.clientX, e.clientY, [
      { label: "新建事项", run: () => startDraft({ point: pos }) },
      ...p.laneActions(p.lane.id),
      {
        label: "添加情境色带",
        separator: true,
        run: () => setAnnotationDraft({ kind: "bands", point: pos }),
      },
      {
        label: "添加横线标记",
        run: () => setAnnotationDraft({ kind: "markers", point: pos }),
      },
    ]);
  }
  function draftPosition(point: Point) {
    return {
      left:
        Math.max(6, Math.min(size - 186, point.x + viewport.x)) - viewport.x,
      top:
        Math.max(
          6,
          Math.min(
            (el.current?.clientHeight ?? 400) - 110,
            point.y + viewport.y,
          ),
        ) - viewport.y,
    };
  }
  function gaps(y: number, h = 8) {
    const occupied = tasks.flatMap((t) => {
      const point = graph.positions[t.id];
      return point && y < point.y + height(t) + 4 && y + h > point.y - 4
        ? [[point.x + viewport.x - 4, point.x + viewport.x + width(t) + 4]]
        : [];
    });
    for (const edge of edges) {
      const label = graph.labels[edge.id];
      if (label && edge.label && y < label.y + 20 && y + h > label.y - 3)
        occupied.push([
          label.x + viewport.x - 3,
          label.x + viewport.x + Math.min(220, edge.label.length * font) + 6,
        ]);
    }
    occupied.sort((a, b) => a[0] - b[0]);
    const free: number[][] = [];
    let x = 6;
    for (const [left, right] of occupied) {
      if (left > x) free.push([x, Math.min(left, size - 6)]);
      x = Math.max(x, right);
    }
    if (x < size - 6) free.push([x, size - 6]);
    return free.filter(([a, b]) => b > a);
  }
  function labelPosition(y: number) {
    const choices = gaps(y, 20).sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    const space = choices[0];
    return space
      ? { left: space[0], maxWidth: space[1] - space[0] }
      : { left: 6, maxWidth: 18 };
  }
  function bandKey(e: React.KeyboardEvent, b: Band, edge: "top" | "bottom") {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      void change("调整色带边界", (d) =>
        resizeBand(
          d,
          b.id,
          edge,
          (edge === "top" ? b.y : b.y + b.height) +
            (e.key === "ArrowDown" ? 10 : -10),
        ),
      );
    }
  }
  const nodes: TaskNode[] = useMemo(
    () =>
      tasks
        .filter((t) => graph.positions[t.id] || t.id === draft?.task.id)
        .map((t) => ({
          id: t.id,
          type: "task",
          position: graph.positions[t.id] ?? draft!.point,
          data: {
            task: t,
            editing: editing?.id === t.id,
            editTitle: (title) => setEditing({ id: t.id, title }),
            saveTitle: (title) => void saveTitle(title),
          },
          selected: p.selected.includes(t.id),
          draggable: false,
          width: width(t),
          height: height(t),
          // Explicit geometry survives controlled-node replacement; otherwise RF
          // clears unmeasured handle bounds and can skip every connected edge.
          handles: [
            {
              type: "target",
              position: Position.Top,
              x: 0,
              y: 0,
              width: width(t),
              height: 10,
            },
            {
              type: "source",
              position: Position.Bottom,
              x: 0,
              y: height(t) - 10,
              width: width(t),
              height: 10,
            },
          ],
        })),
    [d.tasks, graph.positions, p.selected.join(), editing, draft, font],
  );
  const rfEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "routed",
        label: e.label,
        data: { points: graph.routes[e.id], labelPoint: graph.labels[e.id] },
        style: {
          stroke:
            theme === "dark" && e.color === "#7b827e" ? "#a5b5c7" : e.color,
          strokeWidth: 1,
          strokeDasharray: e.dashed ? "5 4" : undefined,
        },
        markerEnd: {
          type: "arrowclosed" as any,
          width: 14,
          height: 14,
          color:
            theme === "dark" && e.color === "#7b827e" ? "#a5b5c7" : e.color,
        },
      })),
    [d.edges, graph, draft, theme],
  );
  return (
    <section
      className={"lane" + (p.active ? " active" : "")}
      style={{ width: size }}
      data-lane-id={p.lane.id}
      onPointerDownCapture={() => p.activate()}
    >
      <div
        className="lane-title"
        tabIndex={0}
        onClick={p.activate}
        onContextMenu={(e) => {
          e.preventDefault();
          p.menu(e.clientX, e.clientY, p.laneActions(p.lane.id));
        }}
      >
        {p.lane.title}
      </div>
      <div
        className="lane-resize"
        role="separator"
        aria-label={"调整 " + p.lane.title + " 宽度"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.altKey || e.metaKey) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            void change("调整泳道宽度", (d) => {
              d.lanes.find((l) => l.id === p.lane.id)!.width = Math.max(
                200,
                size + (e.key === "ArrowRight" ? 20 : -20),
              );
            });
          }
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          const target = e.currentTarget;
          target.setPointerCapture(e.pointerId);
          const start = e.clientX;
          let width = size;
          const move = (ev: PointerEvent) => {
            width = Math.max(200, Math.min(10000, size + ev.clientX - start));
            setSize(width);
          };
          const end = () => {
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointercancel", cancel);
            void change("调整泳道宽度", (d) => {
              d.lanes.find((l) => l.id === p.lane.id)!.width = width;
            });
          };
          const cancel = () => {
            setSize(p.lane.width);
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", end);
          };
          target.addEventListener("pointermove", move);
          target.addEventListener("pointerup", end, { once: true });
          target.addEventListener("pointercancel", cancel, { once: true });
        }}
      />
      <div
        className="lane-flow"
        ref={el}
        data-background={p.lane.background ?? "plain"}
      >
        <div className="annotations">
          {bands.map((b) => (
            <div
              key={b.id}
              className="band"
              style={{
                top: b.y + viewport.y,
                height: b.height,
                background: fill(b.appearance),
                borderTop: `${b.appearance.lineWidth}px ${b.appearance.lineStyle} ${b.appearance.border}`,
                borderBottom: `${b.appearance.lineWidth}px ${b.appearance.lineStyle} ${b.appearance.border}`,
              }}
            >
              <span
                className="band-title"
                onContextMenu={(e) => {
                  e.preventDefault();
                  p.menu(
                    e.clientX,
                    e.clientY,
                    p.annotationActions("bands", b.id),
                  );
                }}
              >
                {b.title}
              </span>
            </div>
          ))}
        </div>
        <Background kind={p.lane.background ?? "plain"} />
        <ReactFlow
          style={
            {
              "--graph-width": graph.width + "px",
              "--graph-height": graph.height + "px",
            } as React.CSSProperties
          }
          nodes={nodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          viewport={viewport}
          onViewportChange={(v) => {
            const old = viewportRef.current;
            if (old.x !== v.x || old.y !== v.y || old.zoom !== v.zoom) {
              viewportRef.current = v;
              setViewport(v);
            }
          }}
          minZoom={1}
          maxZoom={1}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          panOnScroll={false}
          panOnDrag={false}
          nodesDraggable={false}
          nodesConnectable
          edgesReconnectable
          onReconnect={(edge, connection) => {
            void change("改接连接", (d) => {
              const current = d.edges.find((e) => e.id === edge.id);
              if (!current) throw Error("连接已删除");
              const other = {
                ...d,
                edges: d.edges.filter((e) => e.id !== edge.id),
              };
              const problem = canConnect(
                other,
                connection.source,
                connection.target,
              );
              if (problem) throw Error(problem);
              current.source = connection.source;
              current.target = connection.target;
            });
          }}
          deleteKeyCode={null}
          selectionKeyCode="Control"
          multiSelectionKeyCode="Control"
          onNodesChange={(changes) => {
            const selections = changes.filter((c) => c.type === "select");
            if (!selections.length) return;
            const ids = new Set(p.selected);
            for (const c of selections) {
              if (c.selected) ids.add(c.id);
              else ids.delete(c.id);
            }
            const next = [...ids];
            if (next.join() !== p.selected.join()) p.select(next);
          }}
          proOptions={{ hideAttribution: true }}
          onPaneClick={() => {
            p.select([]);
            p.activate();
          }}
          onPaneContextMenu={blankMenu}
          onNodeClick={(e, n) => {
            p.activate();
            if (!e.ctrlKey && !e.metaKey) p.select([n.id]);
          }}
          onNodeDoubleClick={(_, n) => {
            if (n.id !== draft?.task.id) p.openTask(n.id);
          }}
          onNodeContextMenu={(e, n) => {
            e.preventDefault();
            p.menu(e.clientX, e.clientY, p.taskActions(n.id));
          }}
          onEdgeContextMenu={(e, edge) => {
            e.preventDefault();
            p.menu(e.clientX, e.clientY, p.edgeActions(edge.id));
          }}
          onEdgeDoubleClick={(_, e) => p.edgeActions(e.id)[0]?.run()}
          onConnectStart={() => {
            connected.current = false;
            escaped.current = false;
          }}
          onConnect={(c) => {
            connected.current = true;
            void change("连接事项", (d) => connect(d, c.source, c.target));
          }}
          onConnectEnd={(e, s) => {
            if (connected.current || escaped.current || !s.fromNode) return;
            const event = e as MouseEvent;
            if (
              !event.clientX ||
              event.clientX < 0 ||
              event.clientY < 0 ||
              event.clientX >= window.innerWidth ||
              event.clientY >= window.innerHeight
            )
              return;
            const target = document.elementFromPoint(
              event.clientX,
              event.clientY,
            );
            if (
              target
                ?.closest("[data-lane-id]")
                ?.getAttribute("data-lane-id") !== p.lane.id
            ) {
              notify("只能连接同一条泳道");
              return;
            }
            const nodeId = target
              .closest(".react-flow__node")
              ?.getAttribute("data-id");
            if (nodeId) {
              void change("连接事项", (d) =>
                connect(d, s.fromNode!.id, nodeId),
              );
              return;
            }
            if (!target.closest(".react-flow__pane")) return;
            startDraft({
              source: s.fromNode.id,
              point: rf.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              }),
            });
          }}
        >
          <ViewportPortal>
            {annotationDraft && (
              <div
                style={{
                  position: "absolute",
                  ...draftPosition(annotationDraft.point),
                  zIndex: 100,
                }}
              >
                <Draft
                  inputLabel={
                    annotationDraft.kind === "bands"
                      ? "情境色带标题"
                      : "横线标记标题"
                  }
                  draftKey={
                    "draft/" +
                    surface +
                    "/" +
                    p.lane.id +
                    "/" +
                    annotationDraft.kind
                  }
                  onCancel={() => setAnnotationDraft(null)}
                  onConfirm={async (title) => {
                    const ok = await change("新建标注", (d) => {
                      const y = Math.max(0, annotationDraft.point.y);
                      if (annotationDraft.kind === "bands") {
                        if (
                          d.bands.some(
                            (b) =>
                              b.lane === p.lane.id &&
                              y < b.y + b.height &&
                              y + 180 > b.y,
                          )
                        )
                          throw Error("这里已有色带，请在空白处创建");
                        d.bands.push({
                          id: id(),
                          lane: p.lane.id,
                          title,
                          y,
                          height: 180,
                          appearance: {
                            fill: "#dce8e0",
                            opacity: 0.4,
                            border: "#cbd8ce",
                            lineWidth: 1,
                            lineStyle: "solid",
                          },
                        });
                      } else
                        d.markers.push({
                          id: id(),
                          lane: p.lane.id,
                          title,
                          y,
                          date: "",
                          color: "#9a8c75",
                          lineWidth: 1,
                          lineStyle: "solid",
                        });
                    });
                    if (ok) setAnnotationDraft(null);
                    return ok;
                  }}
                />
              </div>
            )}
          </ViewportPortal>
        </ReactFlow>
        <div className="annotation-handles">
          {bands.map((b) => (
            <div key={b.id}>
              <div
                className="band-edge"
                aria-label={b.title + " 上边界"}
                tabIndex={0}
                onKeyDown={(e) => bandKey(e, b, "top")}
                style={{ top: b.y + viewport.y }}
                onPointerDown={(e) => bandDrag(e, b, "top")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  p.menu(
                    e.clientX,
                    e.clientY,
                    p.annotationActions("bands", b.id),
                  );
                }}
              />
              <div
                className="band-edge"
                aria-label={b.title + " 下边界"}
                tabIndex={0}
                onKeyDown={(e) => bandKey(e, b, "bottom")}
                style={{ top: b.y + b.height + viewport.y }}
                onPointerDown={(e) => bandDrag(e, b, "bottom")}
              />
              <span
                className="band-title-hit"
                style={{
                  top: b.y + viewport.y + 5,
                  left: 10,
                  maxWidth: "calc(100% - 20px)",
                }}
                title={b.title}
                onContextMenu={(e) => {
                  e.preventDefault();
                  p.menu(
                    e.clientX,
                    e.clientY,
                    p.annotationActions("bands", b.id),
                  );
                }}
              >
                {b.title}
              </span>
            </div>
          ))}
          {markers.map((m) => (
            <div
              key={m.id}
              className="marker"
              style={{
                top: m.y + viewport.y,
                color: m.color,
              }}
              tabIndex={0}
              aria-label={m.title + " 横线位置"}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.altKey || e.metaKey) return;
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  void change("移动横线", (d) => {
                    d.markers.find((x) => x.id === m.id)!.y = Math.max(
                      0,
                      m.y + (e.key === "ArrowDown" ? 10 : -10),
                    );
                  });
                }
              }}
              onPointerDown={(e) => markerDrag(e, m)}
              onContextMenu={(e) => {
                e.preventDefault();
                p.menu(
                  e.clientX,
                  e.clientY,
                  p.annotationActions("markers", m.id),
                );
              }}
            >
              {gaps(m.y - 4, 12).map(([left, right], i) => (
                <i
                  key={i}
                  style={{
                    position: "absolute",
                    left,
                    width: right - left,
                    borderTop: `${m.lineWidth}px ${m.lineStyle} ${m.color}`,
                    height: 7,
                    pointerEvents: "auto",
                  }}
                />
              ))}
              <span
                style={labelPosition(m.y - 20)}
                title={m.title + (m.date ? " · " + m.date : "")}
              >
                {m.title}
                {m.date ? " · " + m.date : ""}
              </span>
            </div>
          ))}
        </div>
        {!tasks.length && !draft && (
          <p className="empty">右键新建事项，或 Ctrl＋N</p>
        )}
        {p.showScrollbars && graph.width > size && (
          <input
            className="h-scroll"
            type="range"
            aria-label="泳道横向位置"
            min="0"
            max={graph.width - size}
            value={-viewport.x}
            onChange={(e) =>
              move({ ...viewportRef.current, x: -Number(e.target.value) })
            }
          />
        )}
      </div>
    </section>
  );
}
