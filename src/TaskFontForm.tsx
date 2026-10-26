import { useEffect, useState } from "react";
import { NumberDraft } from "./NumberDraft";
import { fontSize } from "./sizing";
import { systemFonts } from "./typography";
import { native, useStore } from "./store";
import { useLiveEdit } from "./live-edit";

export function TaskFontForm({ id }: { id: string }) {
  const task = useStore((s) => s.doc?.tasks.find((t) => t.id === id));
  const live = useLiveEdit("tasks", id, {
    fontFamily: task?.fontFamily ?? "",
    fontSize: task?.fontSize ?? 0,
  });
  const [fonts, setFonts] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (native)
      void systemFonts()
        .then(setFonts)
        .catch((e) => setError(String(e)));
  }, []);
  return (
    <fieldset className="settings-group" {...live.events}>
      <legend>字体</legend>
      <label>
        本地字体
        <select
          aria-label="事项字体"
          value={live.value.fontFamily ?? ""}
          onChange={(e) =>
            live.update({ ...live.value, fontFamily: e.target.value })
          }
        >
          <option value="">跟随默认字体</option>
          {[...new Set([live.value.fontFamily, ...fonts].filter(Boolean))].map(
            (name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={!live.value.fontSize}
          onChange={(e) =>
            live.update({
              ...live.value,
              fontSize: e.target.checked ? 0 : fontSize(),
            })
          }
        />
        跟随全局字号
      </label>
      <label>
        字号（像素）
        <NumberDraft
          label="事项字号"
          min={8}
          max={96}
          value={live.value.fontSize || fontSize()}
          change={(fontSize) => live.update({ ...live.value, fontSize })}
        />
      </label>
      <p
        className="font-preview"
        style={{
          fontFamily: live.value.fontFamily
            ? JSON.stringify(live.value.fontFamily)
            : undefined,
          fontSize: live.value.fontSize || undefined,
        }}
      >
        字体预览 · Aa 你好 123
      </p>
      {error && <p role="alert">字体读取失败：{error}</p>}
      {!native && <p>本地字体列表在桌面程序中可用。</p>}
    </fieldset>
  );
}
