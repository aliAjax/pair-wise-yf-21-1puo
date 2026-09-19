import { Carpet, ThreadBatch, usedByThread } from "./types";

const CARPET_KEY = "rug-restore.carpets.v1";
const THREAD_KEY = "rug-restore.threads.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadCarpets(): Carpet[] {
  return read<Carpet[]>(CARPET_KEY, []);
}

export function loadThreads(): ThreadBatch[] {
  return read<ThreadBatch[]>(THREAD_KEY, defaultThreads());
}

export function persistCarpets(carpets: Carpet[]): void {
  write(CARPET_KEY, carpets);
}

export function persistThreads(threads: ThreadBatch[]): void {
  write(THREAD_KEY, threads);
}

/**
 * 按拟保存的地毯清单重算每个补线批次的耗用并整单扣减。
 * 多个破损共用同一批次时长度合并；任一批次超量则整体拒绝，
 * 调用方据此放弃整次保存（工序状态保持不变）。
 */
export function validateThreadInventory(
  nextCarpets: Carpet[],
  threads: ThreadBatch[]
): { ok: true; remaining: Map<string, number> } | { ok: false; errors: string[] } {
  const used = usedByThread(nextCarpets);
  const errors: string[] = [];
  const remaining = new Map<string, number>();
  for (const batch of threads) {
    const need = used.get(batch.id) ?? 0;
    const left = batch.lengthM - need;
    remaining.set(batch.id, left);
    if (left < -1e-9) {
      errors.push(
        `补线色号 ${batch.id}（${batch.name}）剩余 ${batch.lengthM} 米，本单共需 ${need} 米，超出 ${(need - batch.lengthM).toFixed(2)} 米`
      );
    }
  }
  // 绑定了已不存在的色号
  for (const id of used.keys()) {
    if (!threads.some((t) => t.id === id)) {
      errors.push(`补线色号 ${id} 已从色卡移除，无法扣减`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, remaining };
}

let seeded = false;
export function defaultThreads(): ThreadBatch[] {
  if (seeded) return [];
  seeded = true;
  const now = Date.now();
  return [
    { id: "TH-01", name: "茜草绯红", hex: "#9d2f21", dyeSource: "茜草根·植物染", material: "羊毛手纺线", lengthM: 120, createdAt: now },
    { id: "TH-02", name: "靛蓝", hex: "#243b6b", dyeSource: "木蓝·植物染", material: "羊毛手纺线", lengthM: 96, createdAt: now },
    { id: "TH-03", name: "石榴皮赭黄", hex: "#c8862d", dyeSource: "石榴皮·植物染", material: "羊毛手纺线", lengthM: 80, createdAt: now },
    { id: "TH-04", name: "核桃棕", hex: "#6b4a2b", dyeSource: "核桃壳·植物染", material: "羊毛手纺线", lengthM: 64, createdAt: now },
    { id: "TH-05", name: "骨白", hex: "#efe6d2", dyeSource: "本白未染", material: "棉经线", lengthM: 150, createdAt: now },
    { id: "TH-06", name: "松墨绿", hex: "#31533f", dyeSource: "艾草+铁媒", material: "羊毛手纺线", lengthM: 72, createdAt: now },
  ];
}

/** 首次使用时写入演示档案，便于直接看到库存扣减与冻结规则 */
export function seedCarpets(): Carpet[] {
  const now = Date.now();
  const statuses = (over: Record<string, "pending" | "active" | "done">) => ({
    ...Object.fromEntries(
      ["intake", "dust", "wash", "recolor", "rinse", "dry", "reweave", "trim", "archive"].map((k) => [k, "pending" as const])
    ),
    ...over,
  });
  return [
    {
      uid: "carpet_seed_1",
      code: "CAR-092",
      origin: "波斯",
      era: "约 1960s",
      knotDensity: "36 结/平方英寸",
      material: "羊毛绒头·棉经",
      dyeType: "植物染",
      patternNote: "中心葵花纹，左穗边磨损；毯角一处蛀洞。",
      damages: [
        { uid: "dmg_seed_1", name: "左穗边磨损", zone: "边穗", severity: "中", lengthM: 4.5, threadId: "TH-04", x: 8, y: 46, note: "沿穗边约 30cm" },
        { uid: "dmg_seed_2", name: "右下角蛀洞", zone: "四角", severity: "轻", lengthM: 2, threadId: "TH-03", x: 86, y: 84, note: "直径约 6cm" },
      ],
      logs: [
        { uid: "log_seed_1", phase: "before", date: "2026-09-02", text: "入档拍照：穗边起毛，角部蛀洞边缘尚牢。" },
      ],
      statuses: statuses({ intake: "done", dust: "done", wash: "active" }),
      migrationFound: false,
      createdAt: now - 3 * 86400000,
      updatedAt: now - 86400000,
    },
    {
      uid: "carpet_seed_2",
      code: "CAR-117",
      origin: "安纳托利亚",
      era: "约 1990s",
      knotDensity: "42 结/平方英寸",
      material: "羊毛绒头·羊毛经",
      dyeType: "混合染",
      patternNote: "双徽章纹；湿洗时绯红迁移，流程冻结待回色。",
      damages: [
        { uid: "dmg_seed_3", name: "中心纹样缺口", zone: "毯心", severity: "重", lengthM: 6, threadId: "TH-01", x: 50, y: 42, note: "纹样缺纬约 12cm" },
      ],
      logs: [
        { uid: "log_seed_2", phase: "before", date: "2026-09-10", text: "中心纹样缺纬，绒头高低不平。" },
        { uid: "log_seed_3", phase: "before", date: "2026-09-14", text: "温水湿洗第 8 分钟发现绯红向白地迁移，立即控水。" },
      ],
      statuses: statuses({ intake: "done", dust: "done", wash: "done", recolor: "active", dry: "pending" }),
      migrationFound: true,
      createdAt: now - 9 * 86400000,
      updatedAt: now - 5 * 86400000,
    },
    {
      uid: "carpet_seed_3",
      code: "CAR-138",
      origin: "藏毯",
      era: "约 1980s",
      knotDensity: "50 结/平方英寸",
      material: "羊毛绒头·羊毛经",
      dyeType: "植物染",
      patternNote: "局部褪色，靛蓝地色需色卡比对后补色。",
      damages: [
        { uid: "dmg_seed_4", name: "上部地色褪色", zone: "毯心", severity: "中", lengthM: 3, threadId: "TH-02", x: 48, y: 16, note: "日晒褪色区约 20×15cm" },
      ],
      logs: [{ uid: "log_seed_4", phase: "before", date: "2026-09-12", text: "毯面上部色弱，需配靛蓝 TH-02。" }],
      statuses: statuses({ intake: "done", dust: "active" }),
      migrationFound: false,
      createdAt: now - 7 * 86400000,
      updatedAt: now - 2 * 86400000,
    },
  ];
}
