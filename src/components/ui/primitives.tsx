import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/utils';
import { Icon, type IconName } from './Icon';

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconAfter,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, `btn-${size}`, loading && 'is-loading', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {icon && !loading ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}
      {children ? <span>{children}</span> : null}
      {iconAfter ? <Icon name={iconAfter} size={size === 'sm' ? 13 : 15} /> : null}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  tone?: 'default' | 'danger' | 'accent';
  active?: boolean;
  tooltip?: string;
}

export function IconButton({
  icon,
  label,
  size = 15,
  tone = 'default',
  active = false,
  tooltip,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'icon-btn',
        tone !== 'default' && `icon-btn-${tone}`,
        active && 'is-active',
        className,
      )}
      aria-label={label}
      title={tooltip ?? label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cx('field', className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
  trailing?: ReactNode;
}

export function TextInput({ icon, trailing, className, ...rest }: TextInputProps) {
  return (
    <span className={cx('text-input', className)}>
      {icon ? <Icon name={icon} size={14} className="text-input-icon" /> : null}
      <input {...rest} />
      {trailing}
    </span>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

export function Switch({ checked, onChange, label, id }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('switch', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  width = 520,
  footer,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button',
    );
    focusTarget?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        ref={panelRef}
      >
        <header className="modal-header">
          <div className="modal-heading">
            {icon ? (
              <span className="modal-icon">
                <Icon name={icon} size={16} />
              </span>
            ) : null}
            <div>
              <h2>{title}</h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}
