import { useState } from 'react';
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
import { buildUrlPreview } from '../lib/request';
import { codeEditorKeyDown } from '../lib/codeEditor';
import { cx, formatBytes, prettyJson, uid } from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { CodeEditor } from './ui/CodeEditor';
import { Icon } from './ui/Icon';
import { KeyValueRows } from './ui/KeyValueRows';

type EditorTab = 'params' | 'headers' | 'body' | 'auth' | 'scripts';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
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
  { id: 'oauth2', label: 'OAuth 2' },
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
  const { actions, activeTab, activeEnvironment } = useStore();
  const { notify } = useToast();
  const [tab, setTab] = useState<EditorTab>('params');
  const [revealToken, setRevealToken] = useState(false);

  const draft = activeTab?.draft;
  const auth = draft?.auth ?? DEFAULT_AUTH;

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
          if (
            item.id === 'scripts' &&
            (draft.preRequestScript?.trim() || draft.testScript?.trim())
          ) {
            badge = 'JS';
          }
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
                {draft.bodyMode === 'json' ? (
                  <CodeEditor
                    value={draft.body}
                    language="json"
                    placeholder={'{\n  "hello": "world"\n}'}
                    ariaLabel="JSON request body"
                    onChange={(body) => patch({ body })}
                    onKeyDown={codeEditorKeyDown}
                  />
                ) : (
                  <textarea
                    className="code-textarea"
                    value={draft.body}
                    spellCheck={false}
                    placeholder="Plain text request body"
                    onChange={(event) => patch({ body: event.target.value })}
                    onKeyDown={codeEditorKeyDown}
                  />
                )}
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

            {auth.type === 'oauth2' ? (
              <div className="auth-fields">
                <label className="field">
                  <span className="field-label">Token URL</span>
                  <span className="text-input">
                    <input
                      value={auth.tokenUrl ?? ''}
                      placeholder="https://example.com/oauth/token"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ tokenUrl: event.target.value })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Client ID</span>
                  <span className="text-input">
                    <input
                      value={auth.clientId ?? ''}
                      placeholder="{{clientId}}"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ clientId: event.target.value })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Client secret</span>
                  <span className="text-input">
                    <input
                      type="password"
                      value={auth.clientSecret ?? ''}
                      placeholder="{{clientSecret}}"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ clientSecret: event.target.value })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">Scope</span>
                  <span className="text-input">
                    <input
                      value={auth.scope ?? ''}
                      placeholder="optional, e.g. read write"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => patchAuth({ scope: event.target.value })}
                    />
                  </span>
                </label>
                <div className="editor-note">
                  <Icon name="lock" size={15} />
                  <div>
                    <strong>OAuth 2 client credentials</strong>
                    <p>
                      Courier fetches the token on send, caches it until shortly before expiry,
                      and sends it as <code>Authorization: Bearer …</code>.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'scripts' ? (
          <div className="editor-section scripts-section">
            <label className="field">
              <span className="field-label">Pre-request script</span>
              <span className="field-hint">
                Runs before sending. Use <code>pm.environment.set(&quot;name&quot;, &quot;value&quot;)</code> to
                update the active environment.
              </span>
              <CodeEditor
                value={draft.preRequestScript ?? ''}
                language="javascript"
                className="script-code-editor"
                placeholder={'// runs before the request is sent\npm.environment.set("ts", Date.now())'}
                ariaLabel="Pre-request script"
                minRows={6}
                onChange={(code) => patch({ preRequestScript: code })}
                onKeyDown={codeEditorKeyDown}
              />
            </label>
            <label className="field">
              <span className="field-label">Tests</span>
              <span className="field-hint">
                Runs after the response arrives. Use <code>pm.test()</code>,{' '}
                <code>pm.expect()</code>, and <code>pm.response</code>.
              </span>
              <CodeEditor
                value={draft.testScript ?? ''}
                language="javascript"
                className="script-code-editor"
                placeholder={'pm.test("status is 200", () => {\n  pm.expect(pm.response.code).to.equal(200);\n});'}
                ariaLabel="Test script"
                minRows={6}
                onChange={(code) => patch({ testScript: code })}
                onKeyDown={codeEditorKeyDown}
              />
            </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}
