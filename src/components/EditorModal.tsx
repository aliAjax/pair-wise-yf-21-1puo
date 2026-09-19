import { useMemo, useRef, useState } from "react";
import type { Carpet, CarpetDraft, Damage, Marker, Store } from "../types";
import { ORIGINS, threadById, uid, usageByCarpet } from "../storage";
import { fileToDataUrl } from "../imageUtil";
import { Modal } from "./ui";
import { CompareSlider } from "./CompareSlider";
import { StepsPanel, type StepAction } from "./StepsPanel";

type Tab = "info" | "damage" | "marker" | "record" | "steps";

function emptyDraft(code: string): CarpetDraft {
  return {
    code,
    name: "",
    origin: "",
    era: "",
    knotDensity: "",
    material: "",
    dye: "",
    note: "",
    damages: [],
    markers: [],
    markerImage: null,
    beforeImg: null,
    afterImg: null,
    recordDate: "",
    recordNote: "",
  };
}

export function EditorModal({
  store,
  carpet,
  nextCode,
  onClose,
  onSave,
  onStep,
}: {
  store: Store;
  carpet: Carpet | null;
  nextCode: string;
  onClose: () => void;
  onSave: (draft: CarpetDraft) => string | null; // 返回 null 成功，否则错误信息
  onStep: (carpetId: string, action: StepAction) => string | null;
}) {
  const [tab, setTab] = useState<Tab>("info");
  const [draft, setDraft] = useState<CarpetDraft>(
    carpet
      ? {
          code: carpet.code,
          name: carpet.name,
          origin: carpet.origin,
          era: carpet.era,
          knotDensity: carpet.knotDensity,
          material: carpet.material,
          dye: carpet.dye,
          note: carpet.note ?? "",
          damages: carpet.damages.map((d) => ({ ...d })),
          markers: carpet.markers.map((m) => ({ ...m })),
          markerImage: carpet.markerImage,
          beforeImg: carpet.beforeImg,
          afterImg: carpet.afterImg,
          recordDate: carpet.recordDate ?? "",
          recordNote: carpet.recordNote ?? "",
        }
      : emptyDraft(nextCode)
  );
  const [err, setErr] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  const isNew = !carpet;

  // 编辑既有档案时，其自身已提交占用不计入“可用余量”
  const others = useMemo(
    () => store.carpets.filter((c) => c.id !== carpet?.id),
    [store.carpets, carpet?.id]
  );

  const usedByOthers = (threadId: string) =>
    others.reduce((s, c) => s + usageByCarpet(c, threadId), 0);

  // 本草稿对各批次的计划用量
  const plannedByThread = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of draft.damages) {
      if (d.threadId) m.set(d.threadId, (m.get(d.threadId) ?? 0) + (Number(d.length) || 0));
    }
    return m;
  }, [draft.damages]);

  const patch = (p: Partial<CarpetDraft>) => setDraft((d) => ({ ...d, ...p }));

  const updateDamage = (id: string, p: Partial<Damage>) =>
    setDraft((d) => ({ ...d, damages: d.damages.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const addDamage = () =>
    setDraft((d) => ({
      ...d,
      damages: [
        ...d.damages,
        { id: uid("d"), area: "", severity: "中等", threadId: null, length: 0, note: "" },
      ],
    }));

  const removeDamage = (id: string) =>
    setDraft((d) => ({
      ...d,
      damages: d.damages.filter((x) => x.id !== id),
      markers: d.markers.map((m) => (m.damageId === id ? { ...m, damageId: null } : m)),
    }));

  const onMarkerImageClick = (e: React.MouseEvent) => {
    if (!placeMode || !imgWrapRef.current) return;
    const r = imgWrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const mk: Marker = { id: uid("m"), x, y, damageId: null, note: "" };
    setDraft((d) => ({ ...d, markers: [...d.markers, mk] }));
    setPlaceMode(false);
  };

  const updateMarker = (id: string, p: Partial<Marker>) =>
    setDraft((d) => ({ ...d, markers: d.markers.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const upload = async (file: File | undefined, key: "markerImage" | "beforeImg" | "afterImg") => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      patch({ [key]: url } as Partial<CarpetDraft>);
    } catch {
      setErr("图片读取失败，请更换图片");
    }
  };

  const doSave = () => {
    setErr(null);
    if (!draft.code.trim()) return setErr("请填写档案编号");
    if (!draft.name.trim()) return setErr("请填写藏品名称");
    if (!draft.origin) return setErr("请选择产地");
    // 破损行校验：区域必填；绑了色号就必须填正数长度
    for (const d of draft.damages) {
      if (!d.area.trim()) return setErr(`存在未填写破损区域的记录，请补全或删除`);
      if (d.threadId && (!(Number(d.length) > 0)))
        return setErr(`破损「${d.area}」已绑定补线色号，请填写用线长度`);
    }
    // 整单扣减校验（事务式）：逐批次检查，超量整次失败
    for (const [tid, need] of plannedByThread) {
      const t = threadById(store, tid);
      if (!t) return setErr("补线批次已不存在，请重新选择");
      const avail = t.totalLen - usedByOthers(tid);
      if (need > avail + 1e-9) {
        return setErr(
          `整单保存失败：色号 ${t.code}「${t.name}」本单计划 ${need} 米，` +
            `可用余量仅 ${Math.max(0, Math.round(avail * 100) / 100)} 米（整卷 ${t.totalLen} 米）。` +
            `已取消本次保存，工序状态未做任何改动。`
        );
      }
    }
    // 清理：清除指向已删除破损的标记关联；空字符串归整
    const clean: CarpetDraft = {
      ...draft,
      code: draft.code.trim(),
      name: draft.name.trim(),
      damages: draft.damages.map((d) => ({ ...d, note: d.note ?? "" })),
      markers: draft.markers.map((m) =>
        draft.damages.some((d) => d.id === m.damageId) ? m : { ...m, damageId: null }
      ),
    };
    const saveErr = onSave(clean);
    if (saveErr) setErr(saveErr);
  };

  const tabs: [Tab, string][] = [
    ["info", "基础信息"],
    ["damage", `破损与补线${draft.damages.length ? `（${draft.damages.length}）` : ""}`],
    ["marker", "局部标记图"],
    ["record", "前后记录"],
    ...(isNew ? [] : ([["steps", "修复工序"]] as [Tab, string][])),
  ];

  return (
    <Modal
      wide
      title={isNew ? "新建档案" : `编辑档案 · ${carpet!.code}`}
      subtitle={isNew ? "保存后即可在「修复工序」中推进工序" : carpet!.name}
      onClose={onClose}
    >
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {err && <div className="inline-alert">{err}</div>}

      {tab === "info" && (
        <div className="tab-pane">
          <div className="field-grid">
            <label>
              <span>档案编号 *</span>
              <input value={draft.code} onChange={(e) => patch({ code: e.target.value })} placeholder="如 CAR-142" />
            </label>
            <label>
              <span>藏品名称 *</span>
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="如 石榴纹祈祷毯" />
            </label>
            <label>
              <span>产地 *</span>
              <select value={draft.origin} onChange={(e) => patch({ origin: e.target.value })}>
                <option value="">请选择产地</option>
                {ORIGINS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              <span>年代</span>
              <input value={draft.era} onChange={(e) => patch({ era: e.target.value })} placeholder="如 约1960年代" />
            </label>
            <label>
              <span>结密度</span>
              <input value={draft.knotDensity} onChange={(e) => patch({ knotDensity: e.target.value })} placeholder="如 36 结/平方英寸" />
            </label>
            <label>
              <span>材质</span>
              <input value={draft.material} onChange={(e) => patch({ material: e.target.value })} placeholder="如 羊毛经棉纬" />
            </label>
            <label>
              <span>染色类型</span>
              <input value={draft.dye} onChange={(e) => patch({ dye: e.target.value })} placeholder="如 植物染 / 矿物染" />
            </label>
            <label className="span-2">
              <span>备注</span>
              <textarea rows={2} value={draft.note} onChange={(e) => patch({ note: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      {tab === "damage" && (
        <div className="tab-pane">
          <p className="hint">
            每处破损只能绑定 <b>一种</b> 补线色号；多处破损共用同一批次时按本单合计长度
            <b> 整单扣减</b>，任一色号余量不足则整次保存失败。
          </p>
          {draft.damages.length === 0 && <div className="empty small">尚无破损记录，点击下方按钮新增</div>}
          <div className="damage-list">
            {draft.damages.map((d, i) => {
              const t = threadById(store, d.threadId);
              const avail = t ? t.totalLen - usedByOthers(t.id) : 0;
              return (
                <div className="damage-row" key={d.id}>
                  <div className="damage-head">
                    <b>破损 {i + 1}</b>
                    <button className="link-danger" onClick={() => removeDamage(d.id)}>删除</button>
                  </div>
                  <div className="damage-fields">
                    <label>
                      <span>破损区域 *</span>
                      <input value={d.area} onChange={(e) => updateDamage(d.id, { area: e.target.value })} placeholder="如 左侧毯边" />
                    </label>
                    <label>
                      <span>破损程度</span>
                      <select value={d.severity} onChange={(e) => updateDamage(d.id, { severity: e.target.value as Damage["severity"] })}>
                        <option value="轻微">轻微</option>
                        <option value="中等">中等</option>
                        <option value="严重">严重</option>
                      </select>
                    </label>
                    <label className="thread-cell">
                      <span>补线色号（仅一种）</span>
                      <select value={d.threadId ?? ""} onChange={(e) => updateDamage(d.id, { threadId: e.target.value || null })}>
                        <option value="">暂不绑定</option>
                        {store.threads.map((th) => {
                          const a = th.totalLen - usedByOthers(th.id);
                          return (
                            <option key={th.id} value={th.id} disabled={a <= 0.0001}>
                              {th.code} · {th.name}（余 {Math.round(a * 100) / 100}m）
                            </option>
                          );
                        })}
                      </select>
                      {t && (
                        <small className="thread-meta">
                          <i style={{ background: t.color }} />
                          {t.code} · 整卷 {t.totalLen}m · 本档案可用 {Math.round(avail * 100) / 100}m
                        </small>
                      )}
                    </label>
                    <label className="len-cell">
                      <span>用线长度（米）</span>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={d.length || ""}
                        onChange={(e) => updateDamage(d.id, { length: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </label>
                    <label className="span-2">
                      <span>破损说明</span>
                      <input value={d.note} onChange={(e) => updateDamage(d.id, { note: e.target.value })} placeholder="如 磨毛断纬" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-ghost" onClick={addDamage}>＋ 新增破损区域</button>

          {plannedByThread.size > 0 && (
            <div className="subtotal">
              <h4>本单整单扣减预算</h4>
              {[...plannedByThread.entries()].map(([tid, need]) => {
                const t = threadById(store, tid)!;
                const avail = t.totalLen - usedByOthers(tid);
                const over = need > avail + 1e-9;
                return (
                  <div key={tid} className={over ? "sub-row over" : "sub-row"}>
                    <i style={{ background: t.color }} />
                    <span>{t.code} · {t.name}</span>
                    <b>{Math.round(need * 100) / 100}m</b>
                    <em>/ 可用 {Math.round(Math.max(0, avail) * 100) / 100}m</em>
                    {over && <strong className="over-tag">超量 · 将导致整单失败</strong>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "marker" && (
        <div className="tab-pane">
          <div className="upload-row">
            <label className="file-btn">
              上传局部标记图
              <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "markerImage")} />
            </label>
            {draft.markerImage && (
              <>
                <button className={placeMode ? "btn-warn" : "btn-ghost"} onClick={() => setPlaceMode((v) => !v)}>
                  {placeMode ? "点击图片放置标记…" : "＋ 添加标记点"}
                </button>
                <button className="link-danger" onClick={() => patch({ markerImage: null, markers: [] })}>
                  移除图片
                </button>
              </>
            )}
          </div>
          {draft.markerImage ? (
            <>
              <div className={placeMode ? "marker-canvas placing" : "marker-canvas"} ref={imgWrapRef} onClick={onMarkerImageClick}>
                <img src={draft.markerImage} alt="局部标记图" />
                {draft.markers.map((m, i) => (
                  <span key={m.id} className="marker-pin" data-n={i + 1} style={{ left: `${m.x}%`, top: `${m.y}%` }} title={m.note || `标记 ${i + 1}`} />
                ))}
              </div>
              {draft.markers.length > 0 && (
                <div className="marker-list">
                  {draft.markers.map((m, i) => (
                    <div className="marker-row" key={m.id}>
                      <b>{i + 1}</b>
                      <select value={m.damageId ?? ""} onChange={(e) => updateMarker(m.id, { damageId: e.target.value || null })}>
                        <option value="">未关联破损</option>
                        {draft.damages.map((d, di) => (
                          <option key={d.id} value={d.id}>破损 {di + 1}：{d.area || "未命名区域"}</option>
                        ))}
                      </select>
                      <input value={m.note ?? ""} onChange={(e) => updateMarker(m.id, { note: e.target.value })} placeholder="标记说明" />
                      <button className="link-danger" onClick={() => setDraft((d) => ({ ...d, markers: d.markers.filter((x) => x.id !== m.id) }))}>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty small">尚未上传局部标记图</div>
          )}
        </div>
      )}

      {tab === "record" && (
        <div className="tab-pane">
          <div className="record-uploads">
            <div>
              <h4>修复前</h4>
              <div className="img-slot">
                {draft.beforeImg ? <img src={draft.beforeImg} alt="修复前" /> : <span>未上传</span>}
              </div>
              <div className="upload-row">
                <label className="file-btn">选择图片<input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "beforeImg")} /></label>
                {draft.beforeImg && <button className="link-danger" onClick={() => patch({ beforeImg: null })}>清除</button>}
              </div>
            </div>
            <div>
              <h4>修复后</h4>
              <div className="img-slot">
                {draft.afterImg ? <img src={draft.afterImg} alt="修复后" /> : <span>未上传</span>}
              </div>
              <div className="upload-row">
                <label className="file-btn">选择图片<input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "afterImg")} /></label>
                {draft.afterImg && <button className="link-danger" onClick={() => patch({ afterImg: null })}>清除</button>}
              </div>
            </div>
          </div>

          {draft.beforeImg && draft.afterImg && (
            <div className="cmp-block">
              <h4>前后对比（拖动滑块）</h4>
              <CompareSlider before={draft.beforeImg} after={draft.afterImg} />
            </div>
          )}

          <div className="field-grid">
            <label>
              <span>记录日期</span>
              <input type="date" value={draft.recordDate} onChange={(e) => patch({ recordDate: e.target.value })} />
            </label>
            <label>
              <span>记录说明</span>
              <input value={draft.recordNote} onChange={(e) => patch({ recordNote: e.target.value })} placeholder="如 织补完成后复检" />
            </label>
          </div>
        </div>
      )}

      {tab === "steps" && carpet && (
        <StepsPanel store={store} carpet={carpet} onAction={onStep} />
      )}
      {tab === "steps" && isNew && <div className="empty">请先保存档案</div>}

      <footer className="modal-foot">
        <span className="foot-hint">{tab === "steps" ? "工序操作即时生效并同步全部视图" : "保存将事务式校验补线余量"}</span>
        <div className="foot-actions">
          <button onClick={onClose}>取消</button>
          {tab !== "steps" && <button className="primary" onClick={doSave}>保存档案</button>}
        </div>
      </footer>
    </Modal>
  );
}
