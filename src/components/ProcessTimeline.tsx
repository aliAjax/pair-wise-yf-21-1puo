import {
  Carpet,
  STEP_DEFS,
  WASH_KEY,
  RECOLOR_KEY,
  RINSE_KEY,
  activeStepKeys,
  isFrozen,
  stepStatus,
  progressOf,
  type StepStatus,
} from "../types";

interface Props {
  carpet: Carpet;
  onChangeStatus: (key: string, next: StepStatus) => void;
  onReportMigration: () => void;
  onMessage: (text: string, type?: "error" | "ok") => void;
}

/** 工序进度：染色迁移后湿洗之后的工序冻结，回色+冲洗完成才解除 */
export default function ProcessTimeline({ carpet, onChangeStatus, onReportMigration, onMessage }: Props) {
  const frozen = isFrozen(carpet);
  const keys = activeStepKeys(carpet);
  const washIdx = keys.indexOf(WASH_KEY);
  const progress = progressOf(carpet);
  const recolorState = stepStatus(carpet, RECOLOR_KEY);
  const rinseState = stepStatus(carpet, RINSE_KEY);
  const washState = stepStatus(carpet, WASH_KEY);

  const tryChange = (key: string, next: StepStatus) => {
    const idx = keys.indexOf(key);
    if (frozen && idx > washIdx && key !== RECOLOR_KEY && key !== RINSE_KEY) {
      onMessage("染色迁移处理中：湿洗之后的工序已冻结，待局部回色与冲洗确认完成", "error");
      return;
    }
    if (key === RINSE_KEY && next === "active" && recolorState === "pending") {
      onMessage("请先开始局部回色，再进行冲洗确认", "error");
      return;
    }
    if (key === RINSE_KEY && next === "done" && recolorState !== "done") {
      onMessage("局部回色尚未完成，不能确认冲洗", "error");
      return;
    }
    onChangeStatus(key, next);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>修复工序</p>
          <h2>工序进度</h2>
        </div>
        <div className="progress-box">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <small>
            {progress.done}/{progress.total} 道完成 · {progress.percent}%
          </small>
        </div>
      </div>

      {frozen && (
        <div className="banner freeze">
          <b>⛔ 染色迁移 · 后续工序冻结</b>
          <span>
            湿洗中发现染色迁移，湿洗之后的工序已暂停；完成「局部回色」和「冲洗确认」后自动解除。
            {recolorState === "done" && rinseState !== "done" && <em> 回色已完成，等待冲洗确认。</em>}
          </span>
        </div>
      )}
      {carpet.migrationFound && !frozen && (recolorState === "done" && rinseState === "done") && (
        <div className="banner thaw">
          <b>✅ 已解除冻结</b>
          <span>局部回色与冲洗确认均已完成，后续工序恢复。</span>
        </div>
      )}

      <ol className="steps">
        {STEP_DEFS.filter((s) => keys.includes(s.key)).map((s) => {
          const state = stepStatus(carpet, s.key);
          const idx = keys.indexOf(s.key);
          const locked = frozen && idx > washIdx && s.key !== RECOLOR_KEY && s.key !== RINSE_KEY;
          const rescue = s.key === RECOLOR_KEY || s.key === RINSE_KEY;
          return (
            <li
              key={s.key}
              className={[
                "step",
                `is-${state}`,
                locked ? "locked" : "",
                rescue && carpet.migrationFound ? "rescue" : "",
              ].join(" ")}
            >
              <div className="step-node">
                {state === "done" ? "✓" : locked ? "🔒" : idx + 1}
              </div>
              <div className="step-body">
                <b>{s.label}</b>
                {s.key === WASH_KEY && (
                  <small>
                    {state === "pending"
                      ? "湿洗前先确认色牢度"
                      : carpet.migrationFound
                        ? "已发现染色迁移"
                        : "湿洗进行中 / 已完成"}
                  </small>
                )}
                {rescue && carpet.migrationFound && <small className="tag">染色迁移补救工序</small>}
                <div className="step-actions">
                  {state === "pending" && (
                    <button type="button" onClick={() => tryChange(s.key, "active")} disabled={locked}>
                      开始
                    </button>
                  )}
                  {state === "active" && (
                    <button type="button" className="mini primary" onClick={() => tryChange(s.key, "done")}>
                      完成
                    </button>
                  )}
                  {state === "done" && (
                    <button
                      type="button"
                      className="mini"
                      onClick={() => {
                        if (locked) {
                          onMessage("冻结期间不能改动后续工序", "error");
                          return;
                        }
                        onChangeStatus(s.key, "pending");
                      }}
                    >
                      重置
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="migration-row">
        {!carpet.migrationFound ? (
          <button
            type="button"
            className="danger-outline"
            disabled={washState === "pending"}
            onClick={() => {
              if (washState === "pending") {
                onMessage("尚未开始湿洗；进入湿洗后若发现迁移再登记", "error");
                return;
              }
              onReportMigration();
              onMessage("已登记染色迁移：湿洗之后的工序冻结，等待回色与冲洗", "ok");
            }}
          >
            ⚠ 湿洗中发现染色迁移（登记后冻结后续工序）
          </button>
        ) : (
          <p className="migration-note">
            已登记染色迁移：补救工序「局部回色 → 冲洗确认」全部完成前，后续工序保持冻结。
          </p>
        )}
      </div>
    </section>
  );
}
