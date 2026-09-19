import type { Carpet } from "../types";
import { isFrozen, progressOf } from "../types";

interface Props {
  carpets: Carpet[];
  selectedUid: string | null;
  dirtyUids: Set<string>;
  query: string;
  onSelect: (uid: string) => void;
}

/** 按产地筛选的档案列表 */
export default function CarpetList({ carpets, selectedUid, dirtyUids, query, onSelect }: Props) {
  return (
    <ul className="archive-list">
      {carpets.length === 0 && <li className="empty">没有符合筛选条件的档案。</li>}
      {carpets.map((c) => {
        const p = progressOf(c);
        const frozen = isFrozen(c);
        const q = query.trim();
        const hit =
          !q ||
          [c.code, c.origin, c.era, c.material, c.patternNote, ...c.damages.map((d) => d.name)]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase());
        if (!hit) return null;
        return (
          <li key={c.uid}>
            <button
              type="button"
              className={"archive-item" + (c.uid === selectedUid ? " active" : "")}
              onClick={() => onSelect(c.uid)}
            >
              <div className="archive-top">
                <b>{c.code || "未编号"}</b>
                {dirtyUids.has(c.uid) && <span className="pill dirty">未保存</span>}
                {frozen && <span className="pill freeze">迁移冻结</span>}
                {p.percent === 100 && <span className="pill done">完工</span>}
              </div>
              <p className="archive-meta">
                {c.origin || "产地未填"} · {c.era || "年代未填"} · {c.knotDensity || "结密度未填"}
              </p>
              <p className="archive-sub">
                {c.damages.length} 处破损 · {c.dyeType} · {c.material}
              </p>
              <div className="mini-progress" title={`${p.done}/${p.total} 道工序`}>
                <i style={{ width: `${p.percent}%` }} />
              </div>
              <small>
                工序 {p.done}/{p.total}
              </small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
