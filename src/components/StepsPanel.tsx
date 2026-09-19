import { useState } from "react";
import type { Carpet, StepId, Store } from "../types";
import { canReportMigration, progress, stepViews } from "../workflow";
import { threadById } from "../storage";

export type StepAction =
  | { type: "start" | "complete" | "undo"; stepId: StepId; note?: string }
  | { type: "report-migration" };

export function StepsPanel({
  store,
  carpet,
  onAction,
}: {
  store: Store;
  carpet: Carpet;
  onAction: (carpetId: string, action: StepAction) => string | null;
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmRinse, setConfirmRinse] = useState(false);
  const [confirmRinseOk, setConfirmRinseOk] = useState(false);

  const views = stepViews(carpet);
  const pct = progress(carpet);

  const run = (action: StepAction) => {
    setErr(null);
    const e = onAction(carpet.id, action);
    if (e) setErr(e);
    setNoteFor(null);
    setNote("");
    setConfirmRinse(false);
  };

  return (
    <div className="tab-pane steps-pane">
      <div className="progress-line">
        <div className="progress-meta">
          <b>工序进度 {pct}%</b>
          {carpet.migrationReported && (
            <span className="freeze-chip">⚠ 染色迁移应急流程{pct === 100 ? "（已解除冻结）" : "（后续工序冻结中）"}</span>
          )}
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {carpet.migrationReported && pct < 100 && (
        <div className="freeze-banner">
          湿洗中发现染色迁移，<b>织补补线与整毯收尾已冻结</b>。
          必须依次完成「局部回色」与「冲洗确认（浮色清除、不再迁移）」后，冻结才会解除。
        </div>
      )}

      {err && <div className="inline-alert">{err}</div>}

      {canReportMigration(carpet) && (
        <button className="btn-warn block" onClick={() => run({ type: "report-migration" })}>
          ⚠ 上报：湿洗中发现染色迁移（冻结后续工序）
        </button>
      )}

      <ol className="step-list">
        {views
          .filter((v) => v.applicable)
          .map((v, i, arr) => (
            <li key={v.id} className={`step-item state-${v.state}${v.frozen ? " frozen" : ""}`}>
              <div className="step-no">
                {v.state === "done" ? "✓" : i + 1}
                {i < arr.length - 1 && <i className="step-link" />}
              </div>
              <div className="step-body">
                <div className="step-title">
                  <b>{v.name}</b>
                  {v.frozen && <span className="state-tag tag-frozen">已冻结</span>}
                  {v.state === "active" && <span className="state-tag tag-active">进行中</span>}
                  {v.state === "done" && <span className="state-tag tag-done">已完成</span>}
                  {v.state === "pending" && !v.frozen && <span className="state-tag">待执行</span>}
                </div>
                <p className="step-desc">{v.desc}</p>
                {v.note && <p className="step-note">备注：{v.note}</p>}
                {v.id === "wash" && carpet.migrationReported && v.state !== "done" && (
                  <p className="step-note warn">监测到染色迁移迹象，请先完成湿洗再进入回色流程。</p>
                )}
                <div className="step-actions">
                  {v.canStart && (
                    <button className="btn-small" onClick={() => run({ type: "start", stepId: v.id })}>
                      开始
                    </button>
                  )}
                  {v.canComplete && v.id !== "rinse" && (
                    noteFor === v.id ? (
                      <span className="note-input">
                        <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="完成备注（可选）" />
                        <button className="btn-small primary" onClick={() => run({ type: "complete", stepId: v.id, note: note || undefined })}>
                          确认完成
                        </button>
                        <button className="btn-small" onClick={() => setNoteFor(null)}>取消</button>
                      </span>
                    ) : (
                      <button className="btn-small primary" onClick={() => { setNoteFor(v.id); setNote(""); }}>
                        完成
                      </button>
                    )
                  )}
                  {v.canComplete && v.id === "rinse" && (
                    confirmRinse ? (
                      <span className="note-input">
                        <label className="check">
                          <input type="checkbox" checked={confirmRinseOk} onChange={(e) => setConfirmRinseOk(e.target.checked)} />
                          已确认浮色清除、冲洗后不再迁移
                        </label>
                        <button
                          className="btn-small primary"
                          disabled={!confirmRinseOk}
                          onClick={() => run({ type: "complete", stepId: "rinse", note: "冲洗确认：浮色清除，不再迁移" })}
                        >
                          确认并解除冻结
                        </button>
                        <button className="btn-small" onClick={() => { setConfirmRinse(false); setConfirmRinseOk(false); }}>取消</button>
                      </span>
                    ) : (
                      <button className="btn-small primary" onClick={() => setConfirmRinse(true)}>
                        完成（需冲洗确认）
                      </button>
                    )
                  )}
                  {v.canUndo && (
                    <button className="btn-small ghost" onClick={() => run({ type: "undo", stepId: v.id })}>
                      回退
                    </button>
                  )}
                  {v.frozen && <span className="frozen-text">等待回色 + 冲洗确认解除</span>}
                </div>
              </div>
            </li>
          ))}
      </ol>

      {!carpet.migrationReported && (
        <p className="hint">常规流程中「局部回色」「冲洗确认」为迁移应急工序，暂不启用。</p>
      )}

      <div className="steps-mat">
        <h4>本档案绑定补线</h4>
        {carpet.damages.filter((d) => d.threadId).length === 0 && <div className="empty small">尚无绑定补线的破损</div>}
        {carpet.damages.filter((d) => d.threadId).map((d) => {
          const t = threadById(store, d.threadId);
          return (
            <div className="mat-item" key={d.id}>
              <i style={{ background: t?.color ?? "#ccc" }} />
              <span>{t?.code ?? "?"} · {t?.name ?? "已删除批次"}</span>
              <em>{d.area}</em>
              <b>{d.length}m</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
