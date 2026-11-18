import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { t } from "../i18n/es-AR";
import { Button, IconButton } from "./Button";
import { cx } from "./classes";

const MAX_TOASTS = 3;
const AUTO_CLOSE_MS = 4000;
const AUTO_CLOSE_WITH_ACTION_MS = 6000;

type ToastTone = "success" | "info" | "error";

type ToastInput = {
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
};

type ToastEntry = ToastInput & { id: number };

const toneStyle: Record<ToastTone, { icon: string; className: string }> = {
  success: { icon: "✓", className: "text-gain" },
  info: { icon: "i", className: "text-primary" },
  error: { icon: "✕", className: "text-loss" },
};

function autoCloseDelay({ tone, action }: ToastInput): number | null {
  if (tone === "error") return null;
  return action ? AUTO_CLOSE_WITH_ACTION_MS : AUTO_CLOSE_MS;
}

type ToastItemProps = {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [paused, setPaused] = useState(false);
  const delay = autoCloseDelay(toast);
  const { icon, className } = toneStyle[toast.tone];

  useEffect(() => {
    if (delay === null || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), delay);
    return () => clearTimeout(timer);
  }, [delay, paused, onDismiss, toast.id]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 rounded-lg border border-rule bg-surface-raised p-3 text-ink shadow-[0_16px_48px_rgb(21_32_43/0.2)]"
    >
      <span aria-hidden="true" className={cx("font-bold", className)}>
        {icon}
      </span>
      <p className="flex-1">{toast.message}</p>
      {toast.action && (
        <Button
          variant="ghost"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <IconButton
        aria-label={t("common.close")}
        onClick={() => onDismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </IconButton>
    </div>
  );
}

type ToastContextValue = { notify: (toast: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const entry = { ...input, id: nextId.current };
    setToasts((current) => [...current, entry].slice(-MAX_TOASTS));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={t("toast.region")}
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 md:inset-x-auto md:top-auto md:right-4 md:bottom-4 md:w-96"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
