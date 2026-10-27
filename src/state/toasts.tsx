import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { uid } from '../lib/utils';
import { Icon } from '../components/ui/Icon';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  title: string;
  tone?: ToastTone;
  description?: string;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON = {
  success: 'check',
  error: 'alert',
  info: 'info',
  warning: 'alert',
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const item: ToastItem = {
        ...toast,
        id: uid(),
        tone: toast.tone ?? 'info',
      };
      setToasts((current) => [...current.slice(-3), item]);
      const duration =
        toast.duration ?? (item.tone === 'error' ? 6000 : 3600);
      const timer = window.setTimeout(() => dismiss(item.id), duration);
      timers.current.set(item.id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-icon">
              <Icon name={TONE_ICON[toast.tone]} size={16} />
            </span>
            <div className="toast-copy">
              <div className="toast-title">{toast.title}</div>
              {toast.description ? (
                <div className="toast-description">{toast.description}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const fallback: ToastContextValue = {
  notify: () => undefined,
  dismiss: () => undefined,
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? fallback;
}
