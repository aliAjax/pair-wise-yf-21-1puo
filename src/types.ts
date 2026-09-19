// 地毯修复档案 —— 领域模型

export type StepId = "dust" | "wash" | "recolor" | "rinse" | "weave" | "finish";
export type StepState = "pending" | "active" | "done";

export interface StepRec {
  id: StepId;
  state: StepState;
  note?: string;
  updatedAt?: string;
}

/** 破损区域：每处破损只能绑定一种补线色号（一个补线批次） */
export interface Damage {
  id: string;
  area: string; // 破损区域
  severity: "轻微" | "中等" | "严重" | "";
  threadId: string | null; // 绑定的补线批次/色号
  length: number; // 计划用线长度（米）
  note?: string;
}

/** 纹样局部标记图上的坐标点（百分比坐标） */
export interface Marker {
  id: string;
  x: number; // 0-100
  y: number; // 0-100
  damageId: string | null;
  note?: string;
}

export interface Carpet {
  id: string;
  code: string; // 档案编号
  name: string; // 藏品名称
  origin: string; // 产地
  era: string; // 年代
  knotDensity: string; // 结密度
  material: string; // 材质
  dye: string; // 染色类型
  note?: string;
  damages: Damage[];
  markers: Marker[];
  markerImage: string | null; // 局部标记图（dataURL）
  beforeImg: string | null; // 修复前
  afterImg: string | null; // 修复后
  recordDate?: string; // 前后记录日期
  recordNote?: string; // 前后记录说明
  steps: StepRec[];
  migrationReported: boolean; // 湿洗中是否发现染色迁移
  createdAt: string;
  updatedAt: string;
}

/** 补线批次（色卡）：同一色号按批次管理整卷剩余长度 */
export interface ThreadBatch {
  id: string;
  code: string; // 色号
  color: string; // 色值 hex
  name: string; // 颜色名
  source: string; // 来源/材质说明
  totalLen: number; // 入库长度（米）
  createdAt: string;
}

export interface LogEntry {
  id: string;
  at: string;
  text: string;
  tone: "info" | "warn" | "ok";
}

export interface Store {
  version: 1;
  seq: number;
  carpets: Carpet[];
  threads: ThreadBatch[];
  logs: LogEntry[];
}

/** 编辑器中的档案草稿 */
export type CarpetDraft = Omit<Carpet, "id" | "createdAt" | "updatedAt" | "steps" | "migrationReported">;
