import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initial, type Doc, type Snapshot } from "./model";
export const native = isTauri();
export const surface = native ? getCurrentWindow().label : "browser-preview";
type State = {
  doc: Doc | null;
  revision: number;
  busy: boolean;
  error: string | null;
  notice: string | null;
  reload: () => Promise<void>;
  change: (label: string, fn: (doc: Doc) => void) => Promise<boolean>;
  undo: (redo?: boolean) => Promise<void>;
};
let queue = Promise.resolve();
export const liveFlushers = new Set<() => Promise<void>>();
export async function flushPending() {
  await Promise.all([...liveFlushers].map(f => f()));
  await queue;
}
const previewHistory: { before: Doc; after: Doc }[] = [];
let previewCursor = 0;
async function load(): Promise<Snapshot> {
  if (native) return invoke("load");
  if (!import.meta.env.DEV) throw Error("请从 Floward 桌面程序打开");
  return JSON.parse(
    localStorage.getItem("floward-preview") ??
      JSON.stringify({ revision: 0, document: initial() }),
  );
}
export const useStore = create<State>((set, get) => ({
  doc: null,
  revision: 0,
  busy: false,
  error: null,
  notice: null,
  reload: async () => {
    try {
      const s = await load();
      set({ doc: s.document, revision: s.revision });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  change: async (label, fn) => {
    let ok = false;
    const work = queue.then(async () => {
      const state = get();
      if (!state.doc) return;
      set({ busy: true });
      const d = structuredClone(state.doc);
      try {
        fn(d);
        let snap: Snapshot;
        if (native)
          snap = await invoke("commit", {
            revision: state.revision,
            document: d,
            label,
          });
        else {
          previewHistory.splice(previewCursor);
          previewHistory.push({ before: state.doc, after: d });
          previewCursor++;
          snap = { revision: state.revision + 1, document: d };
          localStorage.setItem("floward-preview", JSON.stringify(snap));
        }
        set({ doc: snap.document, revision: snap.revision, error: null });
        ok = true;
      } catch (e) {
        try {
          localStorage.setItem(
            "floward-recovery-" + surface,
            JSON.stringify({
              label,
              document: d,
              at: new Date().toISOString(),
            }),
          );
        } catch {
          /* The visible error still survives a full browser cache. */
        }
        set({ error: String(e) });
      } finally {
        set({ busy: false });
      }
    });
    queue = work.catch(() => {});
    await work;
    return ok;
  },
  undo: async (redo = false) => {
    const work = queue.then(async () => {
      try {
        let snap: Snapshot;
        if (native) snap = await invoke("history", { redo });
        else {
          const entry = redo
            ? previewHistory[previewCursor]
            : previewHistory[previewCursor - 1];
          if (!entry) return;
          previewCursor += redo ? 1 : -1;
          snap = {
            revision: get().revision + 1,
            document: structuredClone(redo ? entry.after : entry.before),
          };
          localStorage.setItem("floward-preview", JSON.stringify(snap));
        }
        set({ doc: snap.document, revision: snap.revision, error: null });
      } catch (e) {
        set({ error: String(e) });
      }
    });
    queue = work.catch(() => {});
    await work;
  },
}));
export function notify(text: string) {
  useStore.setState({ notice: text });
  setTimeout(() => {
    if (useStore.getState().notice === text)
      useStore.setState({ notice: null });
  }, 4500);
}
export async function stateGet<T>(key: string, fallback: T): Promise<T> {
  const k = surface + "/" + key;
  try {
    if (native)
      return (await invoke<T | null>("state_get", { key: k })) ?? fallback;
    return JSON.parse(localStorage.getItem("view:" + k) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function stateSet(key: string, value: unknown) {
  const k = surface + "/" + key;
  try {
    localStorage.setItem("view:" + k, JSON.stringify(value));
  } catch {
    /* Native SQLite remains the authoritative state. */
  }
  if (native)
    void invoke("state_set", { key: k, value }).catch((e) =>
      useStore.setState({ error: "浏览位置未保存：" + e }),
    );
}
export function localState<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(
        localStorage.getItem("view:" + surface + "/" + key) ?? "null",
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
if (native) {
  void listen('workspace-restored',()=>{for(const k of Object.keys(localStorage)){if(k.startsWith('view:'))localStorage.removeItem(k);else if(k.startsWith('notes-draft/')||k.startsWith('draft/')){localStorage.setItem('restore-draft/'+k,localStorage.getItem(k)??'');localStorage.removeItem(k)}}location.reload()});
  void listen<number>("document-changed", (e) => {
    void queue.then(async () => {
      if (e.payload !== useStore.getState().revision)
        await useStore.getState().reload();
    });
  });
}
