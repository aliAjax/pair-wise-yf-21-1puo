import { useState } from "react";
import type { Store, ThreadBatch } from "../types";
import { threadRemain, threadUsed, uid, usageByCarpet } from "../storage";
import { Modal, Empty } from "./ui";

export function ThreadModal({
  store,
  onClose,
  onAdd,
  onDelete,
}: {
  store: Store;
  onClose: () => void;
  onAdd: (t: Omit<ThreadBatch, "id" | "createdAt">) => string | null;
  onDelete: (id: string) => string | null;
}) {
  const [form, setForm] = useState({ code: "", name: "", color: "#8c2f1d", source: "", totalLen: "" });
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (!form.code.trim()) return setErr("请填写色号");
    if (!form.name.trim()) return setErr("请填写颜色名");
    const len = Number(form.totalLen);
    if (!(len > 0)) return setErr("请填写正的整卷长度（米）");
    if (store.threads.some((t) => t.code === form.code.trim()))
      return setErr("色号已存在，请勿重复建档");
    const e = onAdd({ code: form.code.trim(), name: form.name.trim(), color: form.color, source: form.source.trim(), totalLen: len });
    if (e) return setErr(e);
    setForm({ code: "", name: "", color: "#8c2f1d", source: "", totalLen: "" });
  };

  return (
    <Modal wide title="材料色卡 · 补线批次" subtitle="同一色号按批次管理整卷长度；被档案占用的批次不可删除" onClose={onClose}>
      {err && <div className="inline-alert">{err}</div>}

      <div className="thread-grid">
        {store.threads.length === 0 && <Empty text="尚无补线批次" />}
        {store.threads.map((t) => {
          const used = threadUsed(store, t.id);
          const remain = threadRemain(store, t.id);
          const low = remain < 10;
          const usedBy = store.carpets.filter((c) => c.damages.some((d) => d.threadId === t.id));
          return (
            <div className="thread-card" key={t.id}>
              <div className="thread-swatch" style={{ background: t.color }} />
              <div className="thread-info">
                <h3>{t.code} · {t.name}</h3>
                <p>{t.source || "—"}</p>
                <div className="thread-len">
                  <div className="len-bar">
                    <div className={low ? "len-fill low" : "len-fill"} style={{ width: `${Math.min(100, (remain / t.totalLen) * 100)}%` }} />
                  </div>
                  <small>
                    整卷 {t.totalLen}m · 已占 {Math.round(used * 100) / 100}m ·{" "}
                    <b className={low ? "low-text" : ""}>余 {Math.round(remain * 100) / 100}m</b>
                    {low && <span className="low-tag">余量紧张</span>}
                  </small>
                </div>
                <small className="used-by">
                  用于：{usedBy.length ? usedBy.map((c) => `${c.code}（${usageByCarpet(c, t.id)}m）`).join("、") : "暂无档案"}
                </small>
              </div>
              <button
                className="link-danger"
                title={usedBy.length ? "已被档案占用，不可删除" : "删除批次"}
                disabled={usedBy.length > 0}
                onClick={() => {
                  const e = onDelete(t.id);
                  if (e) setErr(e);
                }}
              >
                删除
              </button>
            </div>
          );
        })}
      </div>

      <h3 className="subhead">新增补线批次</h3>
      <div className="thread-form">
        <label>
          <span>色号 *</span>
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如 CR-205" />
        </label>
        <label>
          <span>颜色名 *</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 赭红" />
        </label>
        <label className="color-label">
          <span>色值</span>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </label>
        <label>
          <span>整卷长度（米）*</span>
          <input type="number" min={0} step="0.5" value={form.totalLen} onChange={(e) => setForm({ ...form, totalLen: e.target.value })} placeholder="如 100" />
        </label>
        <label className="span-2">
          <span>来源 / 材质</span>
          <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="如 羊毛 · 植物染" />
        </label>
        <button className="primary" onClick={submit}>＋ 入库批次</button>
      </div>
    </Modal>
  );
}
