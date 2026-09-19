import { useMemo, useRef, useState } from "react";
import type { Carpet, CarpetDraft, LogEntry, StepId, StepState, Store } from "./types";
import {
  exportJson,
  loadStore,
  nowStr,
  ORIGINS,
  persist,
  threadById,
  threadUsed,
  uid,
} from "./storage";
import { isFrozen, progress, stepState, stepViews } from "./workflow";
import { EditorModal } from "./components/EditorModal";
import { ThreadModal } from "./components/ThreadModal";
import { Empty, Toast } from "./components/ui";
import type { StepAction } from "./components/StepsPanel";
import "./styles.css";

function addLog(store: Store, text: string, tone: LogEntry["tone"] = "info"): Store {
  const entry: LogEntry = { id: uid("lg"), at: nowStr(), text, tone };
  return { ...store, logs: [entry, ...store.logs].slice(0, 100) };
}

type ToastTone = "ok" | "err" | "info";
type ToastState = { text: string; tone: ToastTone } | null;

const STEP_NAMES: Record<StepId, string> = {
  dust: "除尘检查",
  wash: "湿洗",
  recolor: "局部回色",
  rinse: "冲洗确认",
  weave: "织补补线",
  finish: "整毯收尾",
};

export default function App() {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [origin, setOrigin] = useState<string>("全部");
  const [kw, setKw] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = (text: string, tone: ToastTone) => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  };

  // 事务式提交：先构造完整新状态并持久化，失败则整体回滚（工序状态不变）
  const commit = (next: Store, okMsg?: string, okTone: ToastTone = "ok"): boolean => {
    try {
      persist(next);
    } catch {
      flash("保存失败：浏览器本地存储空间不足，本次操作已整体回滚，数据未改动", "err");
      return false;
    }
    setStore(next);
    if (okMsg) flash(okMsg, okTone);
    return true;
  };

  const nextCode = `CAR-${String(store.seq + 100).padStart(3, "0")}`;
  const editing = editingId ? store.carpets.find((c) => c.id === editingId) ?? null : null;

  // ---------- 档案保存（整单扣减事务，在 EditorModal 内预检，此处再持久化兜底） ----------
  const saveCarpet = (draft: CarpetDraft): string | null => {
    const ts = nowStr();
    let next: Store;

    if (editingId) {
      next = {
        ...store,
        carpets: store.carpets.map((c) =>
          c.id === editingId
            ? {
                ...c,
                ...draft,
                steps: c.steps, // 保存档案信息不改变工序状态
                migrationReported: c.migrationReported,
                updatedAt: ts,
              }
            : c
        ),
      };
      next = addLog(next, `档案 ${draft.code} 信息已更新（工序状态保持不变）`, "info");
    } else {
      const carpet: Carpet = {
        ...draft,
        id: uid("cp"),
        steps: (["dust", "wash", "recolor", "rinse", "weave", "finish"] as StepId[]).map((id) => ({
          id,
          state: "pending" as StepState,
        })),
        migrationReported: false,
        createdAt: ts,
        updatedAt: ts,
      };
      next = { ...store, seq: store.seq + 1, carpets: [carpet, ...store.carpets] };
      next = addLog(next, `新档案 ${draft.code}（${draft.origin}）已建立，补线按整单扣减`, "ok");
    }

    if (!commit(next)) return "本地存储失败，已回滚";
    if (!editingId) {
      const created = next.carpets.find((c) => c.code === draft.code && !store.carpets.some((o) => o.id === c.id));
      setCreating(false);
      setEditingId(created?.id ?? next.carpets[0].id);
    }
    return null;
  };

  // ---------- 工序操作（状态机） ----------
  const stepAction = (carpetId: string, action: StepAction): string | null => {
    const c = store.carpets.find((x) => x.id === carpetId);
    if (!c) return "档案不存在";
    const views = stepViews(c);

    if (action.type === "report-migration") {
      if (stepState(c, "wash") !== "active" || c.migrationReported)
        return "仅可在湿洗进行中上报一次染色迁移";
      const next = {
        ...store,
        carpets: store.carpets.map((x) =>
          x.id === carpetId
            ? {
                ...x,
                migrationReported: true,
                updatedAt: nowStr(),
                steps: x.steps.map((s) =>
                  s.id === "wash" ? { ...s, note: s.note || "湿洗中发现染色迁移" } : s
                ),
              }
            : x
        ),
      };
      if (!commit(addLog(next, `${c.code} 湿洗发现染色迁移，织补等后续工序已冻结`, "warn"), "已上报迁移，后续工序冻结", "err"))
        return "本地存储失败，已回滚";
      return null;
    }

    const v = views.find((x) => x.id === action.stepId)!;
    let target: StepState;
    if (action.type === "start") {
      if (v.frozen) return "该工序处于冻结状态：请先完成局部回色与冲洗确认";
      if (!v.canStart) return "当前还不能开始该工序，请按顺序推进";
      target = "active";
    } else if (action.type === "complete") {
      if (v.frozen) return "该工序处于冻结状态";
      if (!v.canComplete) return "该工序尚未开始或不可完成";
      target = "done";
    } else {
      if (!v.canUndo) return "存在后续已推进的工序，无法回退";
      target = "pending";
    }

    const newSteps = c.steps.map((s) =>
      s.id === action.stepId
        ? {
            ...s,
            state: target,
            note: action.type === "complete" ? action.note ?? s.note : s.note,
            updatedAt: action.type === "undo" ? undefined : nowStr(),
          }
        : s
    );
    let next: Store = {
      ...store,
      carpets: store.carpets.map((x) =>
        x.id === carpetId ? { ...x, steps: newSteps, updatedAt: nowStr() } : x
      ),
    };

    const verb = action.type === "start" ? "开始" : action.type === "complete" ? "完成" : "回退";
    const tone: LogEntry["tone"] = action.type === "undo" ? "info" : "ok";
    let msg = `${c.code} ${verb}工序「${STEP_NAMES[action.stepId]}」`;
    if (action.stepId === "rinse" && action.type === "complete") {
      msg += "：浮色清除、不再迁移，后续工序冻结已解除";
    }
    next = addLog(next, msg, tone);

    if (!commit(next, msg, tone === "info" ? "info" : "ok"))
      return "本地存储失败，已回滚";
    return null;
  };

  // ---------- 色卡 ----------
  const addThread = (t: { code: string; color: string; name: string; source: string; totalLen: number }): string | null => {
    const next = {
      ...store,
      threads: [...store.threads, ...[{ ...t, id: uid("th"), createdAt: nowStr() }]],
    };
    if (!commit(addLog(next, `补线批次入库：${t.code}「${t.name}」${t.totalLen}m`, "ok"), "批次已入库"))
      return "本地存储失败，已回滚";
    return null;
  };

  const deleteThread = (id: string): string | null => {
    if (store.carpets.some((cp) => cp.damages.some((d) => d.threadId === id)))
      return "该批次已被档案占用，不可删除";
    const t = threadById(store, id);
    const next = { ...store, threads: store.threads.filter((x) => x.id !== id) };
    if (!commit(addLog(next, `补线批次 ${t?.code ?? id} 已删除`, "info"), "批次已删除", "info"))
      return "本地存储失败，已回滚";
    return null;
  };

  // ---------- 档案删除（占用补线自动退回） ----------
  const deleteCarpet = (id: string) => {
    const c = store.carpets.find((x) => x.id === id);
    if (!c) return;
    if (!window.confirm(`确认删除档案 ${c.code}「${c.name}」？\n删除后其占用的补线长度将自动退回批次余量。`)) return;
    const next = { ...store, carpets: store.carpets.filter((x) => x.id !== id) };
    if (editingId === id) {
      setEditingId(null);
      setCreating(false);
    }
    commit(addLog(next, `档案 ${c.code} 已删除，占用补线长度已退回各批次余量`, "warn"), "档案已删除，补线余量已退回", "info");
  };

  // ---------- 导入 ----------
  const importFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Store;
        if (data.version !== 1 || !Array.isArray(data.carpets) || !Array.isArray(data.threads))
          throw new Error("bad");
        if (!window.confirm("导入将覆盖当前全部本地数据，确定继续？")) return;
        if (commit(addLog(data, "已从备份文件恢复档案数据", "info"), "数据已导入", "ok")) {
          setOrigin("全部");
          setEditingId(null);
          setCreating(false);
        }
      } catch {
        flash("导入失败：文件格式不正确", "err");
      }
    };
    reader.readAsText(f);
  };

  // ---------- 派生：筛选 / 指标 ----------
  const originsWithData = useMemo(() => {
    const set = new Set(store.carpets.map((c) => c.origin));
    return ORIGINS.filter((o) => set.has(o));
  }, [store.carpets]);

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return store.carpets.filter((c) => {
      if (origin !== "全部" && c.origin !== origin) return false;
      if (!k) return true;
      return [c.code, c.name, c.era, c.material, c.dye, c.note, ...c.damages.map((d) => d.area)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(k));
    });
  }, [store.carpets, origin, kw]);

  const metrics = useMemo(() => {
    const total = store.carpets.length;
    const waiting = store.carpets.filter((c) => progress(c) < 100).length;
    const finished = total - waiting;
    const lowStock = store.threads.filter((t) => threadUsed(store, t.id) > t.totalLen - 10).length;
    const frozenCount = store.carpets.filter((c) => isFrozen(c)).length;
    return {
      total,
      waiting,
      finished,
      rate: total ? Math.round((finished / total) * 100) : 0,
      threads: store.threads.length,
      lowStock,
      frozen: frozenCount,
    };
  }, [store]);

  return (
    <main className="app">
      {toast && <Toast text={toast.text} tone={toast.tone} />}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">毯</span>
          <div>
            <h1>手工地毯修复档案</h1>
            <p>纹样标记 · 补线色卡 · 工序进度 · 数据仅存于本机浏览器</p>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={() => setThreadOpen(true)}>材料色卡（{store.threads.length}）</button>
          <button onClick={() => exportJson(store)}>导出备份</button>
          <button onClick={() => fileRef.current?.click()}>导入备份</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          />
          <button
            className="primary"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
          >
            ＋ 新建档案
          </button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>档案总数</small>
          <strong>{metrics.total}</strong>
          <em>待修复 {metrics.waiting} · 完工 {metrics.finished}</em>
        </article>
        <article>
          <small>完工率</small>
          <strong>{metrics.rate}%</strong>
          <em>按工序完成度统计</em>
        </article>
        <article>
          <small>补线色卡</small>
          <strong>{metrics.threads}</strong>
          <em className={metrics.lowStock ? "warn-text" : ""}>
            {metrics.lowStock ? `${metrics.lowStock} 个批次余量紧张` : "库存充足"}
          </em>
        </article>
        <article className={metrics.frozen ? "metric-warn" : ""}>
          <small>迁移冻结</small>
          <strong>{metrics.frozen}</strong>
          <em className={metrics.frozen ? "warn-text" : ""}>
            {metrics.frozen ? "等待回色与冲洗确认" : "无冻结工序"}
          </em>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel filter-panel">
          <h2>按产地筛选</h2>
          <div className="origin-list">
            <button className={origin === "全部" ? "origin active" : "origin"} onClick={() => setOrigin("全部")}>
              全部产地 <b>{store.carpets.length}</b>
            </button>
            {originsWithData.map((o) => (
              <button key={o} className={origin === o ? "origin active" : "origin"} onClick={() => setOrigin(o)}>
                {o} <b>{store.carpets.filter((c) => c.origin === o).length}</b>
              </button>
            ))}
            {originsWithData.length === 0 && <Empty text="暂无档案" />}
          </div>

          <h2 className="mt">操作日志</h2>
          <div className="log-list">
            {store.logs.length === 0 && <Empty text="暂无日志" />}
            {store.logs.slice(0, 8).map((l) => (
              <div key={l.id} className={`log-item log-${l.tone}`}>
                <p>{l.text}</p>
                <small>{l.at}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel list-panel">
          <div className="list-head">
            <div className="search">
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="搜索编号 / 名称 / 年代 / 材质 / 破损区域…"
              />
            </div>
            <span className="count">
              共 {filtered.length} 条{origin !== "全部" ? ` · ${origin}` : ""}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Empty
              text={
                store.carpets.length === 0
                  ? "还没有档案，点击右上角「新建档案」开始"
                  : "没有符合筛选条件的档案"
              }
            />
          ) : (
            <div className="card-grid">
              {filtered.map((c) => (
                <CarpetCard
                  key={c.id}
                  store={store}
                  carpet={c}
                  onOpen={() => {
                    setEditingId(c.id);
                    setCreating(false);
                  }}
                  onDelete={() => deleteCarpet(c.id)}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      <footer className="page-foot">
        全部档案、局部标记图与前后照片均以浏览器 localStorage 本地保存，不会上传服务器；清理浏览器数据前请先「导出备份」。
      </footer>

      {(creating || editing) && (
        <EditorModal
          store={store}
          carpet={editing}
          nextCode={nextCode}
          onClose={() => {
            setEditingId(null);
            setCreating(false);
          }}
          onSave={saveCarpet}
          onStep={stepAction}
        />
      )}
      {threadOpen && (
        <ThreadModal store={store} onClose={() => setThreadOpen(false)} onAdd={addThread} onDelete={deleteThread} />
      )}
    </main>
  );
}

function CarpetCard({
  store,
  carpet,
  onOpen,
  onDelete,
}: {
  store: Store;
  carpet: Carpet;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const pct = progress(carpet);
  const frozen = isFrozen(carpet);
  const current = stepViews(carpet).find((v) => v.state === "active");
  const thumb = carpet.afterImg ?? carpet.beforeImg ?? carpet.markerImage;

  return (
    <article className={`card${frozen ? " card-frozen" : ""}${pct === 100 ? " card-done" : ""}`}>
      <div className="card-thumb" onClick={onOpen}>
        {thumb ? <img src={thumb} alt={carpet.name} /> : <span className="thumb-ph">无图</span>}
        <span className={`card-badge ${pct === 100 ? "done" : frozen ? "frozen" : "wip"}`}>
          {pct === 100 ? "已完工" : frozen ? "迁移冻结" : "修复中"}
        </span>
      </div>
      <div className="card-body">
        <div className="card-title">
          <h3>{carpet.code}</h3>
          <small>{carpet.name}</small>
        </div>
        <dl className="meta-grid">
          <div>
            <dt>产地</dt>
            <dd>{carpet.origin}</dd>
          </div>
          <div>
            <dt>年代</dt>
            <dd>{carpet.era || "—"}</dd>
          </div>
          <div>
            <dt>结密度</dt>
            <dd>{carpet.knotDensity || "—"}</dd>
          </div>
          <div>
            <dt>材质</dt>
            <dd>{carpet.material || "—"}</dd>
          </div>
          <div className="span2">
            <dt>染色</dt>
            <dd>{carpet.dye || "—"}</dd>
          </div>
        </dl>

        <div className="card-damages">
          {carpet.damages.length === 0 && <small>未登记破损区域</small>}
          {carpet.damages.map((d) => {
            const t = threadById(store, d.threadId);
            return (
              <span key={d.id} className="damage-chip" title={d.note || d.area}>
                {d.area}
                {t && (
                  <>
                    <i style={{ background: t.color }} />
                    {t.code} · {d.length}m
                  </>
                )}
              </span>
            );
          })}
        </div>

        <div className="card-progress">
          <div className="progress-track sm">
            <div className={frozen ? "progress-fill frozen" : "progress-fill"} style={{ width: `${pct}%` }} />
          </div>
          <small>
            {pct}%
            {current && !frozen && <> · 当前：{current.name}</>}
            {frozen && <> · 冻结，等待回色+冲洗</>}
          </small>
        </div>

        <div className="card-actions">
          <button className="btn-small" onClick={onOpen}>
            打开档案
          </button>
          <button
            className="btn-small ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            删除
          </button>
        </div>
      </div>
    </article>
  );
}
