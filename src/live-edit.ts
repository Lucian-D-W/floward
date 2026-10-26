import { create } from "zustand";
import { useEffect, useRef, useState } from "react";
import { useStore, liveFlushers } from "./store";
import type { Doc } from "./model";
type Kind = "tasks" | "bands" | "markers";
const previews = create<{ values: Record<string, object> }>(() => ({
  values: {},
}));
function preview(id: string, value?: object, fields: string[] = []) {
  const values = { ...previews.getState().values };
  if (value) values[id] = { ...values[id], ...value };
  else {
    const remaining = { ...values[id] } as Record<string, unknown>;
    for (const key of fields) delete remaining[key];
    if (Object.keys(remaining).length) values[id] = remaining;
    else delete values[id];
  }
  previews.setState({ values });
}
export function useVisualDoc(): Doc {
  const doc = useStore((s) => s.doc)!;
  const values = previews((s) => s.values);
  return {
    ...doc,
    tasks: doc.tasks.map((t) => ({ ...t, ...values[t.id] })),
    bands: doc.bands.map((t) => ({ ...t, ...values[t.id] })),
    markers: doc.markers.map((t) => ({ ...t, ...values[t.id] })),
  };
}
export function useLiveEdit<T extends object>(
  kind: Kind,
  id: string,
  initial: T,
) {
  const entity = useStore((s) => s.doc?.[kind].find((t) => t.id === id));
  const [value, setValue] = useState(initial);
  const keys = useRef(Object.keys(initial));
  const defaults = useRef(initial);
  const saving = useRef(0);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  const flush = async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    saving.current++;
    const ok = await useStore
      .getState()
      .change("调整" + (kind === "tasks" ? "事项" : "外观"), (d) => {
        const target = d[kind].find((t) => t.id === id);
        if (!target) throw Error("对象已删除");
        Object.assign(target, next);
      });
    saving.current--;
    if (!pending.current && !saving.current)
      preview(id, undefined, keys.current);
    if (!ok) localStorage.setItem("draft/live/" + id, JSON.stringify(next));
    else localStorage.removeItem("draft/live/" + id);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const f = () => flushRef.current();
    liveFlushers.add(f);
    return () => {
      liveFlushers.delete(f);
      void f();
    };
  }, [id]);
  useEffect(() => {
    if (entity && !pending.current && !saving.current)
      setValue(
        Object.fromEntries(
          keys.current.map((k) => [
            k,
            (entity as any)[k] ?? (defaults.current as any)[k],
          ]),
        ) as T,
      );
  }, [entity]);
  const update = (next: T) => {
    setValue(next);
    pending.current = next;
    preview(id, next);
    localStorage.setItem("draft/live/" + id, JSON.stringify(next));
    clearTimeout(timer.current);
    if (!dragging.current)
      timer.current = setTimeout(() => void flushRef.current(), 450);
  };
  return {
    value,
    update,
    flush,
    undo: async () => {
      await flush();
      await useStore.getState().undo();
    },
    events: {
      onPointerDownCapture: () => {
        dragging.current = true;
        clearTimeout(timer.current);
      },
      onPointerUpCapture: () => {
        dragging.current = false;
        void flush();
      },
      onPointerCancelCapture: () => {
        dragging.current = false;
        void flush();
      },
      onBlurCapture: () => {
        dragging.current = false;
        void flush();
      },
    },
  };
}
