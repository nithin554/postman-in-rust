import { useMemo } from 'react';
import { HTTP_METHODS, type RequestSpec } from '../types';
import { useStore } from '../state/store';
import { buildUrlPreview } from '../lib/request';
import { environmentMap, resolveTemplate } from '../lib/variables';
import { cx, emptyRow, methodClass } from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';

interface RequestBarProps {
  onOpenSave: () => void;
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

export function RequestBar({ onOpenSave }: RequestBarProps) {
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
      <div className={cx('method-picker', methodClass(draft.method))}>
        <select
          value={draft.method}
          aria-label="HTTP method"
          onChange={(event) =>
            patch({ method: event.target.value as RequestSpec['method'] })
          }
        >
          {HTTP_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={11} className="method-picker-chevron" />
      </div>

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
      </div>
    </div>
  );
}
