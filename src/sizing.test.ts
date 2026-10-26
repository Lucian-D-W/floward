import { expect, test } from "vitest";
import { createTask } from "./model";
import { dimensions } from "./sizing";

test("per-task font size expands long text while preserving 4:3 and other tasks", () => {
  const task = createTask("lane", "很长的中文内容 abc ".repeat(30), 0);
  const normal = dimensions(task);
  const large = dimensions({
    ...task,
    fontSize: 48,
    fontFamily: "Microsoft YaHei",
  });
  expect(large.width).toBeGreaterThan(normal.width);
  expect(large.width * 3).toBe(large.height * 4);
  expect(dimensions(task)).toEqual(normal);
});
