import { NumberDraft } from "./NumberDraft";
import {
  initTypography,
  readTypography,
  setTypography,
  systemFonts,
} from "./typography";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Lane from "./Lane";
import { useLiveEdit } from "./live-edit";
import { WindowControls } from "./WindowControls";
import { Background, backgrounds } from "./Background";
import { applyTheme, useTheme } from "./theme";
import {
  useStore,
  notify,
  native,
  surface,
  stateGet,
  stateSet,
  localState,
  flushPending,
} from "./store";
import {
  appearance,
  createLane,
  internalView,
  pathOf,
  depth,
  removeObjects,
  restoreTrash,
  copyTasks,
  markdown,
  type Task,
  type Doc,
  type Appearance,
  type Marker,
} from "./model";
import { Menu, Modal, TextForm, StyleForm, type Action } from "./ui";
type ModalState = { title: string; content: ReactNode };
export default function App() {
  const { doc: d, change, undo, reload, error, notice, busy } = useStore();
  const [route, setRoute] = useState<string[]>(() => localState("route", []));
  const [active, setActive] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: Action[];
  } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [scrollbars, setScrollbars] = useState(false);
  const outer = useRef<HTMLElement>(null);
  const [showNotes, setShowNotes] = useState(true);
  useEffect(() => {
    if (!native || surface !== "main") return;
    const pending = getCurrentWindow().onCloseRequested((e) => {
      e.preventDefault();
      void flushPending()
        .then(() => invoke("close_workbench"))
        .catch((error) => useStore.setState({ error: String(error) }));
    });
    return () => {
      void pending.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!native || surface !== "main") return;
    const pending = listen<string>("floward-tray-action", ({ payload }) => {
      if (payload !== "desktop_close" && payload !== "app_exit") return;
      void flushPending()
        .then(() => invoke(payload))
        .catch((error) =>
          useStore.setState({ error: "操作未完成：" + String(error) }),
        );
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => setShowNotes(true), [route.at(-1)]);
  useEffect(() => {
    void reload();
    void stateGet("route", [] as string[]).then(setRoute);
    void stateGet("scrollbars", false).then(setScrollbars);
    applyTheme(localState("theme", "light"));
    void stateGet("theme", "light").then((v) => applyTheme(v));
    const typography = initTypography().catch((error) => {
      useStore.setState({ error: String(error) });
      return () => {};
    });
    return () => {
      void typography.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => {
    if (d && route.some((id) => !d.tasks.some((t) => t.id === id)))
      setRoute(route.filter((id) => d.tasks.some((t) => t.id === id)));
  }, [d]);
  const owner = d?.tasks.find((t) => t.id === route.at(-1));
  const ownerLane = d?.lanes.find((l) => l.id === owner?.lane);
  const deepest = !!(d && ownerLane && depth(d, ownerLane.view) >= 2);
  const viewId = owner
    ? d?.views.find((v) => v.owner === owner.id)?.id
    : "root";
  const lanes =
    d?.lanes
      .filter((l) => l.view === viewId && !l.archived)
      .sort((a, b) => a.order - b.order) ?? [];
  useEffect(() => {
    stateSet("route", route);
    setSelected([]);
    setShowNotes(true);
  }, [route]);
  useEffect(() => {
    if (!lanes.some((l) => l.id === active)) setActive(lanes[0]?.id ?? "");
    const elem = outer.current;
    if (!elem) return;
    void stateGet("outer/" + (viewId ?? route.at(-1)), 0).then((x) => {
      if (outer.current === elem) elem.scrollLeft = x;
    });
  }, [viewId, lanes.map((l) => l.id).join("|")]);
  function showMenu(x: number, y: number, items: Action[]) {
    setMenu({ x, y, items });
  }
  function close() {
    setModal(null);
  }
  function rename(kind: "tasks" | "lanes" | "bands" | "markers", id: string) {
    const entity = d![kind].find((t) => t.id === id)!;
    setModal({
      title: "改名",
      content: (
        <TextForm
          value={entity.title}
          label="名称"
          submit={async (title) => {
            if (
              await change("改名", (d) => {
                const t = d[kind].find((t) => t.id === id);
                if (!t) throw Error("对象已经删除");
                t.title = title;
              })
            )
              close();
          }}
        />
      ),
    });
  }
  function style(kind: "tasks" | "bands", id: string) {
    const entity = d![kind].find((t) => t.id === id)!;
    setModal({
      title: "外观",
      content: <StyleForm value={entity.appearance} kind={kind} id={id} />,
    });
  }
  function editTask(id: string) {
    setModal({
      title: "时间与说明",
      content: <Metadata key={id} task={d!.tasks.find((t) => t.id === id)!} />,
    });
  }
  function goView(vid: string) {
    const ids: string[] = [];
    let v = d!.views.find((v) => v.id === vid);
    while (v?.owner) {
      ids.unshift(v.owner);
      const t = d!.tasks.find((t) => t.id === v!.owner);
      const l = d!.lanes.find((l) => l.id === t?.lane);
      v = d!.views.find((v) => v.id === l?.view);
    }
    setRoute(ids);
  }
  function locate(kind: string, id: string) {
    let laneId: string | undefined;
    let target: string | null = null;
    if (kind === "tasks") {
      const t = d!.tasks.find((t) => t.id === id);
      laneId = t?.lane;
      target = id;
    } else if (kind === "lanes") laneId = id;
    else if (kind === "edges") {
      const edge = d!.edges.find((e) => e.id === id);
      target = edge?.source ?? null;
      laneId = d!.tasks.find((t) => t.id === target)?.lane;
    } else
      laneId = (d as unknown as Record<string, { id: string; lane: string }[]>)[
        kind
      ]?.find((x) => x.id === id)?.lane;
    const lane = d!.lanes.find((l) => l.id === laneId);
    if (!lane) return;
    if (lane.archived)
      void change("显示归档泳道", (d) => {
        d.lanes.find((l) => l.id === lane.id)!.archived = false;
      });
    goView(lane.view);
    setActive(lane.id);
    setFocusTarget(null);
    requestAnimationFrame(() => setFocusTarget(target));
    close();
    setTimeout(() => {
      document
        .querySelector(`[data-lane-id="${lane.id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (!target && (kind === "bands" || kind === "markers")) {
        const obj = d![kind].find((x) => x.id === id);
        if (obj)
          window.dispatchEvent(
            new CustomEvent("floward-locate-annotation", {
              detail: { lane: lane.id, y: obj.y },
            }),
          );
      }
    }, 200);
  }
  function newLane() {
    setModal({
      title: "新建泳道",
      content: (
        <TextForm
          label="泳道名称"
          submit={async (title) => {
            let created = "";
            if (
              await change("新建泳道", (d) => {
                const v = owner ? internalView(d, owner.id) : "root";
                const l = createLane(v, Date.now(), title);
                created = l.id;
                d.lanes.push(l);
              })
            ) {
              setActive(created);
              close();
            }
          }}
        />
      ),
    });
  }
  function confirmRemove(kind: "task" | "lane", ids: string[]) {
    const trial = structuredClone(d!);
    const count = removeObjects(trial, kind, ids);
    setModal({
      title: "移入回收站",
      content: (
        <>
          <p>
            将删除 {count.tasks} 个事项、{count.lanes}{" "}
            条泳道及其内部内容。箭头下游事项会保留，可撤销或从回收站恢复。
          </p>
          <div className="form-actions">
            <button onClick={close}>取消</button>
            <button
              onClick={async () => {
                if (
                  await change("移入回收站", (d) => {
                    removeObjects(d, kind, ids);
                  })
                )
                  close();
              }}
            >
              移入回收站
            </button>
          </div>
        </>
      ),
    });
  }
  function taskActions(id: string): Action[] {
    const t = d!.tasks.find((t) => t.id === id)!;
    const group = selected.includes(id) ? selected : [id];
    return [
      { label: "改名", run: () => rename("tasks", id) },
      { label: "时间与说明", run: () => editTask(id) },
      { label: "外观", run: () => style("tasks", id) },
      {
        label: t.done ? "重新打开" : "完成",
        run: () => {
          void change("切换完成状态", (d) => {
            const task = d.tasks.find((t) => t.id === id)!;
            task.done = !task.done;
            task.completed = task.done ? new Date().toISOString() : null;
          });
        },
      },
      {
        label: t.focused ? "取消保留关注" : "保留关注",
        run: () => {
          void change("保留关注", (d) => {
            const t = d.tasks.find((t) => t.id === id)!;
            t.focused = !t.focused;
          });
        },
      },
      {
        label: "复制选中事项（不含内部内容）",
        separator: true,
        run: () => {
          void change("复制事项", (d) => {
            copyTasks(d, group, false);
          });
        },
      },
      {
        label: "连同内部内容复制",
        run: () => {
          void change("复制事项及内部内容", (d) => {
            copyTasks(d, group, true);
          });
        },
      },
      {
        label: "移动到另一泳道…",
        run: () =>
          setModal({
            title: "移动事项",
            content: (
              <>
                <p>
                  集合内连接保留，与集合外事项的连接将撤掉。内部内容随事项移动。
                </p>
                {d!.lanes
                  .filter((l) => l.id !== t.lane)
                  .map((l) => (
                    <button
                      className="result"
                      key={l.id}
                      onClick={async () => {
                        if (
                          await change("移动事项", (d) => {
                            for (const t of d.tasks)
                              if (group.includes(t.id)) t.lane = l.id;
                            d.edges = d.edges.filter(
                              (e) =>
                                group.includes(e.source) ===
                                group.includes(e.target),
                            );
                          })
                        )
                          close();
                      }}
                    >
                      {l.title}
                    </button>
                  ))}
              </>
            ),
          }),
      },
      {
        label: "删除…",
        separator: true,
        run: () => confirmRemove("task", group),
      },
    ];
  }
  function laneActions(id: string): Action[] {
    const lane = d!.lanes.find((l) => l.id === id)!;
    return [
      { label: "泳道改名", run: () => rename("lanes", id) },
      {
        label: "泳道背景…",
        run: () =>
          setModal({
            title: "泳道背景",
            content: (
              <div className="background-options">
                {backgrounds.map(([value, label]) => (
                  <button
                    className="background-option"
                    aria-pressed={(lane.background ?? "plain") === value}
                    key={value}
                    onClick={async () => {
                      if (
                        await change("设置泳道背景", (d) => {
                          d.lanes.find((l) => l.id === id)!.background = value;
                        })
                      )
                        close();
                    }}
                  >
                    <span className="background-sample">
                      <Background kind={value} />
                    </span>
                    <span>
                      {(lane.background ?? "plain") === value ? "✓ " : ""}
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            ),
          }),
      },
      {
        label: "向左排列",
        run: () => {
          void change("排列泳道", (d) => {
            const siblings = d.lanes
              .filter((l) => l.view === lane.view)
              .sort((a, b) => a.order - b.order);
            const n = siblings.findIndex((l) => l.id === id);
            if (n > 0)
              [siblings[n].order, siblings[n - 1].order] = [
                siblings[n - 1].order,
                siblings[n].order,
              ];
          });
        },
      },
      {
        label: "向右排列",
        run: () => {
          void change("排列泳道", (d) => {
            const siblings = d.lanes
              .filter((l) => l.view === lane.view)
              .sort((a, b) => a.order - b.order);
            const n = siblings.findIndex((l) => l.id === id);
            if (n < siblings.length - 1)
              [siblings[n].order, siblings[n + 1].order] = [
                siblings[n + 1].order,
                siblings[n].order,
              ];
          });
        },
      },
      {
        label: scrollbars ? "隐藏滚动条" : "显示滚动条",
        run: () => {
          setScrollbars(!scrollbars);
          stateSet("scrollbars", !scrollbars);
        },
      },
      {
        label: "归档泳道",
        run: () => {
          void change("归档泳道", (d) => {
            d.lanes.find((l) => l.id === id)!.archived = true;
          });
        },
      },
      { label: "删除泳道…", run: () => confirmRemove("lane", [id]) },
    ];
  }
  function edgeActions(id: string): Action[] {
    const edge = d!.edges.find((e) => e.id === id)!;
    return [
      {
        label: "修改连接文字",
        run: () =>
          setModal({
            title: "连接文字",
            content: (
              <EdgeForm
                label={edge.label}
                submit={async (label) => {
                  if (
                    await change("连接文字", (d) => {
                      d.edges.find((e) => e.id === id)!.label = label;
                    })
                  )
                    close();
                }}
              />
            ),
          }),
      },
      {
        label: edge.dashed ? "改为实线" : "改为虚线",
        run: () => {
          void change("连接线型", (d) => {
            const e = d.edges.find((e) => e.id === id)!;
            e.dashed = !e.dashed;
          });
        },
      },
      {
        label: "改接…",
        run: () =>
          setModal({
            title: "改接连接",
            content: (
              <ReconnectForm
                d={d!}
                edgeId={id}
                save={async (source, target) => {
                  if (
                    await change("改接连接", (d) => {
                      const e = d.edges.find((e) => e.id === id)!;
                      e.source = source;
                      e.target = target;
                    })
                  )
                    close();
                }}
              />
            ),
          }),
      },
      {
        label: "删除连接",
        run: () => {
          void change("删除连接", (d) => {
            d.edges = d.edges.filter((e) => e.id !== id);
          });
        },
      },
    ];
  }
  function annotationActions(kind: "bands" | "markers", id: string): Action[] {
    return [
      { label: "改名", run: () => rename(kind, id) },
      kind === "bands"
        ? { label: "外观", run: () => style("bands", id) }
        : {
            label: "横线外观与时间",
            run: () =>
              setModal({
                title: "横线标记",
                content: (
                  <MarkerForm marker={d!.markers.find((m) => m.id === id)!} />
                ),
              }),
          },
      {
        label:
          kind === "bands"
            ? "删除色带（保留事项和横线）"
            : "删除横线（保留事项）",
        run: () => {
          void change("删除标注", (d) => {
            if (kind === "bands") d.bands = d.bands.filter((b) => b.id !== id);
            else d.markers = d.markers.filter((m) => m.id !== id);
          });
        },
      },
    ];
  }
  function search(focused = false) {
    setModal({
      title: focused ? "保留关注" : "搜索",
      content: <Search doc={d!} focused={focused} locate={locate} />,
    });
  }
  async function desktop() {
    if (!native) {
      notify("请在 Windows 程序中使用桌面显示");
      return;
    }
    try {
      const monitors = await invoke<
        {
          index: number;
          name: string;
          width: number;
          height: number;
          scale: number;
          active: boolean;
        }[]
      >("monitors");
      setModal({
        title: "桌面显示",
        content: (
          <>
            <p>选择显示器，工作台和桌面共享事项，各自保留浏览位置。</p>
            {monitors.map((m) => (
              <div key={m.index}>
                <button
                  className="result"
                  key={m.index}
                  onClick={async () => {
                    try {
                      await invoke("desktop_open", { index: m.index });
                      notify("桌面已显示");
                      close();
                    } catch (e) {
                      useStore.setState({ error: String(e) });
                    }
                  }}
                >
                  {m.name} · {m.width} × {m.height} ·{" "}
                  {Math.round(m.scale * 100)}%{m.active ? " · 已显示" : ""}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await invoke("desktop_adjust", { index: m.index });
                      close();
                      notify("已在该屏幕开启实时调整");
                    } catch (e) {
                      useStore.setState({ error: String(e) });
                    }
                  }}
                >
                  调整此屏桌面布局
                </button>
              </div>
            ))}
            <button
              onClick={async () => {
                try {
                  await invoke("desktop_close");
                  close();
                } catch (e) {
                  useStore.setState({ error: String(e) });
                }
              }}
            >
              关闭所有桌面显示
            </button>
            {surface.startsWith("desktop-") && (
              <button onClick={() => void invoke("show_workbench")}>
                打开工作台
              </button>
            )}
          </>
        ),
      });
    } catch (e) {
      useStore.setState({ error: String(e) });
    }
  }
  async function exportFile(kind: string) {
    if (native) {
      try {
        const path = await invoke<string | null>("export_file", {
          kind,
          text: kind === "markdown" ? markdown(d!) : null,
        });
        if (path) notify("已导出：" + path);
      } catch (e) {
        useStore.setState({ error: String(e) });
      }
    } else {
      const blob = new Blob(
        [kind === "markdown" ? markdown(d!) : JSON.stringify(d, null, 2)],
        { type: "text/plain;charset=utf-8" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "floward." + (kind === "markdown" ? "md" : "json");
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }
  function importFile(backup: boolean) {
    if (!native) {
      notify("请在 Windows 程序中导入文件");
      return;
    }
    setModal({
      title: backup ? "恢复完整备份" : "导入 V2 JSON",
      content: (
        <>
          <p>
            {backup
              ? "验证备份后恢复数据和设置，当前库会另存为恢复前副本。"
              : "选择文件后验证 V2 结构并替换当前内容。此次导入可以撤销。"}
          </p>
          <button
            onClick={async () => {
              try {
                const result = await invoke<Doc | { restored: boolean } | null>(
                  "import_file",
                  { backup },
                );
                if (result) {
                  if ("restored" in result) {
                    await reload();
                    notify("完整备份已恢复");
                  } else
                    await change("导入 V2 JSON", (d) =>
                      Object.assign(d, result),
                    );
                  close();
                }
              } catch (e) {
                useStore.setState({ error: String(e) });
              }
            }}
          >
            选择文件
          </button>
        </>
      ),
    });
  }
  function trash() {
    setModal({
      title: "回收站与归档",
      content: <TrashPanel onLocate={locate} />,
    });
  }
  function topActions(): Action[] {
    return [
      { label: "新建泳道", disabled: deepest, run: newLane },
      { label: "搜索  Ctrl＋K", run: () => search() },
      { label: "保留关注", run: () => search(true) },
      { label: "回收站与归档", run: trash },
      { label: "撤销  Ctrl＋Z", separator: true, run: () => void undo() },
      { label: "重做  Ctrl＋Shift＋Z", run: () => void undo(true) },
      ...(owner
        ? [
            { label: "当前事项的时间与说明", run: () => editTask(owner.id) },
            {
              label: showNotes ? "收起说明" : "展开说明",
              run: () => setShowNotes(!showNotes),
            },
          ]
        : []),
      {
        label: "完整备份…",
        separator: true,
        run: () => void exportFile("backup"),
      },
      { label: "恢复完整备份…", run: () => importFile(true) },
      { label: "导出 V2 JSON…", run: () => void exportFile("json") },
      { label: "导入 V2 JSON…", run: () => importFile(false) },
      { label: "导出 Markdown…", run: () => void exportFile("markdown") },
      { label: "桌面显示…", separator: true, run: () => void desktop() },
      ...(surface.startsWith("desktop-") ||
      (!native && new URLSearchParams(location.search).has("desktop"))
        ? [
            {
              label: "调整桌面布局",
              run: () =>
                window.dispatchEvent(new Event("floward-adjust-desktop")),
            },
          ]
        : []),
      {
        label: "外观与快捷键",
        run: () =>
          setModal({
            title: "外观与快捷键",
            content: (
              <Settings
                onScrollbars={(v) => {
                  setScrollbars(v);
                  stateSet("scrollbars", v);
                }}
              />
            ),
          }),
      },
      {
        label: "保存失败的草稿",
        run: () => setModal({ title: "草稿恢复", content: <Recovery /> }),
      },
      {
        label: "关于与数据位置",
        run: async () => {
          const path = native
            ? await invoke<string>("data_location")
            : "浏览器开发预览";
          setModal({
            title: "关于顺水意流 · floward",
            content: (
              <>
                <p>顺水意流 · floward 2.0 · 本地离线行动图</p>
                <p>GPL-3.0-only · Lucian W. (lucian-d-w)</p>
                <p className="path">{path}</p>
              </>
            ),
          });
        },
      },
      {
        label: "完全退出",
        run: async () => {
          await flushPending();
          if (native)
            void invoke("app_exit").catch((error) =>
              useStore.setState({ error: "退出未完成：" + String(error) }),
            );
          else notify("请关闭此预览页面");
        },
      },
    ];
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true],[role=dialog],[role=menu]",
        )
      )
        return;
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undo(e.shiftKey);
      }
      if (e.key === "F2" && selected[0]) {
        e.preventDefault();
        rename("tasks", selected[0]);
      }
      if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const i = lanes.findIndex((l) => l.id === active);
        const next = lanes[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) {
          setActive(next.id);
          document
            .querySelector(`[data-lane-id="${next.id}"]`)
            ?.scrollIntoView({ inline: "nearest", block: "nearest" });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [d, selected, active]);
  if (!d)
    return (
      <div className="loading">
        {error ?? "正在打开…"}
        {error && <button onClick={() => void reload()}>重试</button>}
      </div>
    );
  return (
    <>
      <header
        onPointerDown={(e) => {
          if (
            native &&
            surface === "main" &&
            e.button === 0 &&
            !(e.target as HTMLElement).closest("button")
          )
            void getCurrentWindow().startDragging();
        }}
        onDoubleClick={(e) => {
          if (
            native &&
            surface === "main" &&
            !(e.target as HTMLElement).closest("button")
          )
            void getCurrentWindow().toggleMaximize();
        }}
        onWheel={(e) => {
          if (outer.current)
            outer.current.scrollLeft += e.deltaX + (e.shiftKey ? e.deltaY : 0);
        }}
      >
        <span className="window-brand">顺水意流</span>
        <nav>
          <button onClick={() => setRoute([])}>首页</button>
          {route.map((id, i) => (
            <span key={id}>
              {" "}
              /{" "}
              <button onClick={() => setRoute(route.slice(0, i + 1))}>
                {d.tasks.find((t) => t.id === id)?.title ?? "事项"}
              </button>
            </span>
          ))}
        </nav>
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            showMenu(r.right - 180, r.bottom, topActions());
          }}
        >
          菜单
        </button>
        <WindowControls />
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void reload()}>重新载入</button>
          <button onClick={() => useStore.setState({ error: null })}>
            收起
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {deepest && owner ? (
        <Metadata key={owner.id} task={owner} />
      ) : (
        <main
          ref={outer}
          className={showNotes && owner ? "with-metadata" : ""}
          onScroll={() => {
            if (outer.current)
              stateSet(
                "outer/" + (viewId ?? route.at(-1)),
                outer.current.scrollLeft,
              );
          }}
        >
          {lanes.map((l) => (
            <Lane
              key={l.id}
              lane={l}
              active={active === l.id}
              activate={() => setActive(l.id)}
              openTask={(id) => setRoute([...route, id])}
              menu={showMenu}
              taskActions={taskActions}
              laneActions={laneActions}
              edgeActions={edgeActions}
              annotationActions={annotationActions}
              selected={selected}
              select={setSelected}
              showScrollbars={scrollbars}
              focusTarget={focusTarget}
            />
          ))}
          {!lanes.length && (
            <div className="empty-workspace">
              <p>这里还没有泳道。</p>
              <button onClick={newLane}>新建泳道</button>
            </div>
          )}
        </main>
      )}
      {showNotes && owner && !deepest && (
        <aside className="metadata-sidebar">
          <div className="metadata-heading">
            <strong>{owner.title}</strong>
            <button onClick={() => setShowNotes(false)}>收起</button>
          </div>
          <Metadata key={owner.id} task={owner} />
        </aside>
      )}
      {menu && <Menu {...menu} close={() => setMenu(null)} />}{" "}
      {modal && (
        <Modal title={modal.title} close={close}>
          {modal.content}
        </Modal>
      )}
    </>
  );
}
function Metadata({ task }: { task: Task }) {
  const live = useLiveEdit("tasks", task.id, {
    start: task.start,
    due: task.due,
    notes: task.notes,
  });
  const v = live.value;
  return (
    <section className="metadata-form" {...live.events}>
      <label>
        计划开始
        <input
          type="date"
          value={v.start.slice(0, 10)}
          onChange={(e) => live.update({ ...v, start: e.target.value })}
        />
      </label>
      <label>
        截止日期
        <input
          type="date"
          value={v.due.slice(0, 10)}
          onChange={(e) => live.update({ ...v, due: e.target.value })}
        />
      </label>
      <label>
        说明
        <textarea
          aria-label="事项说明"
          value={v.notes}
          placeholder="写下这件事的说明…"
          onChange={(e) => live.update({ ...v, notes: e.target.value })}
        />
      </label>
      <button onClick={() => void live.undo()}>撤回上一步</button>
    </section>
  );
}
function TextDetail({ task }: { task: Task }) {
  const change = useStore((s) => s.change);
  const [text, setText] = useState(
    () => localStorage.getItem("notes-draft/" + task.id) ?? task.notes,
  );
  const [dirty, setDirty] = useState(
    () => localStorage.getItem("notes-draft/" + task.id) !== null,
  );
  const baseNotes = useRef(task.notes);
  useEffect(() => {
    if (!dirty) {
      setText(task.notes);
      baseNotes.current = task.notes;
    }
  }, [task.notes]);
  return (
    <section className="text-detail">
      <h1>{task.title}</h1>
      <div className="task-date">
        {[task.start, task.due].filter(Boolean).join(" → ")}
      </div>
      <textarea
        aria-label="事项说明"
        placeholder="写下这件事的说明…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          localStorage.setItem("notes-draft/" + task.id, e.target.value);
        }}
        onBlur={async () => {
          if (
            dirty &&
            (await change("保存说明", (d) => {
              const t = d.tasks.find((t) => t.id === task.id);
              if (!t) throw Error("事项已删除");
              if (t.notes !== baseNotes.current)
                throw Error("说明已被另一处修改，草稿已保留");
              t.notes = text;
              t.modified = new Date().toISOString();
              baseNotes.current = text;
            }))
          ) {
            setDirty(false);
            localStorage.removeItem("notes-draft/" + task.id);
          }
        }}
      />
      {dirty && <span className="muted">离开输入框时保存；草稿已保留</span>}
    </section>
  );
}
function EdgeForm({
  label,
  submit,
}: {
  label: string;
  submit: (s: string) => void;
}) {
  const [text, setText] = useState(label);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
    >
      <label>
        连接文字（可留空）
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit">保存</button>
    </form>
  );
}
function ReconnectForm({
  d,
  edgeId,
  save,
}: {
  d: Doc;
  edgeId: string;
  save: (a: string, b: string) => void;
}) {
  const edge = d.edges.find((e) => e.id === edgeId)!;
  const [source, S] = useState(edge.source),
    [target, T] = useState(edge.target);
  const lane = d.tasks.find((t) => t.id === edge.source)!.lane;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(source, target);
      }}
    >
      {[
        ["起点", source, S],
        ["终点", target, T],
      ].map(([label, value, set]) => (
        <label key={label as string}>
          {label as string}
          <select
            value={value as string}
            onChange={(e) => (set as (s: string) => void)(e.target.value)}
          >
            {d.tasks
              .filter((t) => t.lane === lane)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
      ))}
      <button type="submit">保存改接</button>
    </form>
  );
}
function MarkerForm({ marker }: { marker: Marker }) {
  const live = useLiveEdit("markers", marker.id, marker);
  const m = live.value;
  const set = (next: Marker) => {
    if (next.lineWidth >= 1 && next.lineWidth <= 6) live.update(next);
  };
  return (
    <form {...live.events} onSubmit={(e) => e.preventDefault()}>
      <label>
        标题
        <input
          required
          value={m.title}
          onChange={(e) => set({ ...m, title: e.target.value })}
        />
      </label>
      <label>
        时间（可选）
        <input
          type="datetime-local"
          value={m.date}
          onChange={(e) => set({ ...m, date: e.target.value })}
        />
      </label>
      <label>
        颜色
        <input
          type="color"
          value={m.color}
          onChange={(e) => set({ ...m, color: e.target.value })}
        />
      </label>
      <label>
        线宽
        <input
          type="number"
          min="1"
          max="6"
          value={m.lineWidth}
          onChange={(e) => set({ ...m, lineWidth: +e.target.value })}
        />
      </label>
      <label>
        线型
        <select
          value={m.lineStyle}
          onChange={(e) =>
            set({ ...m, lineStyle: e.target.value as Marker["lineStyle"] })
          }
        >
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
        </select>
      </label>
      <button type="button" onClick={() => void live.undo()}>
        撤回上一步
      </button>
    </form>
  );
}
function Search({
  doc,
  focused,
  locate,
}: {
  doc: Doc;
  focused: boolean;
  locate: (kind: string, id: string) => void;
}) {
  const [q, setQ] = useState("");
  const text = q.trim().toLocaleLowerCase();
  const results: { kind: string; id: string; title: string; path: string }[] =
    [];
  for (const kind of ["tasks", "lanes", "edges", "bands", "markers"] as const) {
    if (focused && kind !== "tasks") continue;
    for (const o of doc[kind]) {
      if (focused && !(o as Task).focused) continue;
      const title = "title" in o ? o.title : o.label;
      const hay = title + ("notes" in o ? " " + o.notes : "");
      if (text && !hay.toLocaleLowerCase().includes(text)) continue;
      if (!focused && !text) continue;
      const task =
        kind === "tasks"
          ? o.id
          : kind === "edges"
            ? (o as Doc["edges"][0]).source
            : undefined;
      const resultLane = doc.lanes.find(
        (l) => l.id === ("lane" in o ? o.lane : o.id),
      );
      const parent = resultLane
        ? doc.views.find((v) => v.id === resultLane.view)?.owner
        : null;
      results.push({
        kind,
        id: o.id,
        title: title || "无文字连接",
        path: task
          ? pathOf(doc, task).join(" / ")
          : [
              ...(parent ? pathOf(doc, parent) : []),
              resultLane?.title ?? "",
            ].join(" / "),
      });
    }
  }
  return (
    <>
      <input
        autoFocus
        aria-label="搜索"
        placeholder="输入事项、说明、连接或标注文字"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="results">
        {results.map((r) => (
          <button
            key={r.id}
            className="result"
            onClick={() => locate(r.kind, r.id)}
          >
            <span>{r.title}</span>
            <small>{r.path}</small>
          </button>
        ))}
        {!results.length && (
          <p className="muted">
            {text || focused
              ? "没有找到内容"
              : "输入文字开始搜索，支持单个汉字。"}
          </p>
        )}
      </div>
    </>
  );
}
function TrashPanel({
  onLocate,
}: {
  onLocate: (kind: string, id: string) => void;
}) {
  const d = useStore((s) => s.doc)!;
  const change = useStore((s) => s.change);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <>
      <p>归档泳道</p>
      {d.lanes
        .filter((l) => l.archived)
        .map((l) => (
          <button
            className="result"
            key={l.id}
            onClick={() => onLocate("lanes", l.id)}
          >
            {l.title} · 恢复显示
          </button>
        ))}
      <p>回收站</p>
      {d.trash.map((t) => (
        <div className="trash-row" key={t.id}>
          <span>{t.title}</span>
          <button
            onClick={() =>
              void change("恢复回收项", (d) => restoreTrash(d, t.id))
            }
          >
            恢复
          </button>
          <button onClick={() => setConfirm(t.id)}>永久删除</button>
          {confirm === t.id && (
            <div>
              永久删除后仍可通过本次撤销恢复；备份中的内容保留。
              <button
                onClick={() => {
                  void change("永久删除回收项", (d) => {
                    d.trash = d.trash.filter((t) => t.id !== confirm);
                  });
                  setConfirm(null);
                }}
              >
                确认删除
              </button>
              <button onClick={() => setConfirm(null)}>取消</button>
            </div>
          )}
        </div>
      ))}
      {!d.trash.length && <p className="muted">回收站为空</p>}
    </>
  );
}
function Settings({ onScrollbars }: { onScrollbars: (v: boolean) => void }) {
  const [typography, setType] = useState(readTypography);
  const [fonts, setFonts] = useState<string[]>([]);
  const [fontError, setFontError] = useState("");
  useEffect(() => {
    const update = () => setType(readTypography());
    window.addEventListener("floward-font", update);
    void systemFonts()
      .then(setFonts)
      .catch((e) => setFontError(String(e)));
    return () => window.removeEventListener("floward-font", update);
  }, []);
  const theme = useTheme();
  return (
    <>
      <label>
        主题
        <select
          value={theme}
          onChange={(e) => applyTheme(e.target.value, true)}
        >
          <option value="light">浅色 · 白底黑字</option>
          <option value="dark">深色 · 黑底白字</option>
        </select>
      </label>
      <label>
        全局字体
        <select
          aria-label="全局字体"
          value={typography.family}
          onChange={(e) =>
            setTypography({ ...typography, family: e.target.value })
          }
        >
          <option value="">系统默认</option>
          {[...new Set([typography.family, ...fonts].filter(Boolean))].map(
            (f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ),
          )}
        </select>
      </label>
      {fontError && <p role="alert">字体列表读取失败：{fontError}</p>}
      <label>
        统一字号
        <NumberDraft
          label="统一字号"
          min={9}
          max={22}
          value={typography.size}
          change={(size) => setTypography({ ...typography, size })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          defaultChecked={localState("scrollbars", false)}
          onChange={(e) => onScrollbars(e.target.checked)}
        />
        显示辅助滚动条
      </label>
      <p>Ctrl＋N 新事项 · Ctrl＋K 搜索 · F2 改名</p>
      <p>Ctrl＋方向键 平移当前泳道 · Alt＋左右 切换泳道</p>
      <p>Ctrl＋Z 撤销 · Ctrl＋Shift＋Z 重做</p>
      <p>文本编辑时快捷键优先用于文字。</p>
    </>
  );
}
function Recovery() {
  const keys = Object.keys(localStorage).filter((k) =>
    /^(draft\/|notes-draft\/|restore-draft\/|floward-recovery-)/.test(k),
  );
  return (
    <>
      {keys.length ? (
        keys.map((k) => (
          <label key={k}>
            {k.startsWith("floward-recovery") ? "保存失败的内容" : "未提交文字"}
            <textarea readOnly value={localStorage.getItem(k) ?? ""} />
          </label>
        ))
      ) : (
        <p>没有保留的草稿。</p>
      )}
    </>
  );
}
