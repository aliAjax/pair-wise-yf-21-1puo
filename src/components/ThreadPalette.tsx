import { useState } from "react";
import type { ThreadBatch } from "../types";

interface Props {
  threads: ThreadBatch[];
  remaining: Map<string, number>;
  onAdd: (batch: ThreadBatch) => void;
  onRemove: (id: string) => void;
  onMessage: (text: string, type?: "error" | "ok") => void;
}

/** 材料色卡：维护补线批次色号与库存剩余长度 */
export default function ThreadPalette({ threads, remaining, onAdd, onRemove, onMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", hex: "#9d2f21", dyeSource: "植物染", material: "羊毛手纺线", lengthM: 20 });

  const submit = () => {
    const id = form.id.trim().toUpperCase();
    if (!id) return onMessage("请填写补线色号", "error");
    if (threads.some((t) => t.id === id)) return onMessage(`色号 ${id} 已存在`, "error");
    if (!form.name.trim()) return onMessage("请填写色彩名", "error");
    if (!(form.lengthM > 0)) return onMessage("入库长度需大于 0", "error");
    onAdd({
      id,
      name: form.name.trim(),
      hex: form.hex,
      dyeSource: form.dyeSource,
      material: form.material,
      lengthM: Number(form.lengthM),
      createdAt: Date.now(),
    });
    setForm({ id: "", name: "", hex: form.hex, dyeSource: form.dyeSource, material: form.material, lengthM: 20 });
    setOpen(false);
    onMessage(`色号 ${id} 已入库`, "ok");
  };

  return (
    <section className="panel palette">
      <div className="heading">
        <div>
          <p>补线库存</p>
          <h2>材料色卡</h2>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "+ 新批次"}
        </button>
      </div>

      {open && (
        <div className="batch-form">
          <label>
            <span>色号</span>
            <input value={form.id} placeholder="TH-07" onChange={(e) => setForm({ ...form, id: e.target.value })} />
          </label>
          <label>
            <span>色彩名</span>
            <input value={form.name} placeholder="茜草绯红" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>色块</span>
            <input type="color" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} />
          </label>
          <label>
            <span>染色来源</span>
            <input value={form.dyeSource} onChange={(e) => setForm({ ...form, dyeSource: e.target.value })} />
          </label>
          <label>
            <span>线材质</span>
            <input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
          </label>
          <label>
            <span>入库长度（米）</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={form.lengthM}
              onChange={(e) => setForm({ ...form, lengthM: Number(e.target.value) })}
            />
          </label>
          <button type="button" className="primary" onClick={submit}>
            确认入库
          </button>
        </div>
      )}

      <ul className="thread-list">
        {threads.map((t) => {
          const left = remaining.get(t.id) ?? t.lengthM;
          const danger = left <= 0;
          const warn = !danger && left < 5;
          return (
            <li key={t.id} className="thread-item">
              <span className="swatch" style={{ background: t.hex }} title={t.hex} />
              <div className="thread-meta">
                <b>
                  {t.id} · {t.name}
                </b>
                <small>
                  {t.dyeSource} · {t.material}
                </small>
              </div>
              <div className={"thread-stock" + (danger ? " out" : warn ? " low" : "")}>
                <strong>{left.toFixed(1)} 米</strong>
                <small>余 / 共 {t.lengthM} 米</small>
              </div>
              <button
                type="button"
                className="mini ghost"
                title="删除批次"
                onClick={() => {
                  if (left < t.lengthM - 1e-9) {
                    onMessage(`色号 ${t.id} 已被破损占用，不能删除；请先解绑对应破损`, "error");
                    return;
                  }
                  onRemove(t.id);
                  onMessage(`色号 ${t.id} 已移除`, "ok");
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
        {threads.length === 0 && <li className="empty">色卡为空，请先新建补线批次。</li>}
      </ul>
    </section>
  );
}
