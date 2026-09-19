import { useRef, useState } from "react";

/** 修复前后对比滑块：左为修复前，右为修复后（clip-path 保证两图严格对齐） */
export function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      className="compare"
      ref={ref}
      onMouseDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <img className="cmp-img cmp-after" src={after} alt="修复后" />
      <img
        className="cmp-img cmp-before"
        src={before}
        alt="修复前"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <span className="cmp-tag cmp-tag-l">修复前</span>
      <span className="cmp-tag cmp-tag-r">修复后</span>
      <div className="cmp-handle" style={{ left: `${pos}%` }}>
        <span>⇔</span>
      </div>
    </div>
  );
}
