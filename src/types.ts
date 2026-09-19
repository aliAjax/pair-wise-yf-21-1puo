// 地毯修复档案领域模型与业务规则

export type StepStatus = "pending" | "active" | "done";
export type Severity = "轻" | "中" | "重";
export type DyeType = "植物染" | "化学染" | "混合染";

/** 破损区域：每处只绑定一种补线色号（threadId 唯一） */
export interface DamageArea {
  uid: string;
  name: string; // 破损名称，如“左穗边磨损”
  zone: string; // 部位：毯心 / 边穗 / 四角 / 经线
  severity: Severity;
  lengthM: number; // 该处预计耗用补线长度（米）
  threadId: string | null; // 绑定的补线批次色号
  x: number; // 局部标记图坐标 0-100
  y: number;
  note?: string;
}

/** 修复前 / 修复后记录 */
export interface RepairLog {
  uid: string;
  phase: "before" | "after";
  date: string;
  text: string;
  photo?: string; // 压缩后的 dataURL，仅存本地
}

export interface Carpet {
  uid: string;
  code: string; // 档案编号 CAR-###
  origin: string; // 产地
  era: string; // 年代
  knotDensity: string; // 结密度
  material: string; // 材质
  dyeType: DyeType; // 染色类型
  patternNote: string; // 纹样备注
  damages: DamageArea[];
  logs: RepairLog[];
  // 九个工序槽位的状态；回色/冲洗仅在发现染色迁移时计入流程
  statuses: Record<string, StepStatus>;
  migrationFound: boolean; // 湿洗中发现染色迁移
  createdAt: number;
  updatedAt: number;
}

/** 补线批次（材料色卡）：lengthM 为当前剩余长度 */
export interface ThreadBatch {
  id: string; // 色号
  name: string; // 色彩名
  hex: string;
  dyeSource: string; // 染色来源
  material: string; // 线材质
  lengthM: number; // 剩余长度（米）
  createdAt: number;
}

export interface StepDef {
  key: string;
  label: string;
  needsMigration?: boolean; // 仅在染色迁移时进入流程
}

/** 标准修复工序流；回色/冲洗为染色迁移时插入的解冻工序 */
export const STEP_DEFS: StepDef[] = [
  { key: "intake", label: "建档检视" },
  { key: "dust", label: "除尘清灰" },
  { key: "wash", label: "温水湿洗" },
  { key: "recolor", label: "局部回色", needsMigration: true },
  { key: "rinse", label: "冲洗确认", needsMigration: true },
  { key: "dry", label: "平展阴干" },
  { key: "reweave", label: "按纹样补织" },
  { key: "trim", label: "齐穗修绒" },
  { key: "archive", label: "完工归档" },
];

export const STEP_KEYS = STEP_DEFS.map((s) => s.key);
export const WASH_KEY = "wash";
export const RECOLOR_KEY = "recolor";
export const RINSE_KEY = "rinse";
export const DRY_KEY = "dry";

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyStatuses(): Record<string, StepStatus> {
  return Object.fromEntries(STEP_KEYS.map((k) => [k, "pending" as StepStatus]));
}

/** 染色迁移关闭时，回色/冲洗两道补救工序不计入流程 */
export function activeStepKeys(carpet: Pick<Carpet, "migrationFound">): string[] {
  return STEP_DEFS.filter((s) => !s.needsMigration || carpet.migrationFound).map((s) => s.key);
}

export function stepStatus(carpet: Carpet, key: string): StepStatus {
  return carpet.statuses[key] ?? "pending";
}

/**
 * 湿洗中发现染色迁移 → 湿洗之后的工序冻结；
 * 局部回色与冲洗确认均完成后才解除。
 */
export function isFrozen(carpet: Carpet): boolean {
  if (!carpet.migrationFound) return false;
  if (stepStatus(carpet, WASH_KEY) === "pending") return false;
  return !(
    stepStatus(carpet, RECOLOR_KEY) === "done" &&
    stepStatus(carpet, RINSE_KEY) === "done"
  );
}

export interface StepProgress {
  done: number;
  active: number;
  total: number;
  percent: number;
}

export function progressOf(carpet: Carpet): StepProgress {
  const keys = activeStepKeys(carpet);
  let done = 0;
  let active = 0;
  for (const k of keys) {
    const s = stepStatus(carpet, k);
    if (s === "done") done += 1;
    if (s === "active") active += 1;
  }
  return {
    done,
    active,
    total: keys.length,
    percent: keys.length ? Math.round((done / keys.length) * 100) : 0,
  };
}

/** 单张地毯对各补线批次的耗用量（米） */
export function consumptionOf(carpet: Carpet): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of carpet.damages) {
    if (!d.threadId) continue;
    map.set(d.threadId, (map.get(d.threadId) ?? 0) + (Number(d.lengthM) || 0));
  }
  return map;
}

/** 全工作室对各补线批次的已占用长度（由所有在档破损汇总，保证与库存一致） */
export function usedByThread(carpets: Carpet[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of carpets) {
    for (const [id, m] of consumptionOf(c)) {
      map.set(id, (map.get(id) ?? 0) + m);
    }
  }
  return map;
}

export function blankCarpet(): Carpet {
  const now = Date.now();
  return {
    uid: uid("carpet"),
    code: "",
    origin: "",
    era: "",
    knotDensity: "",
    material: "羊毛",
    dyeType: "植物染",
    patternNote: "",
    damages: [],
    logs: [],
    statuses: emptyStatuses(),
    migrationFound: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function blankDamage(): DamageArea {
  return {
    uid: uid("dmg"),
    name: "",
    zone: "毯心",
    severity: "中",
    lengthM: 0,
    threadId: null,
    x: 50,
    y: 50,
    note: "",
  };
}
