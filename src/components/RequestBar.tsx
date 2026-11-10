import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HTTP_METHODS, type RequestSpec } from '../types';
import { useStore } from '../state/store';
import { buildUrlPreview } from '../lib/request';
import { parseCurl } from '../lib/curl';
import { environmentMap, resolveTemplate } from '../lib/variables';
import { cx, emptyRow, methodClass } from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';

interface RequestBarProps {
  onOpenSave: () => void;
  codeOpen: boolean;
  onToggleCode: () => void;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function absorbQuery(
  raw: string,
  existing: RequestSpec['params'],
): { url: string; params: RequestSpec['params'] } | null {
  const hashIndex = raw.indexOf('#');
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = base.indexOf('?');
  if (queryIndex < 0) return null;
  const query = base.slice(queryIndex + 1);
  if (!query.includes('=')) return null;

  const extracted = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const equals = pair.indexOf('=');
      const key = equals >= 0 ? pair.slice(0, equals) : pair;
      const value = equals >= 0 ? pair.slice(equals + 1) : '';
      return emptyRow({ key: decodeSafe(key), value: decodeSafe(value) });
    });

  return {
    url: base.slice(0, queryIndex) + fragment,
    params: [...existing.filter((row) => row.key.trim()), ...extracted],
  };
}

export function MethodPicker({
  value,
  onChange,
}: {
  value: RequestSpec['method'];
  onChange: (method: RequestSpec['method']) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_WIDTH = 156;
    const left = Math.max(
      16,
      Math.min(rect.left, window.innerWidth - MENU_WIDTH - 16),
    );
    setAnchor({ left, top: rect.bottom + 10 });
    setOpen(true);
  };

  return (
    <>
      <div
        ref={buttonRef}
        className={cx('method-picker', methodClass(value))}
        role="button"
        tabIndex={0}
        aria-label="HTTP method"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <span className="method-picker-label">{value}</span>
        <Icon name="chevron-down" size={11} className="method-picker-chevron" />
      </div>

      {open && anchor
        ? createPortal(
            <>
              <div className="menu-scrim" onMouseDown={() => setOpen(false)} />
              <div
                className="context-menu method-menu"
                style={{ left: anchor.left, top: anchor.top }}
                role="menu"
              >
                {HTTP_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    role="menuitem"
                    className={cx(
                      'context-item method-menu-item',
                      method === value && 'is-active',
                    )}
                    onClick={() => {
                      onChange(method);
                      setOpen(false);
                    }}
                  >
                    <span className={cx('method-menu-tag', `method-${method.toLowerCase()}`)}>
                      {method}
                    </span>
                    {method === value ? <Icon name="check" size={13} /> : null}
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

export function RequestBar({ onOpenSave, codeOpen, onToggleCode }: RequestBarProps) {
  const { actions, activeTab, activeEnvironment } = useStore();

  const missing = useMemo(() => {
    if (!activeTab) return [] as string[];
    const variables = environmentMap(activeEnvironment);
    const names = new Set<string>();
    resolveTemplate(activeTab.draft.url, variables).missing.forEach((name) =>
      names.add(name),
    );
    activeTab.draft.params.forEach((param) => {
      if (!param.enabled) return;
      resolveTemplate(param.key, variables).missing.forEach((name) => names.add(name));
      resolveTemplate(param.value, variables).missing.forEach((name) => names.add(name));
    });
    return Array.from(names);
  }, [activeTab, activeEnvironment]);

  if (!activeTab) {
    return (
      <div className="request-bar request-bar-empty">
        <span className="muted small">No request open — create one with Ctrl+N.</span>
      </div>
    );
  }

  const draft = activeTab.draft;
  const patch = (change: Partial<RequestSpec>) =>
    actions.patchDraft(activeTab.id, change);

  const preview = buildUrlPreview(draft.url, draft.params, activeEnvironment);
  const enabledParams = draft.params.filter(
    (param) => param.enabled && param.key.trim(),
  ).length;

  const send = () => {
    if (activeTab.sending) return;
    void actions.sendTab(activeTab.id);
  };

  return (
    <div className="request-bar">
      <MethodPicker
        value={draft.method}
        onChange={(method) => patch({ method })}
      />

      <div className="url-field">
        <input
          id="request-url"
          className="url-input"
          value={draft.url}
          placeholder="https://api.example.com/v1/items — paste a URL or use {{baseUrl}}"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => patch({ url: event.target.value })}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            if (/^curl(\s|$)/i.test(pasted.trim())) {
              const parsed = parseCurl(pasted);
              if (parsed) {
                event.preventDefault();
                const basicAuth = parsed.auth.type === 'basic' ? parsed.auth : undefined;
                patch({
                  method: HTTP_METHODS.includes(parsed.method as (typeof HTTP_METHODS)[number])
                    ? (parsed.method as RequestSpec['method'])
                    : 'GET',
                  url: parsed.url,
                  params: parsed.params,
                  headers: basicAuth
                    ? parsed.headers.filter((header) => header.key.toLowerCase() !== 'authorization')
                    : parsed.headers,
                  bodyMode: parsed.bodyMode,
                  body: parsed.body,
                  formFields: parsed.formFields,
                  auth: basicAuth
                    ? { ...draft.auth, type: 'basic', username: basicAuth.username ?? '', password: basicAuth.password ?? '' }
                    : draft.auth,
                });
                return;
              }
            }
            if (!pasted.includes('?')) return;
            const input = event.currentTarget;
            const start = input.selectionStart ?? draft.url.length;
            const end = input.selectionEnd ?? draft.url.length;
            const combined = draft.url.slice(0, start) + pasted + draft.url.slice(end);
            const absorbed = absorbQuery(combined, draft.params);
            if (!absorbed) return;
            event.preventDefault();
            patch(absorbed);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="url-meta">
          <span className="url-preview" title={preview || undefined}>
            {preview || 'Resolved URL will appear here'}
          </span>
          {enabledParams > 0 ? (
            <span className="url-chip">
              {enabledParams} param{enabledParams === 1 ? '' : 's'}
            </span>
          ) : null}
          {missing.length > 0 ? (
            <span
              className="url-chip is-warning"
              title={`Unresolved variables: ${missing.join(', ')}`}
            >
              <Icon name="alert" size={11} />
              {missing.join(', ')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="request-bar-actions">
        {activeTab.sending ? (
          <Button
            variant="danger"
            icon="close"
            onClick={() => void actions.cancelTab(activeTab.id)}
          >
            Cancel
          </Button>
        ) : (
          <Button variant="primary" icon="send" onClick={send}>
            Send
          </Button>
        )}
        <IconButton
          icon="save"
          label="Save request (Ctrl+S)"
          active={activeTab.dirty}
          onClick={onOpenSave}
        />
        <IconButton
          icon="code"
          label="Code snippets"
          active={codeOpen}
          onClick={onToggleCode}
        />
      </div>
    </div>
  );
}
