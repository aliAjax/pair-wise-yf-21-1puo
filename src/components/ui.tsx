import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "modal modal-wide" : "modal"}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ text, tone }: { text: string; tone: "ok" | "err" | "info" }) {
  return <div className={`toast toast-${tone}`}>{text}</div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
