import { describe, it, expect } from "vitest";
import {
  initial,
  createTask,
  connect,
  canConnect,
  removeObjects,
  restoreTrash,
  internalView,
  createLane,
  resizeBand,
  appearance,
  copyTasks,
} from "./model";
describe("用户图规则", () => {
  it("分叉汇合允许；自连、重复、回环被拒绝", () => {
    const d = initial();
    const ts = ["A", "B", "C", "D"].map((s, i) =>
      createTask("lane-first", s, i),
    );
    d.tasks.push(...ts);
    const [a, b, c, g] = ts;
    connect(d, a.id, b.id);
    connect(d, a.id, c.id);
    connect(d, b.id, g.id);
    connect(d, c.id, g.id);
    expect(canConnect(d, g.id, a.id)).toContain("环");
    expect(canConnect(d, a.id, a.id)).toContain("自己");
    expect(canConnect(d, a.id, b.id)).toContain("已有");
  });
  it("删除中间任务保留下游，内部内容随之回收并可恢复", () => {
    const d = initial();
    const [a, b, c] = ["A", "B", "C"].map((s, i) =>
      createTask("lane-first", s, i),
    );
    d.tasks.push(a, b, c);
    connect(d, a.id, b.id);
    connect(d, b.id, c.id);
    const view = internalView(d, b.id);
    const lane = createLane(view, 0);
    d.lanes.push(lane);
    d.tasks.push(createTask(lane.id, "内部", 0));
    removeObjects(d, "task", [b.id]);
    expect(d.tasks.map((t) => t.title)).toEqual(["A", "C"]);
    expect(d.edges).toHaveLength(0);
    restoreTrash(d, d.trash[0].id);
    expect(d.tasks).toHaveLength(4);
    expect(d.edges).toHaveLength(2);
  });
  it("色带侵入退让后反向留白，复制不带外部边", () => {
    const d = initial();
    d.bands = [
      {
        id: "a",
        lane: "lane-first",
        title: "A",
        y: 0,
        height: 300,
        appearance: appearance(),
      },
      {
        id: "b",
        lane: "lane-first",
        title: "B",
        y: 360,
        height: 240,
        appearance: appearance(),
      },
    ];
    resizeBand(d, "b", "top", 240);
    expect(d.bands[0].height).toBe(240);
    resizeBand(d, "b", "top", 340);
    expect(d.bands[0].height).toBe(240);
    expect(d.bands[1].y).toBe(340);
    const a = createTask("lane-first", "A", 0),
      b = createTask("lane-first", "B", 1);
    d.tasks.push(a, b);
    connect(d, a.id, b.id);
    copyTasks(d, [a.id], false);
    expect(d.edges).toHaveLength(1);
    expect(d.tasks).toHaveLength(3);
  });
});
