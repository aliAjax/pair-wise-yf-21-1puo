import { useMemo, useState } from "react";
import "./styles.css";
import type { Carpet, DamageArea, RepairLog, StepStatus, ThreadBatch } from "./types";
import {
  blankCarpet,
  blankDamage,
  consumptionOf,
  isFrozen,
  progressOf,
  usedByThread,
} from "./types";
import {
  defaultThreads,
  loadCarpets,
  loadThreads,
  persistCarpets,
  persistThreads,
  seedCarpets,
  validateThreadInventory,
} from "./storage";
import CarpetEditor from "./components/CarpetEditor";
import ProcessTimeline from "./components/ProcessTimeline";
import ThreadPalette from "./components/ThreadPalette";
import CarpetList from "./components/CarpetList";

const PRESET_ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯"];

interface Toast {
  text: string;
  type: "error" | "ok";
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function initCarpets(): Carpet[] {
  const saved = loadCarpets();
  if (saved.length > 0) return saved;
  const seed = seedCarpets();
  persistCarpets(seed);
  return seed;
}

function initThreads(): ThreadBatch[] {
  const threads = loadThreads();
  persistThreads(threads);
  return threads;
}

export default function App() {
  const [carpets, setCarpets] = useState<Carpet[]>(initCarpets);
  const [threads, setThreads] = useState<ThreadBatch[]>(initThreads);
  const [draft, setDraft] = useState<Carpet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

  const say = (text: string, type: "error" | "ok" = "ok") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3600);
  };

  // 左侧筛选用产地（预置 + 在档产地合并）
  const origins = useMemo(() => {
    const set = new Set<string>(PRESET_ORIGINS);
    carpets.forEach((c) => c.origin && set.add(c.origin));
    return ["全部", ...set];
  }, [carpets]);

  const originCounts = useMemo(() => {
    const map = new Map<string, number>();
    carpets.forEach((c) => {
      const key = c.origin || "未填产地";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [carpets]);

  const filtered = useMemo(
    () => carpets.filter((c) => originFilter === "全部" || c.origin === originFilter),
    [carpets, originFilter]
  );

  // 全局（含当前未保存编辑）对补线批次的占用：色卡与编辑面板共用同一份口径
  const projectedCarpets = useMemo(() => {
    if (!draft) return carpets;
    const rest = carpets.filter((c) => c.uid !== draft.uid);
    return [...rest, draft];
  }, [carpets, draft]);

  const remaining = useMemo(() => {
    const used = usedByThread(projectedCarpets);
    return new Map(threads.map((t) => [t.id, t.lengthM - (used.get(t.id) ?? 0)]));
  }, [threads, projectedCarpets]);

  const otherCarpetsUsage = useMemo(() => {
    if (!draft) return new Map<string, number>();
    return usedByThread(carpets.filter((c) => c.uid !== draft.uid));
  }, [carpets, draft]);

  const metrics = useMemo(() => {
    const total = carpets.length;
    const finished = carpets.filter((c) => progressOf(c).percent === 100).length;
    const avg = total ? Math.round(carpets.reduce((s, c) => s + progressOf(c).percent, 0) / total) : 0;
    const frozen = carpets.filter(isFrozen).length;
    return { open: total - finished, total, threads: threads.length, avg, frozen };
  }, [carpets, threads]);

  const guardDirty = (): boolean => {
    if (dirty) return window.confirm("当前档案有未保存修改，切换后将丢失，是否继续？");
    return true;
  };

  const selectCarpet = (uid: string) => {
    if (draft?.uid === uid) return;
    if (!guardDirty()) return;
    const target = carpets.find((c) => c.uid === uid);
    if (!target) return;
    setDraft(clone(target));
    setDirty(false);
    setSaveErrors([]);
  };

  const createCarpet = () => {
    if (!guardDirty()) return;
    const c = blankCarpet();
    setDraft(c);
    setDirty(true);
    setSaveErrors([]);
    say("已建立新档案草稿，填写后请保存");
  };

  const patchDraft = (patch: Partial<Carpet>) => {
    setDraft((d) => (d ? { ...d, ...patch, updatedAt: Date.now() } : d));
    setDirty(true);
  };

  const addDamage = () => {
    const d = blankDamage();
    setDraft((cur) => (cur ? { ...cur, damages: [...cur.damages, d] } : cur));
    setDirty(true);
  };

  const patchDamage = (uid: string, patch: Partial<DamageArea>) => {
    setDraft((cur) =>
      cur
        ? {
            ...cur,
            damages: cur.damages.map((d) => (d.uid === uid ? { ...d, ...patch } : d)),
          }
        : cur
    );
    setDirty(true);
  };

  const removeDamage = (uid: string) => {
    setDraft((cur) => (cur ? { ...cur, damages: cur.damages.filter((d) => d.uid !== uid) } : cur));
    setDirty(true);
  };

  const addLog = (log: RepairLog) => {
    setDraft((cur) => (cur ? { ...cur, logs: [...cur.logs, log] } : cur));
    setDirty(true);
  };

  const removeLog = (uid: string) => {
    setDraft((cur) => (cur ? { ...cur, logs: cur.logs.filter((l) => l.uid !== uid) } : cur));
    setDirty(true);
  };

  const changeStatus = (key: string, next: StepStatus) => {
    setDraft((cur) => {
      if (!cur) return cur;
      return { ...cur, statuses: { ...cur.statuses, [key]: next }, updatedAt: Date.now() };
    });
    setDirty(true);
  };

  const reportMigration = () => {
    setDraft((cur) => {
      if (!cur) return cur;
      // 冻结立即在当前档案生效；随保存一并持久化
      return {
        ...cur,
        migrationFound: true,
        statuses: { ...cur.statuses, wash: cur.statuses.wash === "pending" ? "active" : cur.statuses.wash },
        updatedAt: Date.now(),
      };
    });
    setDirty(true);
  };

  const saveDraft = () => {
    if (!draft) return;
    const errors: string[] = [];
    if (!draft.code.trim()) errors.push("请填写档案编号");
    if (!draft.origin.trim()) errors.push("请填写产地");
    if (!draft.era.trim()) errors.push("请填写年代");
    if (!draft.knotDensity.trim()) errors.push("请填写结密度");
    if (!draft.material.trim()) errors.push("请填写材质");
    if (carpets.some((c) => c.uid !== draft.uid && c.code.trim() === draft.code.trim())) {
      errors.push(`档案编号 ${draft.code} 已被使用`);
    }
    draft.damages.forEach((d, i) => {
      if (!d.name.trim()) errors.push(`第 ${i + 1} 处破损缺少名称`);
      if (!(d.lengthM >= 0)) errors.push(`「${d.name || `第 ${i + 1} 处破损`}」耗线长度无效`);
    });
    if (errors.length) {
      setSaveErrors(errors);
      say("档案信息不完整，未保存", "error");
      return;
    }

    // 整单校验：所有破损按色号合并扣减，任一批次超量则整次保存失败
    const nextCarpets = [...carpets.filter((c) => c.uid !== draft.uid), { ...draft, code: draft.code.trim() }];
    const check = validateThreadInventory(nextCarpets, threads);
    if (!check.ok) {
      setSaveErrors(check.errors);
      say("补线库存超量，整次保存失败，工序状态保持不变", "error");
      return; // 不落库：工序状态、色卡库存均不变
    }

    try {
      persistCarpets(nextCarpets);
    } catch {
      setSaveErrors(["浏览器本地存储空间不足（可压缩/减少照片后重试）"]);
      say("写入本地存储失败", "error");
      return;
    }
    setCarpets(nextCarpets);
    setDraft({ ...draft, code: draft.code.trim() });
    setDirty(false);
    setSaveErrors([]);
    say(`档案 ${draft.code.trim()} 已保存，补线按批次整单扣减`);
  };

  const deleteDraft = () => {
    if (!draft) return;
    if (!window.confirm(`确定删除档案「${draft.code || "未编号"}」？该操作只影响本机数据。`)) return;
    const next = carpets.filter((c) => c.uid !== draft.uid);
    persistCarpets(next);
    setCarpets(next);
    setDraft(null);
    setDirty(false);
    setSaveErrors([]);
    say("档案已删除");
  };

  const addThread = (batch: ThreadBatch) => {
    const next = [...threads, batch];
    persistThreads(next);
    setThreads(next);
  };

  const removeThread = (id: string) => {
    // 已保存档案或当前草稿中被破损占用的批次不允许删除
    const usedSaved = usedByThread(carpets).get(id) ?? 0;
    const usedDraft = draft ? consumptionOf(draft).get(id) ?? 0 : 0;
    if (usedSaved > 0 || usedDraft > 0) {
      say("该色号正被破损占用，请先解绑后再删除", "error");
      return;
    }
    const next = threads.filter((t) => t.id !== id);
    persistThreads(next);
    setThreads(next);
  };

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62009 · 手工地毯修复工作室 · 数据仅存本机浏览器</p>
        <h1>地毯修复纹样档案</h1>
        <span>
          记录产地、年代、结密度、材质与染色；每处破损绑定一种补线色号，共用批次按剩余长度整单扣减，超量则整次保存失败。
          湿洗中发现染色迁移即冻结后续工序，局部回色与冲洗确认完成后解除。
        </span>
      </header>

      <section className="metrics">
        <article>
          <small>待修复</small>
          <strong>{metrics.open}</strong>
        </article>
        <article>
          <small>在档纹样</small>
          <strong>{metrics.total}</strong>
        </article>
        <article>
          <small>色卡数量</small>
          <strong>{metrics.threads}</strong>
        </article>
        <article>
          <small>完工率</small>
          <strong>{metrics.avg}%</strong>
        </article>
      </section>

      {metrics.frozen > 0 && (
        <div className="banner freeze global">
          <b>⛔ {metrics.frozen} 张地毯因染色迁移处于工序冻结状态</b>
          <span>需完成局部回色与冲洗确认后方可继续湿洗之后的工序。</span>
        </div>
      )}

      <div className="workspace">
        <aside className="side">
          <section className="panel">
            <div className="heading">
              <div>
                <p>档案列表</p>
                <h2>按产地筛选</h2>
              </div>
              <button type="button" className="primary" onClick={createCarpet}>
                + 新档案
              </button>
            </div>
            <div className="chips">
              {origins.map((o) => {
                const count = o === "全部" ? carpets.length : originCounts.get(o) ?? 0;
                return (
                  <button
                    key={o}
                    type="button"
                    className={originFilter === o ? "active" : ""}
                    onClick={() => setOriginFilter(o)}
                  >
                    {o} <em>{count}</em>
                  </button>
                );
              })}
            </div>
            <input
              className="search"
              placeholder="搜索编号 / 材质 / 破损名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <CarpetList
              carpets={filtered}
              selectedUid={draft?.uid ?? null}
              dirtyUids={new Set(dirty && draft ? [draft.uid] : [])}
              query={query}
              onSelect={selectCarpet}
            />
          </section>

          <ThreadPalette
            threads={threads}
            remaining={remaining}
            onAdd={addThread}
            onRemove={removeThread}
            onMessage={say}
          />
        </aside>

        <section className="main-col">
          {!draft ? (
            <section className="panel placeholder">
              <h2>单页档案</h2>
              <p>从左侧选择一张地毯，或点击「新档案」开始录入。</p>
              <ul>
                <li>产地、年代、结密度、材质、染色、破损区域、补线色号与工序一屏登记。</li>
                <li>保存时对全部破损按补线批次整单扣减；超量则整次失败，工序状态不变。</li>
                <li>局部标记图、修复前后照片、色卡与工序进度全部保存在本机浏览器。</li>
              </ul>
            </section>
          ) : (
            <>
              <CarpetEditor
                draft={draft}
                threads={threads}
                otherCarpetsUsage={otherCarpetsUsage}
                dirty={dirty}
                saveError={saveErrors}
                onPatch={patchDraft}
                onSave={saveDraft}
                onDelete={deleteDraft}
                onAddDamage={addDamage}
                onPatchDamage={patchDamage}
                onRemoveDamage={removeDamage}
                onAddLog={addLog}
                onRemoveLog={removeLog}
                onMessage={say}
              />
              <ProcessTimeline
                carpet={draft}
                onChangeStatus={changeStatus}
                onReportMigration={reportMigration}
                onMessage={say}
              />
            </>
          )}
        </section>
      </div>

      <footer className="local-note">
        所有档案、照片、色卡与工序数据均通过 localStorage 保存在当前浏览器，不上传服务器；清除站点数据会一并清除档案。
      </footer>

      {toast && (
        <div className={"toast " + toast.type} role="status">
          {toast.text}
        </div>
      )}
    </main>
  );
}
