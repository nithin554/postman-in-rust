import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/utils';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  indent?: number;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Themed dropdown that replaces native `<select>`. Renders through a portal so
 * it stacks above modals, with a check mark on the selected option.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((option) => option.value === value) ?? { value, label: value };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 180);
    const estimated = Math.min(options.length * 30 + 12, 280);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    const opensDown = rect.bottom + estimated < window.innerHeight - 16;
    const top = opensDown
      ? rect.bottom + 6
      : Math.max(rect.top - estimated - 6, 12);
    setAnchor({ left, top, width });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cx('select-field', open && 'is-open', disabled && 'is-disabled', className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
      >
        <span className="select-field-label">{selected.label}</span>
        <Icon name="chevron-down" size={12} className="select-field-chevron" />
      </button>

      {open && anchor
        ? createPortal(
            <>
              <div className="menu-scrim select-scrim" onMouseDown={() => setOpen(false)} />
              <div
                className="context-menu select-menu"
                style={{ left: anchor.left, top: anchor.top, minWidth: anchor.width }}
                role="menu"
              >
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    className={cx('context-item', option.value === value && 'is-active')}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="select-item-check">
                      {option.value === value ? <Icon name="check" size={12} /> : null}
                    </span>
                    <span
                      className="select-item-label"
                      style={option.indent ? { paddingLeft: 6 + option.indent * 14 } : undefined}
                    >
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
