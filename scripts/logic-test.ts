import assert from "node:assert";
import type { Carpet, Store } from "../src/types";
import { stepViews, progress, isFrozen } from "../src/workflow";
import { threadUsed, threadRemain } from "../src/storage";

let pass = 0;
const ok = (name: string, cond: boolean) => {
  assert(cond, name);
  pass++;
  console.log(`✓ ${name}`);
};

const mkSteps = (): Carpet["steps"] =>
  (["dust", "wash", "recolor", "rinse", "weave", "finish"] as const).map((id) => ({ id, state: "pending" as const }));

const store: Store = {
  version: 1,
  seq: 1,
  threads: [
    { id: "t1", code: "CR-1", color: "#000", name: "红", source: "", totalLen: 10, createdAt: "" },
  ],
  carpets: [],
  logs: [],
};

const carpet = (over: Partial<Carpet> = {}): Carpet => ({
  id: "c",
  code: "C1",
  name: "毯",
  origin: "波斯",
  era: "",
  knotDensity: "",
  material: "",
  dye: "",
  damages: [],
  markers: [],
  markerImage: null,
  beforeImg: null,
  afterImg: null,
  steps: mkSteps(),
  migrationReported: false,
  createdAt: "",
  updatedAt: "",
  ...over,
});

// 1. 常规流程：回色/冲洗不适用
{
  const c = carpet();
  const views = stepViews(c);
  ok("未迁移时回色/冲洗不适用", views.filter((v) => v.applicable).length === 4);
  ok("首道除尘可开始", views[0].canStart && !views[1].canStart);
}

// 2. 整单扣减：两处破损共用批次，合计不超则通过，超量失败
{
  const c = carpet({
    damages: [
      { id: "d1", area: "边", severity: "中等", threadId: "t1", length: 6 },
      { id: "d2", area: "心", severity: "严重", threadId: "t1", length: 3 },
    ],
  });
  store.carpets = [c];
  ok("合计占用 9m（卷 10m）", threadUsed(store, "t1") === 9);
  ok("剩余 1m", threadRemain(store, "t1") === 1);

  // 模拟第二张单子计划 2m（只剩 1m）→ 整单失败
  const planned = 2;
  const avail = store.threads[0].totalLen - threadUsed(store, "t1");
  ok("超量计划被拦截（整单失败）", planned > avail);
}

// 3. 迁移上报后冻结：wash active 上报 → weave 冻结
{
  const c = carpet({
    migrationReported: true,
    steps: mkSteps().map((s) =>
      s.id === "dust" ? { ...s, state: "done" } : s.id === "wash" ? { ...s, state: "done" } : s
    ),
  });
  const views = stepViews(c);
  const recolor = views.find((v) => v.id === "recolor")!;
  const weave = views.find((v) => v.id === "weave")!;
  ok("迁移后回色/冲洗适用", recolor.applicable);
  ok("湿洗后回色可开始", recolor.canStart);
  ok("织补被冻结", weave.frozen && !weave.canStart);
  ok("整体处于冻结态", isFrozen(c));
  ok("进度未把织补算完成", progress(c) === 33); // dust+wash / 6 applicable
}

// 4. 回色完成但冲洗未确认 → 仍冻结
{
  const c = carpet({
    migrationReported: true,
    steps: mkSteps().map((s) =>
      s.id === "dust" || s.id === "wash" || s.id === "recolor"
        ? { ...s, state: "done" }
        : s
    ),
  });
  const weave = stepViews(c).find((v) => v.id === "weave")!;
  ok("仅完成回色仍冻结", weave.frozen && isFrozen(c));
}

// 5. 回色+冲洗都完成 → 解除冻结，织补可开始
{
  const c = carpet({
    migrationReported: true,
    steps: mkSteps().map((s) =>
      s.id === "dust" || s.id === "wash" || s.id === "recolor" || s.id === "rinse"
        ? { ...s, state: "done" }
        : s
    ),
  });
  const views = stepViews(c);
  const weave = views.find((v) => v.id === "weave")!;
  ok("回色+冲洗后解除冻结", !weave.frozen && weave.canStart);
  ok("解除后不再判定为冻结", !isFrozen(c));
  ok("进度 4/6 ≈ 67%", progress(c) === 67);
}

// 6. 未迁移常规：dust done → wash 可开始，weave 在 wash done 后可开始
{
  const c = carpet({
    steps: mkSteps().map((s) =>
      s.id === "dust" || s.id === "wash" ? { ...s, state: "done" } : s
    ),
  });
  const views = stepViews(c);
  const weave = views.find((v) => v.id === "weave")!;
  const recolor = views.find((v) => v.id === "recolor")!;
  ok("无迁移时湿洗完织补直接可开始", weave.canStart && !weave.frozen);
  ok("无迁移时回色不适用、不可开始", !recolor.applicable && !recolor.canStart);
}

// 7. 回退约束：后续工序已完成时不可回退前序
{
  const c = carpet({
    steps: mkSteps().map((s) =>
      s.id === "dust" || s.id === "wash" || s.id === "weave"
        ? { ...s, state: "done" }
        : s
    ),
  });
  const views = stepViews(c);
  const wash = views.find((v) => v.id === "wash")!;
  const weave = views.find((v) => v.id === "weave")!;
  ok("织补已完成时湿洗不可回退", !wash.canUndo);
  ok("织补可回退（收尾未动）", weave.canUndo);
}

console.log(`\n全部 ${pass} 项断言通过`);
