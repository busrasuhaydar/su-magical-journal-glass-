import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { errText } from '../lib/supabase';

// ── Bildirimler ────────────────────────────────────────
type Toast = { id: number; text: string; err?: boolean };
const ToastCtx = createContext<{ ok: (t: string) => void; fail: (e: unknown) => void }>({ ok: () => {}, fail: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, err?: boolean) => {
    const id = ++seq.current;
    setList((l) => [...l, { id, text, err }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), err ? 6000 : 3000);
  }, []);
  const value = useRef({ ok: (t: string) => push(t), fail: (e: unknown) => push(errText(e), true) }).current;
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Diyalog ────────────────────────────────────────────
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(860px,100%)' } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Sayfa içi onay (tarayıcı confirm() kullanılmaz). */
export function ConfirmButton({ label, confirmText, onConfirm, className = 'btn btn-ghost' }: { label: ReactNode; confirmText: string; onConfirm: () => void; className?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className={className} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="confirm">
      {confirmText}
      <button type="button" className="btn btn-danger btn-sm" onClick={() => { setAsk(false); onConfirm(); }}>Evet</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(false)}>Vazgeç</button>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span className="script">{title}</span>{children}</div>;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`;
}
