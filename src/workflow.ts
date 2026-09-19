import type { Carpet, StepId, StepState } from "./types";

export interface StepDef {
  id: StepId;
  name: string;
  desc: string;
}

/** 标准修复工序（顺序） */
export const STEP_DEFS: StepDef[] = [
  { id: "dust", name: "除尘检查", desc: "正反面拍打、吸尘，记录原始破损" },
  { id: "wash", name: "湿洗", desc: "中性洗剂温水清洗；若发现染色迁移立即上报" },
  { id: "recolor", name: "局部回色", desc: "迁移应急：对迁移晕染区做局部回色处理" },
  { id: "rinse", name: "冲洗确认", desc: "迁移应急：反复冲洗并确认浮色清除、不再迁移" },
  { id: "weave", name: "织补补线", desc: "按破损区域绑定的色号批次补织" },
  { id: "finish", name: "整毯收尾", desc: "平整穗头、复检结密度与纹样，归档" },
];

export const MAIN_STEPS: StepId[] = ["dust", "wash", "weave", "finish"];

export function stepState(c: Carpet, id: StepId): StepState {
  return c.steps.find((s) => s.id === id)?.state ?? "pending";
}

export interface StepView extends StepDef {
  state: StepState;
  note?: string;
  applicable: boolean; // 迁移时回色/冲洗适用；未迁移时隐藏
  canStart: boolean; // pending → active
  canComplete: boolean; // active → done
  canUndo: boolean; // done/active → pending
  frozen: boolean; // 被迁移冻结
}

/**
 * 工序视图：
 * - 未发生迁移：回色/冲洗两道应急工序不适用
 * - 湿洗中上报迁移：织补等后续工序冻结，直到局部回色 + 冲洗确认均完成才解除
 */
export function stepViews(c: Carpet): StepView[] {
  const st = (id: StepId) => stepState(c, id);
  const dust = st("dust");
  const wash = st("wash");
  const recolor = st("recolor");
  const rinse = st("rinse");
  const weave = st("weave");

  const migrationActive = c.migrationReported && !(recolor === "done" && rinse === "done");

  const dustV: StepView = {
    ...STEP_DEFS[0], state: dust, note: c.steps[0]?.note, applicable: true,
    canStart: dust === "pending", canComplete: dust === "active",
    canUndo: dust !== "pending" && wash === "pending", frozen: false,
  };

  const washV: StepView = {
    ...STEP_DEFS[1], state: wash, note: c.steps[1]?.note, applicable: true,
    canStart: wash === "pending" && dust === "done",
    canComplete: wash === "active",
    canUndo: wash !== "pending" && recolor === "pending" && rinse === "pending" && weave === "pending",
    frozen: false,
  };

  const recolorV: StepView = {
    ...STEP_DEFS[2], state: recolor, note: c.steps[2]?.note,
    applicable: c.migrationReported,
    canStart: c.migrationReported && wash === "done" && recolor === "pending",
    canComplete: recolor === "active",
    canUndo: recolor !== "pending" && rinse !== "done" && weave === "pending",
    frozen: false,
  };

  const rinseV: StepView = {
    ...STEP_DEFS[3], state: rinse, note: c.steps[3]?.note,
    applicable: c.migrationReported,
    canStart: c.migrationReported && recolor === "done" && rinse === "pending",
    canComplete: rinse === "active",
    canUndo: rinse !== "pending" && weave === "pending",
    frozen: false,
  };

  // 织补：迁移未解除前冻结
  const weaveFrozen = migrationActive && wash === "done";
  const weaveV: StepView = {
    ...STEP_DEFS[4], state: weave, note: c.steps[4]?.note, applicable: true,
    canStart: !weaveFrozen && weave === "pending" && wash === "done" &&
      (!c.migrationReported || (recolor === "done" && rinse === "done")),
    canComplete: weave === "active",
    canUndo: weave !== "pending" && st("finish") === "pending",
    frozen: weaveFrozen,
  };

  // 收尾与织补同冻结条件
  const finishV: StepView = {
    ...STEP_DEFS[5], state: st("finish"), note: c.steps[5]?.note, applicable: true,
    canStart: !weaveFrozen && st("finish") === "pending" && weave === "done",
    canComplete: st("finish") === "active",
    canUndo: st("finish") !== "pending",
    frozen: weaveFrozen,
  };

  return [dustV, washV, recolorV, rinseV, weaveV, finishV];
}

/** 标准进度：以适用工序的完成数计算（0-100） */
export function progress(c: Carpet): number {
  const views = stepViews(c).filter((v) => v.applicable);
  const done = views.filter((v) => v.state === "done").length;
  return Math.round((done / views.length) * 100);
}

/** 是否可上报“湿洗发现染色迁移”：仅湿洗进行中、尚未上报时 */
export function canReportMigration(c: Carpet): boolean {
  return !c.migrationReported && stepState(c, "wash") === "active";
}

export function isFrozen(c: Carpet): boolean {
  if (!c.migrationReported) return false;
  return !(stepState(c, "recolor") === "done" && stepState(c, "rinse") === "done");
}
