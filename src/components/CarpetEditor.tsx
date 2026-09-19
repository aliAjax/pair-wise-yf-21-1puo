import { useRef, useState } from "react";
import type { Carpet, DamageArea, DyeType, RepairLog, ThreadBatch } from "../types";
import { consumptionOf } from "../types";
import { fileToThumb } from "./photos";
import MarkerMap from "./MarkerMap";

interface Props {
  draft: Carpet;
  threads: ThreadBatch[];
  otherCarpetsUsage: Map<string, number>; // 除本档外其他在档地毯的占用量
  dirty: boolean;
  saveError: string[];
  onPatch: (patch: Partial<Carpet>) => void;
  onSave: () => void;
  onDelete: () => void;
  onAddDamage: () => void;
  onPatchDamage: (uid: string, patch: Partial<DamageArea>) => void;
  onRemoveDamage: (uid: string) => void;
  onAddLog: (log: RepairLog) => void;
  onRemoveLog: (uid: string) => void;
  onMessage: (text: string, type?: "error" | "ok") => void;
}

const ZONES = ["毯心", "边穗", "四角", "经线", "毯背"];
const DYES: DyeType[] = ["植物染", "化学染", "混合染"];

/** 本档保存后的预计库存剩余 = 入库量 − 其他档占用 − 本档占用 */
function projectedRemaining(draft: Carpet, threads: ThreadBatch[], otherUsage: Map<string, number>) {
  const own = consumptionOf(draft);
  return new Map(
    threads.map((t) => {
      const need = (otherUsage.get(t.id) ?? 0) + (own.get(t.id) ?? 0);
      return [t.id, t.lengthM - need];
    })
  );
}

export default function CarpetEditor(props: Props) {
  const { draft, threads, otherCarpetsUsage, dirty, saveError, onPatch, onSave, onDelete } = props;
  const [selectedDamage, setSelectedDamage] = useState<string | null>(null);
  const [logPhase, setLogPhase] = useState<"before" | "after">("before");
  const [logDate, setLogDate] = useState("");
  const [logText, setLogText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | undefined>(undefined);

  const remaining = projectedRemaining(draft, threads, otherCarpetsUsage);
  const ownUse = consumptionOf(draft);

  const selected = draft.damages.find((d) => d.uid === selectedDamage) ?? draft.damages[0] ?? null;

  const addLog = () => {
    if (!logText.trim()) {
      props.onMessage("请填写记录内容", "error");
      return;
    }
    props.onAddLog({
      uid: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      phase: logPhase,
      date: logDate || new Date().toISOString().slice(0, 10),
      text: logText.trim(),
      photo: pendingPhoto,
    });
    setLogText("");
    setPendingPhoto(undefined);
    if (fileRef.current) fileRef.current.value = "";
    props.onMessage(logPhase === "before" ? "已加入修复前记录" : "已加入修复后记录", "ok");
  };

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    try {
      setPendingPhoto(await fileToThumb(file));
    } catch {
      props.onMessage("图片处理失败", "error");
    }
  };

  const beforeLogs = draft.logs.filter((l) => l.phase === "before");
  const afterLogs = draft.logs.filter((l) => l.phase === "after");

  return (
    <div className="editor">
      <section className="panel">
        <div className="heading">
          <div>
            <p>单页档案</p>
            <h2>{draft.code ? `${draft.code} · 档案` : "新建地毯档案"}</h2>
          </div>
          <div className="heading-actions">
            <button type="button" className="ghost" onClick={onDelete}>
              删除本档
            </button>
            <button type="button" className="primary" onClick={onSave}>
              {dirty ? "保存档案" : "已保存"}
            </button>
          </div>
        </div>
        {dirty && <p className="save-hint">有未保存修改；保存时将按本单整体校验补线库存。</p>}
        {saveError.length > 0 && (
          <div className="banner error">
            <b>整次保存失败，工序状态与库存均未改动：</b>
            <ul>
              {saveError.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="field-grid">
          <label>
            <span>档案编号 *</span>
            <input value={draft.code} placeholder="CAR-142" onChange={(e) => onPatch({ code: e.target.value })} />
          </label>
          <label>
            <span>产地 *</span>
            <input value={draft.origin} list="origin-list" placeholder="如：波斯 / 安纳托利亚 / 藏毯" onChange={(e) => onPatch({ origin: e.target.value })} />
            <datalist id="origin-list">
              {["波斯", "安纳托利亚", "高加索", "藏毯", "新疆", "土库曼"].map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label>
            <span>年代 *</span>
            <input value={draft.era} placeholder="约 1970s" onChange={(e) => onPatch({ era: e.target.value })} />
          </label>
          <label>
            <span>结密度 *</span>
            <input value={draft.knotDensity} placeholder="36 结/平方英寸" onChange={(e) => onPatch({ knotDensity: e.target.value })} />
          </label>
          <label>
            <span>材质 *</span>
            <input value={draft.material} placeholder="羊毛绒头·棉经" onChange={(e) => onPatch({ material: e.target.value })} />
          </label>
          <label>
            <span>染色类型</span>
            <select value={draft.dyeType} onChange={(e) => onPatch({ dyeType: e.target.value as DyeType })}>
              {DYES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="full">
          <span>纹样备注</span>
          <textarea
            rows={2}
            value={draft.patternNote}
            placeholder="描述中心纹、边饰、配色等"
            onChange={(e) => onPatch({ patternNote: e.target.value })}
          />
        </label>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>破损与补线</p>
            <h2>纹样局部标记图</h2>
          </div>
          <button type="button" className="primary" onClick={props.onAddDamage}>
            + 登记破损
          </button>
        </div>

        <MarkerMap
          damages={draft.damages}
          threads={threads}
          selectedUid={selected?.uid ?? null}
          onSelect={setSelectedDamage}
          onMove={(uid, x, y) => props.onPatchDamage(uid, { x, y })}
        />

        <div className="damage-list">
          {draft.damages.map((d, i) => {
            const t = threads.find((x) => x.id === d.threadId) ?? null;
            const left = d.threadId ? remaining.get(d.threadId) : null;
            const active = selected?.uid === d.uid;
            return (
              <article key={d.uid} className={"damage-card" + (active ? " active" : "")} onClick={() => setSelectedDamage(d.uid)}>
                <header>
                  <span className="dot" style={{ background: t?.hex ?? "#cbd5e1" }} />
                  <b>
                    {i + 1}. {d.name || "未命名破损"}
                  </b>
                  <button
                    type="button"
                    className="mini ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onRemoveDamage(d.uid);
                    }}
                  >
                    ✕
                  </button>
                </header>
                <div className="damage-fields">
                  <label>
                    <span>名称 *</span>
                    <input value={d.name} placeholder="如：左穗边磨损" onChange={(e) => props.onPatchDamage(d.uid, { name: e.target.value })} />
                  </label>
                  <label>
                    <span>部位</span>
                    <select value={d.zone} onChange={(e) => props.onPatchDamage(d.uid, { zone: e.target.value })}>
                      {ZONES.map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>程度</span>
                    <select value={d.severity} onChange={(e) => props.onPatchDamage(d.uid, { severity: e.target.value as DamageArea["severity"] })}>
                      {(["轻", "中", "重"] as const).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>预计耗线（米）</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={d.lengthM}
                      onChange={(e) => props.onPatchDamage(d.uid, { lengthM: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="bind-row">
                  <label className="bind-select">
                    <span>绑定补线色号（每处仅一种）</span>
                    <select
                      value={d.threadId ?? ""}
                      onChange={(e) => props.onPatchDamage(d.uid, { threadId: e.target.value || null })}
                    >
                      <option value="">— 暂不绑定 —</option>
                      {threads.map((tb) => (
                        <option key={tb.id} value={tb.id}>
                          {tb.id} · {tb.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {d.threadId && (
                    <span className={"bind-stock" + ((left ?? 0) < 0 ? " out" : (left ?? 0) < 5 ? " low" : "")}>
                      保存后预计剩余 {left?.toFixed(1)} 米
                    </span>
                  )}
                </div>
                <input
                  className="note-line"
                  value={d.note ?? ""}
                  placeholder="破损备注（尺寸、边缘牢度等）"
                  onChange={(e) => props.onPatchDamage(d.uid, { note: e.target.value })}
                />
              </article>
            );
          })}
          {draft.damages.length === 0 && <p className="empty">还没有破损区域，点击右上角「登记破损」。</p>}
        </div>

        {ownUse.size > 0 && (
          <div className="usage-summary">
            <b>本单补线耗用合计（共用批次已合并）：</b>
            {[...ownUse.entries()].map(([id, m]) => {
              const t = threads.find((x) => x.id === id);
              const left = remaining.get(id);
              return (
                <span key={id} className={"usage-chip" + ((left ?? 0) < 0 ? " out" : "")}>
                  <i style={{ background: t?.hex ?? "#999" }} />
                  {id} {t?.name}：{m.toFixed(1)} 米
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>修复前后记录</p>
            <h2>修复前 / 修复后</h2>
          </div>
          <div className="phase-tabs">
            <button type="button" className={logPhase === "before" ? "active" : ""} onClick={() => setLogPhase("before")}>
              修复前（{beforeLogs.length}）
            </button>
            <button type="button" className={logPhase === "after" ? "active" : ""} onClick={() => setLogPhase("after")}>
              修复后（{afterLogs.length}）
            </button>
          </div>
        </div>

        <div className="log-composer">
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <input
            placeholder={logPhase === "before" ? "入档检视 / 湿洗发现…" : "完工状态 / 对比结论…"}
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
          />
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <button type="button" className="primary" onClick={addLog}>
            加入{logPhase === "before" ? "修复前" : "修复后"}记录
          </button>
        </div>
        {pendingPhoto && (
          <div className="pending-photo">
            <img src={pendingPhoto} alt="待加入记录的照片" />
            <button type="button" className="mini ghost" onClick={() => setPendingPhoto(undefined)}>
              移除照片
            </button>
          </div>
        )}

        <div className="log-columns">
          {(["before", "after"] as const).map((phase) => (
            <div key={phase} className={"log-col" + (phase === "after" ? " after" : "")}>
              <h3>{phase === "before" ? "修复前记录" : "修复后记录"}</h3>
              {draft.logs.filter((l) => l.phase === phase).length === 0 && <p className="empty">暂无记录</p>}
              {draft.logs
                .filter((l) => l.phase === phase)
                .map((l) => (
                  <article key={l.uid} className="log-item">
                    {l.photo && <img src={l.photo} alt={l.text.slice(0, 12)} />}
                    <div>
                      <time>{l.date}</time>
                      <p>{l.text}</p>
                    </div>
                    <button type="button" className="mini ghost" onClick={() => props.onRemoveLog(l.uid)}>
                      ✕
                    </button>
                  </article>
                ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
