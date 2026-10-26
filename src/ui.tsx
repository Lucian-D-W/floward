import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Drop from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { HexColorPicker } from "react-colorful";
import { appearance, type Appearance } from "./model";
import { useLiveEdit } from "./live-edit";
import { TaskFontForm } from "./TaskFontForm";
export type Action = {
  label: string;
  run: () => void;
  disabled?: boolean;
  separator?: boolean;
};
export function Menu({
  x,
  y,
  items,
  close,
}: {
  x: number;
  y: number;
  items: Action[];
  close: () => void;
}) {
  return (
    <Drop.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Drop.Trigger
        className="menu-anchor"
        style={{ left: x, top: y }}
        aria-label="操作菜单"
      />
      <Drop.Portal>
        <Drop.Content
          className="menu"
          align="start"
          sideOffset={2}
          collisionPadding={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.separator && <Drop.Separator className="separator" />}
              <Drop.Item
                className="menu-item"
                disabled={item.disabled}
                onSelect={() => {
                  close();
                  item.run();
                }}
              >
                {item.label}
              </Drop.Item>
            </div>
          ))}
        </Drop.Content>
      </Drop.Portal>
    </Drop.Root>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="关闭">关闭</button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function TextForm({
  value = "",
  label,
  submit,
  multiline = false,
}: {
  value?: string;
  label: string;
  submit: (v: string) => void;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) submit(text.trim());
      }}
    >
      <label>
        {label}
        {multiline ? (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing && e.key === "Enter")
                e.preventDefault();
            }}
          />
        )}
      </label>
      <div className="form-actions">
        <button type="submit" disabled={!text.trim()}>
          确定
        </button>
      </div>
    </form>
  );
}
export function StyleForm({
  value,
  kind,
  id,
}: {
  value: Appearance;
  kind: "tasks" | "bands";
  id: string;
}) {
  const live = useLiveEdit(kind, id, { appearance: value });
  const a = live.value.appearance;
  const [hex, setHex] = useState(a.fill);
  useEffect(() => setHex(a.fill), [a.fill]);
  const setA = (next: Appearance) => {
    if (
      /^#[0-9a-fA-F]{6}$/.test(next.fill) &&
      next.lineWidth >= 0 &&
      next.lineWidth <= 6
    )
      live.update({ appearance: next });
  };
  return (
    <form
      className="appearance-settings"
      {...live.events}
      onSubmit={(e) => e.preventDefault()}
    >
      {kind === "tasks" && <TaskFontForm id={id} />}
      <fieldset className="settings-group">
        <legend>背景</legend>
        <HexColorPicker
          color={a.fill}
          onChange={(fill) => setA({ ...a, fill })}
        />
        <label>
          背景颜色
          <input
            value={hex}
            pattern="#[0-9a-fA-F]{6}"
            onChange={(e) => {
              setHex(e.target.value);
              setA({ ...a, fill: e.target.value });
            }}
          />
        </label>
        <label>
          背景透明度
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={a.opacity}
            onChange={(e) => setA({ ...a, opacity: +e.target.value })}
          />
        </label>
      </fieldset>
      <fieldset className="settings-group">
        <legend>边框与线条</legend>
        <label>
          边框颜色
          <input
            type="color"
            value={a.border}
            onChange={(e) => setA({ ...a, border: e.target.value })}
          />
        </label>
        <label>
          线宽
          <input
            type="number"
            min="0"
            max="6"
            value={a.lineWidth}
            onChange={(e) => setA({ ...a, lineWidth: +e.target.value })}
          />
        </label>
        <label>
          线型
          <select
            value={a.lineStyle}
            onChange={(e) =>
              setA({
                ...a,
                lineStyle: e.target.value as Appearance["lineStyle"],
              })
            }
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </label>
      </fieldset>
      <div className="form-actions settings-actions">
        <button type="button" onClick={() => setA(appearance())}>
          恢复默认
        </button>
        <button type="button" onClick={() => void live.undo()}>
          撤回上一步
        </button>
      </div>
    </form>
  );
}
export function Draft({
  inputLabel = "新事项标题",
  draftKey,
  onConfirm,
  onCancel,
}: {
  inputLabel?: string;
  draftKey: string;
  onConfirm: (title: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? "");
  const composing = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    localStorage.setItem(draftKey, text);
  }, [text, draftKey]);
  async function submit() {
    if (saving || composing.current) return;
    if (!text.trim()) {
      localStorage.removeItem(draftKey);
      onCancel();
      return;
    }
    setSaving(true);
    if (await onConfirm(text.trim())) localStorage.removeItem(draftKey);
    setSaving(false);
  }
  return (
    <div className="draft nodrag nopan" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        aria-label={inputLabel}
        placeholder={inputLabel}
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape" && !e.nativeEvent.isComposing) {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div>
        <button disabled={saving} onClick={() => void submit()}>
          确定
        </button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
export function fill(a: Appearance) {
  const h = a.fill.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return a.fill;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a.opacity})`;
}
