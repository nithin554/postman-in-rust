import { useRef, type KeyboardEvent } from 'react';
import { Code, type CodeLanguage } from '../../lib/highlight';
import { cx } from '../../lib/utils';

interface CodeEditorProps {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  minRows?: number;
}

/**
 * Editable code with syntax highlight — a transparent textarea layered over a
 * highlighted backdrop (the classic editor-overlay trick). Fonts, padding and
 * wrapping match exactly so the caret lines up with the colored text.
 */
export function CodeEditor({
  value,
  language,
  onChange,
  onKeyDown,
  placeholder,
  className,
  ariaLabel,
  minRows = 9,
}: CodeEditorProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncScroll = (input: HTMLTextAreaElement) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = input.scrollTop;
      backdropRef.current.scrollLeft = input.scrollLeft;
    }
  };

  return (
    <div className={cx('code-editor', className)}>
      <div ref={backdropRef} className="code-editor-backdrop" aria-hidden="true">
        <Code code={`${value}\n`} language={language} wrap />
      </div>
      <textarea
        className="code-editor-input"
        value={value}
        rows={minRows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(event) => syncScroll(event.currentTarget)}
      />
    </div>
  );
}
