import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DamageArea, ThreadBatch } from "../types";

interface Props {
  damages: DamageArea[];
  threads: ThreadBatch[];
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onMove: (uid: string, x: number, y: number) => void;
}

/** 纹样局部标记图：破损位置以补线色号颜色标注，可拖拽或点击空白处移动当前选中点 */
export default function MarkerMap({ damages, threads, selectedUid, onSelect, onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragUid, setDragUid] = useState<string | null>(null);

  const threadOf = (d: DamageArea) => threads.find((t) => t.id === d.threadId) ?? null;

  const toPercent = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(97, Math.max(3, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragUid) return;
    const { x, y } = toPercent(e.clientX, e.clientY);
    onMove(dragUid, x, y);
  };

  return (
    <div className="map-wrap">
      <div
        ref={ref}
        className={"rug-map" + (selectedUid ? " placing" : "")}
        onPointerMove={handleMove}
        onPointerUp={() => setDragUid(null)}
        onPointerLeave={() => setDragUid(null)}
        onPointerDown={(e) => {
          // 点击毯图：把当前选中的破损标记移到点击位置（标记按钮会 stopPropagation）
          if (selectedUid) {
            const { x, y } = toPercent(e.clientX, e.clientY);
            onMove(selectedUid, x, y);
            setDragUid(selectedUid);
          }
        }}
      >
        <svg viewBox="0 0 1000 680" preserveAspectRatio="none" className="rug-svg">
          <rect x="14" y="14" width="972" height="652" rx="26" fill="#8a5a2b" />
          <rect x="34" y="34" width="932" height="612" rx="18" fill="#7c2d12" />
          <rect x="52" y="52" width="896" height="576" rx="12" fill="#f3e7d0" />
          <rect x="76" y="76" width="848" height="528" rx="6" fill="#e9d6b2" />
          {/* 中心徽章纹 */}
          <ellipse cx="500" cy="340" rx="150" ry="105" fill="#7c2d12" opacity="0.9" />
          <ellipse cx="500" cy="340" rx="104" ry="70" fill="#0f766e" opacity="0.85" />
          <ellipse cx="500" cy="340" rx="52" ry="34" fill="#c8862d" opacity="0.9" />
          {/* 四角纹样 */}
          {[
            [150, 150],
            [850, 150],
            [150, 530],
            [850, 530],
          ].map(([cx, cy], i) => (
            <g key={i} opacity="0.55">
              <path d={`M${cx - 60} ${cy} Q ${cx} ${cy - 60} ${cx + 60} ${cy} Q ${cx} ${cy + 60} ${cx - 60} ${cy} Z`} fill="#0f766e" />
              <circle cx={cx} cy={cy} r="14" fill="#9d2f21" />
            </g>
          ))}
          {/* 点状边饰 */}
          {Array.from({ length: 22 }, (_, i) => i).map((i) => (
            <g key={i} opacity="0.5">
              <circle cx={110 + i * 37} cy={66} r="4" fill="#6b4a2b" />
              <circle cx={110 + i * 37} cy={614} r="4" fill="#6b4a2b" />
            </g>
          ))}
        </svg>

        {damages.map((d, i) => {
          const t = threadOf(d);
          const active = d.uid === selectedUid;
          return (
            <button
              key={d.uid}
              type="button"
              className={"marker" + (active ? " active" : "") + (!t ? " unbound" : "")}
              style={{ left: `${d.x}%`, top: `${d.y}%`, background: t?.hex ?? "#cbd5e1" }}
              title={d.name || `破损 ${i + 1}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(d.uid);
                setDragUid(d.uid);
              }}
            >
              {i + 1}
            </button>
          );
        })}

        {damages.length === 0 && <div className="map-empty">尚未登记破损区域</div>}
      </div>
      <p className="map-hint">
        点击右侧破损条目后，可在毯图上拖拽标记，或点击毯图空白处重新定点；标记颜色对应该处绑定的补线色号。
      </p>
    </div>
  );
}
