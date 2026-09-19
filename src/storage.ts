import type { Carpet, Store, ThreadBatch } from "./types";

const KEY = "carpet-restore-archive-v1";

export const ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯", "土库曼", "其他"];

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nowStr(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

// ---------- 补线用量计算 ----------

/** 某补线批次被指定档案的占用长度（米） */
export function usageByCarpet(carpet: Carpet, threadId: string): number {
  return carpet.damages
    .filter((d) => d.threadId === threadId)
    .reduce((s, d) => s + (Number(d.length) || 0), 0);
}

/** 某补线批次被全部档案占用的总长度（米） */
export function threadUsed(store: Store, threadId: string): number {
  return store.carpets.reduce((s, c) => s + usageByCarpet(c, threadId), 0);
}

/** 批次剩余长度（米） */
export function threadRemain(store: Store, threadId: string): number {
  const t = store.threads.find((x) => x.id === threadId);
  if (!t) return 0;
  return t.totalLen - threadUsed(store, threadId);
}

export function threadById(store: Store, id: string | null): ThreadBatch | undefined {
  return id ? store.threads.find((t) => t.id === id) : undefined;
}

// ---------- 持久化 ----------

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.carpets)) {
        return parsed;
      }
    }
  } catch {
    // 数据损坏时回退到种子数据
  }
  const seed = seedStore();
  persist(seed);
  return seed;
}

export function persist(store: Store): void {
  // 先序列化探测配额，失败时由调用方决定回滚
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function exportJson(store: Store): void {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `地毯修复档案-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- 种子数据 ----------

function seedStore(): Store {
  const t1: ThreadBatch = { id: "th-red", code: "CR-204", color: "#8c2f1d", name: "石榴红", source: "羊毛 · 植物染", totalLen: 120, createdAt: "2026-08-02 10:00:00" };
  const t2: ThreadBatch = { id: "th-blue", code: "CB-118", color: "#26406b", name: "靛蓝", source: "羊毛 · 靛蓝染", totalLen: 90, createdAt: "2026-08-02 10:05:00" };
  const t3: ThreadBatch = { id: "th-cream", code: "CC-007", color: "#e7d9b8", name: "米驼", source: "羊毛 · 茶染", totalLen: 150, createdAt: "2026-08-05 09:30:00" };
  const t4: ThreadBatch = { id: "th-ivory", code: "CI-031", color: "#f2ece0", name: "骨白", source: "丝毛混纺", totalLen: 12, createdAt: "2026-08-12 14:20:00" };

  const baseSteps = () => [
    { id: "dust" as const, state: "done" as const, note: "除尘完成", updatedAt: "2026-09-01 11:00:00" },
    { id: "wash" as const, state: "done" as const, note: "温水清洗，未发现迁移", updatedAt: "2026-09-03 16:00:00" },
    { id: "recolor" as const, state: "done" as const },
    { id: "rinse" as const, state: "done" as const },
    { id: "weave" as const, state: "active" as const, note: "中心缺口补织中" },
    { id: "finish" as const, state: "pending" as const },
  ];

  const c1: Carpet = {
    id: "cp-092",
    code: "CAR-092",
    name: "石榴纹祈祷毯",
    origin: "波斯",
    era: "约1960年代",
    knotDensity: "36 结/平方英寸",
    material: "羊毛经棉纬",
    dye: "植物染",
    note: "边缘磨损待补线",
    damages: [
      { id: "d-092-1", area: "左侧毯边", severity: "中等", threadId: "th-red", length: 8, note: "磨毛断纬" },
      { id: "d-092-2", area: "中心纹样缺口", severity: "严重", threadId: "th-red", length: 14, note: "石榴花心缺线" },
    ],
    markers: [{ id: "m-092-1", x: 22, y: 48, damageId: "d-092-1", note: "毯边磨损起点" }],
    markerImage: null,
    beforeImg: null,
    afterImg: null,
    steps: baseSteps(),
    migrationReported: false,
    createdAt: "2026-08-28 09:00:00",
    updatedAt: "2026-09-10 15:00:00",
  };

  const c2: Carpet = {
    id: "cp-117",
    code: "CAR-117",
    name: "双星奖章纹毯",
    origin: "安纳托利亚",
    era: "约1940年代",
    knotDensity: "42 结/平方英寸",
    material: "羊毛",
    dye: "植物染（靛蓝）",
    note: "湿洗中发现靛蓝迁移，已冻结后续工序",
    damages: [
      { id: "d-117-1", area: "上角穗头", severity: "轻微", threadId: "th-blue", length: 5, note: "" },
    ],
    markers: [],
    markerImage: null,
    beforeImg: null,
    afterImg: null,
    steps: [
      { id: "dust", state: "done", updatedAt: "2026-09-06 10:00:00" },
      { id: "wash", state: "active", note: "湿洗进行中：发现靛蓝向米地迁移" },
      { id: "recolor", state: "pending" },
      { id: "rinse", state: "pending" },
      { id: "weave", state: "pending" },
      { id: "finish", state: "pending" },
    ],
    migrationReported: true,
    createdAt: "2026-09-04 14:00:00",
    updatedAt: "2026-09-12 11:30:00",
  };

  const c3: Carpet = {
    id: "cp-138",
    code: "CAR-138",
    name: "雪山狮子纹藏毯",
    origin: "藏毯",
    era: "约1970年代",
    knotDensity: "30 结/平方英寸",
    material: "羊毛",
    dye: "矿物与植物混合染",
    note: "局部褪色，需匹配靛蓝色卡",
    damages: [
      { id: "d-138-1", area: "右上角褪色区", severity: "中等", threadId: "th-ivory", length: 9, note: "骨白批次余量紧张" },
    ],
    markers: [],
    markerImage: null,
    beforeImg: null,
    afterImg: null,
    steps: [
      { id: "dust", state: "done" },
      { id: "wash", state: "pending" },
      { id: "recolor", state: "pending" },
      { id: "rinse", state: "pending" },
      { id: "weave", state: "pending" },
      { id: "finish", state: "pending" },
    ],
    migrationReported: false,
    createdAt: "2026-09-15 10:30:00",
    updatedAt: "2026-09-15 10:30:00",
  };

  return {
    version: 1,
    seq: 4,
    carpets: [c1, c2, c3],
    threads: [t1, t2, t3, t4],
    logs: [
      { id: "lg-1", at: "2026-09-12 11:30:00", text: "CAR-117 湿洗发现靛蓝染色迁移，织补及后续工序已冻结", tone: "warn" },
      { id: "lg-2", at: "2026-08-28 09:00:00", text: "档案系统初始化，载入 3 条档案与 4 个补线批次", tone: "info" },
    ],
  };
}
