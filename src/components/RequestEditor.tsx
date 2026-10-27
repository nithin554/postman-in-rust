import { useMemo, useState } from 'react';
import {
  DEFAULT_AUTH,
  type AuthConfig,
  type AuthType,
  type BodyMode,
  type KeyValue,
  type RequestSpec,
} from '../types';
import { useStore } from '../state/store';
import { useToast } from '../state/toasts';
import { buildUrlPreview, prepareRequest } from '../lib/request';
import { buildSnippet, SNIPPET_LANGUAGES, type SnippetLanguage } from '../lib/snippet';
import { Code } from '../lib/highlight';
import { copyText, cx, formatBytes, prettyJson, uid } from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';
import { KeyValueRows } from './ui/KeyValueRows';

type EditorTab = 'params' | 'headers' | 'body' | 'auth' | 'code';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'code', label: 'Code' },
];

const BODY_MODES: { id: BodyMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: 'urlencoded', label: 'Form URL-encoded' },
  { id: 'formdata', label: 'Form data' },
];

const AUTH_TYPES: { id: AuthType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'bearer', label: 'Bearer token' },
  { id: 'basic', label: 'Basic auth' },
  { id: 'apikey', label: 'API key' },
];

const HEADER_SUGGESTIONS: { key: string; value: string; label: string }[] = [
  { key: 'Content-Type', value: 'application/json', label: 'JSON content type' },
  { key: 'Accept', value: 'application/json', label: 'Accept JSON' },
  { key: 'Cache-Control', value: 'no-cache', label: 'No cache' },
];

function countEnabled(rows: KeyValue[]): number {
  return rows.filter((row) => row.enabled && row.key.trim()).length;
}

export function RequestEditor() {
  const { state, actions, activeTab, activeEnvironment } = useStore();
  const { notify } = useToast();
  const [tab, setTab] = useState<EditorTab>('params');
  const [language, setLanguage] = useState<SnippetLanguage>('curl');
  const [revealToken, setRevealToken] = useState(false);

  const draft = activeTab?.draft;
  const auth = draft?.auth ?? DEFAULT_AUTH;

  const snippet = useMemo(() => {
    if (!draft) return '';
    const prepared = prepareRequest(draft, activeEnvironment, state.settings, 'snippet');
    return buildSnippet(language, prepared);
  }, [draft, activeEnvironment, state.settings, language]);

  if (!activeTab || !draft) {
    return (
      <section className="editor">
        <div className="editor-empty">
          <Icon name="send" size={26} />
          <h3>No request open</h3>
          <p>Create a new request or pick one from your collections.</p>
          <Button variant="primary" icon="plus" onClick={() => actions.newRequestTab()}>
            New request
          </Button>
        </div>
      </section>
    );
  }

  const patch = (change: Partial<RequestSpec>) =>
    actions.patchDraft(activeTab.id, change);
  const patchAuth = (change: Partial<AuthConfig>) =>
    patch({ auth: { ...auth, ...change } });

  const paramsCount = countEnabled(draft.params);
  const headersCount = countEnabled(draft.headers);
  const bodySize = new TextEncoder().encode(draft.body).length;
  const urlPreview = buildUrlPreview(draft.url, draft.params, activeEnvironment);

  const jsonError = (() => {
    if (draft.bodyMode !== 'json' || !draft.body.trim()) return null;
    try {
      JSON.parse(draft.body);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid JSON';
    }
  })();

  const addHeader = (key: string, value: string) => {
    if (draft.headers.some((header) => header.key.toLowerCase() === key.toLowerCase())) {
      notify({ title: `${key} already present`, tone: 'info' });
      return;
    }
    patch({
      headers: [
        ...draft.headers.filter((header) => header.key.trim() || header.value.trim()),
        { id: uid(), key, value, enabled: true },
      ],
    });
  };

  const formatJson = () => {
    const formatted = prettyJson(draft.body);
    if (formatted === null) {
      notify({ title: 'Body is not valid JSON', tone: 'error' });
      return;
    }
    patch({ body: formatted });
  };

  return (
    <section className="editor">
      <div className="editor-tabs" role="tablist" aria-label="Request editor">
        {TABS.map((item) => {
          let badge = '';
          if (item.id === 'params' && paramsCount > 0) badge = String(paramsCount);
          if (item.id === 'headers' && headersCount > 0) badge = String(headersCount);
          if (item.id === 'body' && draft.bodyMode !== 'none') badge = draft.bodyMode;
          if (item.id === 'auth' && auth.type !== 'none') badge = auth.type;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cx('editor-tab', tab === item.id && 'is-active')}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {badge ? <span className="editor-tab-badge">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="editor-body">
        {tab === 'params' ? (
          <div className="editor-section">
            <KeyValueRows
              rows={draft.params}
              onChange={(rows) => patch({ params: rows })}
              keyPlaceholder="Parameter"
              valuePlaceholder="Value"
              addLabel="Add parameter"
              emptyHint={
                urlPreview
                  ? `Resolved: ${urlPreview}`
                  : 'Query parameters are appended to the URL when you send.'
              }
            />
          </div>
        ) : null}

        {tab === 'headers' ? (
          <div className="editor-section">
            <div className="suggestions">
              <span className="muted small">Quick add</span>
              {HEADER_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => addHeader(suggestion.key, suggestion.value)}
                >
                  <Icon name="plus" size={11} />
                  {suggestion.label}
                </button>
              ))}
            </div>
            <KeyValueRows
              rows={draft.headers}
              onChange={(rows) => patch({ headers: rows })}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
              secretToggle
              addLabel="Add header"
              emptyHint="Values marked secret are masked in this editor. They are still sent."
            />
          </div>
        ) : null}

        {tab === 'body' ? (
          <div className="editor-section">
            <div className="segmented body-modes">
              {BODY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={cx('segmented-item', draft.bodyMode === mode.id && 'is-active')}
                  onClick={() => patch({ bodyMode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {draft.bodyMode === 'none' ? (
              <div className="editor-note">
                <Icon name="info" size={15} />
                <div>
                  <strong>No request body</strong>
                  <p>Choose JSON, text, or a form body above. GET and HEAD requests never send a body.</p>
                </div>
              </div>
            ) : null}

            {(draft.bodyMode === 'json' || draft.bodyMode === 'text') ? (
              <div className="body-editor">
                <div className="body-editor-bar">
                  <span className="muted small">
                    {draft.bodyMode === 'json' ? 'application/json' : 'text/plain'} ·{' '}
                    {formatBytes(bodySize)}
                  </span>
                  <div className="body-editor-actions">
                    {draft.bodyMode === 'json' ? (
                      <span
                        className={cx(
                          'json-validity',
                          draft.body.trim() && jsonError ? 'is-invalid' : 'is-valid',
                        )}
                      >
                        {draft.body.trim()
                          ? jsonError
                            ? 'Invalid JSON'
                            : 'Valid JSON'
                          : 'Empty body'}
                      </span>
                    ) : null}
                    {draft.bodyMode === 'json' && draft.body.trim() ? (
                      <Button size="sm" variant="ghost" icon="sparkles" onClick={formatJson}>
                        Format
                      </Button>
                    ) : null}
                  </div>
                </div>
                <textarea
                  className="code-textarea"
                  value={draft.body}
                  spellCheck={false}
                  placeholder={
                    draft.bodyMode === 'json'
                      ? '{\n  "hello": "world"\n}'
                      : 'Plain text request body'
                  }
                  onChange={(event) => patch({ body: event.target.value })}
                />
                {jsonError ? <div className="body-error">{jsonError}</div> : null}
              </div>
            ) : null}

            {draft.bodyMode === 'urlencoded' || draft.bodyMode === 'formdata' ? (
              <KeyValueRows
                rows={draft.formFields}
                onChange={(rows) => patch({ formFields: rows })}
                keyPlaceholder="Field"
                valuePlaceholder="Value"
                addLabel="Add field"
                emptyHint={
                  draft.bodyMode === 'formdata'
                    ? 'Text fields only — file uploads arrive in a later release.'
                    : 'Sent as application/x-www-form-urlencoded.'
                }
              />
            ) : null}
          </div>
        ) : null}

        {tab === 'auth' ? (
          <div className="editor-section auth-section">
            <div className="segmented">
              {AUTH_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={cx('segmented-item', auth.type === type.id && 'is-active')}
                  onClick={() => patchAuth({ type: type.id })}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {auth.type === 'none' ? (
              <div className="editor-note">
                <Icon name="lock" size={15} />
                <div>
                  <strong>No authentication</strong>
                  <p>Pick a scheme above, or add an Authorization header manually.</p>
                </div>
              </div>
            ) : null}

            {auth.type === 'bearer' ? (
              <div className="auth-fields">
                <label className="field">
                  <span className="field-label">Token</span>
                  <span className="text-input">
                    <input
                      type={revealToken ? 'text' : 'password'}
                      value={auth.token}
                      placeholder="{{token}} or paste a token"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ token: event.target.value })}
                    />
                    <IconButton
                      icon={revealToken ? 'eye-off' : 'eye'}
                      label={revealToken ? 'Hide token' : 'Show token'}
                      size={13}
                      onClick={() => setRevealToken((value) => !value)}
                    />
                  </span>
                  <span className="field-hint">
                    Sent as <code>Authorization: Bearer …</code>
                  </span>
                </label>
              </div>
            ) : null}

            {auth.type === 'basic' ? (
              <div className="auth-fields">
                <label className="field">
                  <span className="field-label">Username</span>
                  <span className="text-input">
                    <input
                      value={auth.username}
                      placeholder="username"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ username: event.target.value })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Password</span>
                  <span className="text-input">
                    <input
                      type="password"
                      value={auth.password}
                      placeholder="password"
                      autoComplete="off"
                      onChange={(event) => patchAuth({ password: event.target.value })}
                    />
                  </span>
                </label>
                <p className="form-note">Credentials are base64-encoded automatically.</p>
              </div>
            ) : null}

            {auth.type === 'apikey' ? (
              <div className="auth-fields">
                <label className="field">
                  <span className="field-label">Key</span>
                  <span className="text-input">
                    <input
                      value={auth.key}
                      placeholder="X-API-Key"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ key: event.target.value })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Value</span>
                  <span className="text-input">
                    <input
                      value={auth.value}
                      placeholder="{{apiKey}}"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ value: event.target.value })}
                    />
                  </span>
                </label>
                <div className="field">
                  <span className="field-label">Add to</span>
                  <div className="segmented segmented-sm">
                    <button
                      type="button"
                      className={cx('segmented-item', auth.addTo === 'header' && 'is-active')}
                      onClick={() => patchAuth({ addTo: 'header' })}
                    >
                      Header
                    </button>
                    <button
                      type="button"
                      className={cx('segmented-item', auth.addTo === 'query' && 'is-active')}
                      onClick={() => patchAuth({ addTo: 'query' })}
                    >
                      Query
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'code' ? (
          <div className="editor-section code-section">
            <div className="code-toolbar">
              <div className="segmented segmented-sm">
                {SNIPPET_LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cx('segmented-item', language === item.id && 'is-active')}
                    onClick={() => setLanguage(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon="copy"
                onClick={() => {
                  void copyText(snippet).then((copied) =>
                    notify({
                      title: copied ? 'Snippet copied' : 'Could not copy',
                      tone: copied ? 'success' : 'error',
                    }),
                  );
                }}
              >
                Copy
              </Button>
            </div>
            <div className="code-scroll">
              <Code code={snippet} language={language} wrap />
            </div>
            <p className="form-note">
              Snippets resolve variables using the active environment and include auth and headers.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
