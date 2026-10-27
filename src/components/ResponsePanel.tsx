import { useEffect, useMemo, useRef, useState } from 'react';
import type { HttpResponse } from '../types';
import { useStore } from '../state/store';
import { useToast } from '../state/toasts';
import { Code } from '../lib/highlight';
import {
  bytesToBase64,
  contentTypeFamily,
  copyText,
  cx,
  decodeBody,
  downloadBlob,
  filenameForResponse,
  formatBytes,
  formatMs,
  isJsonValue,
  languageFor,
  prettyJson,
  statusTone,
} from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { Icon } from './ui/Icon';

type MainView = 'body' | 'headers';
type BodyView = 'pretty' | 'raw' | 'preview';

const LARGE_BODY = 400_000;

function useElapsed(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt, active]);
  return startedAt ? Math.max(0, now - startedAt) : 0;
}

function bodyToText(response: HttpResponse): string {
  if (response.bodyEncoding === 'text') return response.body;
  if (response.sizeBytes > 6_000_000) return '[Binary response too large to display]';
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(
      decodeBody(response.body, response.bodyEncoding),
    );
  } catch {
    return '[Binary response]';
  }
}

export function ResponsePanel() {
  const { state, actions, activeTab } = useStore();
  const { notify } = useToast();
  const [view, setView] = useState<MainView>('body');
  const [bodyView, setBodyView] = useState<BodyView>('pretty');
  const [headerQuery, setHeaderQuery] = useState('');
  const [wrap, setWrap] = useState(state.settings.wordWrap);
  const imageRef = useRef<HTMLDivElement>(null);

  const response = activeTab?.response ?? null;
  const error = activeTab?.error ?? null;
  const sending = activeTab?.sending ?? false;
  const elapsed = useElapsed(activeTab?.startedAt ?? null, sending);

  useEffect(() => {
    setHeaderQuery('');
    setView('body');
    if (response) {
      const family = contentTypeFamily(response.contentType);
      setBodyView(family === 'image' || family === 'html' ? 'preview' : 'pretty');
    }
  }, [activeTab?.id]);

  useEffect(() => {
    setWrap(state.settings.wordWrap);
  }, [state.settings.wordWrap]);

  const bodyText = useMemo(() => (response ? bodyToText(response) : ''), [response]);

  const pretty = useMemo(() => {
    if (!response || !bodyText) return '';
    const family = contentTypeFamily(response.contentType);
    if ((family === 'json' || isJsonValue(bodyText)) && bodyText.length <= LARGE_BODY) {
      return prettyJson(bodyText) ?? bodyText;
    }
    return bodyText;
  }, [response, bodyText]);

  if (!activeTab) {
    return (
      <section className="response">
        <div className="response-empty">
          <span className="empty-icon">
            <Icon name="clock" size={22} />
          </span>
          <h3>Nothing sent yet</h3>
          <p>Responses appear here with status, timing, size, headers and formatted bodies.</p>
        </div>
      </section>
    );
  }

  if (sending) {
    return (
      <section className="response">
        <div className="response-sending">
          <span className="sending-orbit" aria-hidden="true" />
          <h3>Sending request…</h3>
          <p className="muted">
            {activeTab.draft.method} {activeTab.draft.url || 'request'}
          </p>
          <span className="sending-timer">{formatMs(elapsed)}</span>
          <Button
            size="sm"
            variant="ghost"
            icon="close"
            onClick={() => void actions.cancelTab(activeTab.id)}
          >
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="response">
        <div className="response-error">
          <span className="empty-icon is-danger">
            <Icon name="alert" size={22} />
          </span>
          <h3>Request failed</h3>
          <p className="response-error-message">{error}</p>
          <div className="empty-actions">
            <Button variant="primary" icon="refresh" onClick={() => void actions.sendTab(activeTab.id)}>
              Retry
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!response) {
    return (
      <section className="response">
        <div className="response-empty">
          <span className="empty-icon">
            <Icon name="terminal" size={22} />
          </span>
          <h3>Ready when you are</h3>
          <p>
            Press <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Enter</kbd> to send, or use
            the tabs above to shape the request first.
          </p>
        </div>
      </section>
    );
  }

  const tone = statusTone(response.status);
  const family = contentTypeFamily(response.contentType);
  const language = languageFor(response.contentType, bodyText);
  const enabledHeaders = response.headers.filter((header) =>
    `${header.key}: ${header.value}`.toLowerCase().includes(headerQuery.trim().toLowerCase()),
  );
  const isLarge = bodyText.length > LARGE_BODY;

  const copyBody = () => {
    void copyText(bodyText).then((copied) =>
      notify({
        title: copied ? 'Response copied' : 'Could not copy response',
        tone: copied ? 'success' : 'error',
      }),
    );
  };

  const download = () => {
    downloadBlob(
      filenameForResponse(response.contentType, response.status),
      decodeBody(response.body, response.bodyEncoding),
      response.contentType || 'application/octet-stream',
    );
  };

  const openInBrowser = () => {
    window.open(response.finalUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="response">
      <div className="response-bar">
        <div className="response-status">
          <span className={cx('status-pill', `tone-${tone}`)}>
            <span className="status-pill-dot" />
            {response.status} {response.statusText}
          </span>
          <span className="response-metric" title="Round-trip time">
            <Icon name="clock" size={12} />
            {formatMs(response.elapsedMs)}
          </span>
          <span className="response-metric" title="Response size">
            <Icon name="save" size={12} />
            {formatBytes(response.sizeBytes)}
          </span>
          <span className="response-metric response-version">{response.httpVersion}</span>
        </div>

        <div className="response-tools">
          <div className="segmented segmented-sm">
            <button
              type="button"
              className={cx('segmented-item', view === 'body' && 'is-active')}
              onClick={() => setView('body')}
            >
              Body
            </button>
            <button
              type="button"
              className={cx('segmented-item', view === 'headers' && 'is-active')}
              onClick={() => setView('headers')}
            >
              Headers
              <span className="segmented-count">{response.headers.length}</span>
            </button>
          </div>
          <span className="toolbar-divider" />
          <IconButton
            icon="wrap"
            label={wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
            active={wrap}
            onClick={() => setWrap((value) => !value)}
          />
          <IconButton icon="external" label="Open final URL in browser" onClick={openInBrowser} />
          <IconButton icon="copy" label="Copy response body" onClick={copyBody} />
          <IconButton icon="download" label="Download response" onClick={download} />
        </div>
      </div>

      {response.truncated ? (
        <div className="response-banner">
          <Icon name="alert" size={14} />
          Response exceeded the 20 MB cap and was truncated on the wire.
        </div>
      ) : null}

      {view === 'headers' ? (
        <div className="headers-view">
          <div className="headers-toolbar">
            <span className="text-input">
              <Icon name="search" size={13} className="text-input-icon" />
              <input
                value={headerQuery}
                placeholder="Filter headers…"
                spellCheck={false}
                onChange={(event) => setHeaderQuery(event.target.value)}
              />
            </span>
            <span className="muted small">
              {enabledHeaders.length} of {response.headers.length}
            </span>
          </div>
          <div className="headers-table">
            {enabledHeaders.map((header) => (
              <button
                key={`${header.key}:${header.value}`}
                type="button"
                className="header-row"
                title="Copy header"
                onClick={() => {
                  void copyText(`${header.key}: ${header.value}`).then((copied) =>
                    notify({
                      title: copied ? 'Header copied' : 'Could not copy header',
                      tone: copied ? 'success' : 'error',
                    }),
                  );
                }}
              >
                <span className="header-key">{header.key}</span>
                <span className="header-value">{header.value}</span>
              </button>
            ))}
            {enabledHeaders.length === 0 ? (
              <div className="muted small headers-empty">No headers match that filter.</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="response-body">
          <div className="response-subbar">
            <div className="segmented segmented-sm">
              <button
                type="button"
                className={cx('segmented-item', bodyView === 'pretty' && 'is-active')}
                onClick={() => setBodyView('pretty')}
              >
                Pretty
              </button>
              <button
                type="button"
                className={cx('segmented-item', bodyView === 'raw' && 'is-active')}
                onClick={() => setBodyView('raw')}
              >
                Raw
              </button>
              <button
                type="button"
                className={cx('segmented-item', bodyView === 'preview' && 'is-active')}
                onClick={() => setBodyView('preview')}
              >
                Preview
              </button>
            </div>
            <span className="response-type" title={response.contentType}>
              {response.contentType || 'unknown content type'}
              {isLarge ? ' · large body, formatted view limited' : ''}
            </span>
          </div>

          <div className="response-content" ref={imageRef}>
            {bodyView === 'preview' ? (
              family === 'image' ? (
                <div className="image-preview">
                  <img
                    alt="Response preview"
                    src={`data:${response.contentType || 'image/png'};base64,${
                      response.bodyEncoding === 'base64'
                        ? response.body
                        : bytesToBase64(decodeBody(response.body, response.bodyEncoding))
                    }`}
                  />
                </div>
              ) : family === 'html' ? (
                <iframe
                  className="html-preview"
                  title="HTML response preview"
                  sandbox=""
                  srcDoc={bodyText}
                />
              ) : (
                <div className="preview-note">
                  <Icon name="info" size={16} />
                  <p>
                    Preview is available for image and HTML responses. Use Pretty or Raw for
                    {' '}
                    {family === 'binary' ? 'binary' : family} content.
                  </p>
                </div>
              )
            ) : bodyView === 'raw' ? (
              <pre className={cx('response-pre', wrap && 'is-wrapped')}>{bodyText || '(empty body)'}</pre>
            ) : (
              <Code
                code={pretty || '(empty body)'}
                language={language}
                wrap={wrap}
                className="response-code"
              />
            )}
          </div>

          <div className="response-foot">
            <span className="response-url" title={response.finalUrl}>
              {response.finalUrl}
            </span>
            <span className="muted small">
              request {response.requestId.slice(0, 8)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
