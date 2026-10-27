import { useEffect, useState, type CSSProperties } from 'react';
import type { AccentId, AppInfo, FontSize, ThemeMode } from '../../types';
import { clearCookies, getAppInfo } from '../../lib/api';
import { exportWorkspaceFile, importFromFile } from '../../lib/importExport';
import { createSampleWorkspace } from '../../lib/sampleWorkspace';
import { toWorkspaceFile, useStore } from '../../state/store';
import { useToast } from '../../state/toasts';
import { Button, Field, Kbd, Modal, Switch, TextInput } from '../ui/primitives';
import { Icon, type IconName } from '../ui/Icon';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const THEMES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

const ACCENTS: { id: AccentId; label: string; color: string }[] = [
  { id: 'ember', label: 'Ember', color: '#ff8a3d' },
  { id: 'violet', label: 'Violet', color: '#a78bfa' },
  { id: 'teal', label: 'Teal', color: '#2dd4bf' },
  { id: 'rose', label: 'Rose', color: '#fb7185' },
  { id: 'azure', label: 'Azure', color: '#60a5fa' },
];

const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'large', label: 'Large' },
];

const SHORTCUTS: [string, string][] = [
  ['Send request', 'Ctrl + Enter'],
  ['Save request', 'Ctrl + S'],
  ['New request', 'Ctrl + N'],
  ['Close tab', 'Ctrl + W'],
  ['Command palette', 'Ctrl + K'],
  ['Focus URL', 'Ctrl + L'],
  ['Next / previous tab', 'Ctrl + Tab'],
  ['Toggle sidebar', 'Ctrl + B'],
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { state, actions } = useStore();
  const { notify } = useToast();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [timeoutText, setTimeoutText] = useState('30');

  useEffect(() => {
    if (!open) return;
    setTimeoutText(String(Math.max(1, Math.round(state.settings.timeoutMs / 1000))));
    getAppInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [open, state.settings.timeoutMs]);

  const settings = state.settings;

  const handleExport = async () => {
    try {
      const path = await exportWorkspaceFile(toWorkspaceFile(state));
      notify({
        title: 'Workspace exported',
        description: path ?? undefined,
        tone: 'success',
      });
    } catch (error) {
      notify({ title: 'Export failed', description: errorMessage(error), tone: 'error' });
    }
  };

  const handleImport = async () => {
    try {
      const result = await importFromFile();
      if (!result) return;
      actions.applyImport(result);
    } catch (error) {
      notify({ title: 'Import failed', description: errorMessage(error), tone: 'error' });
    }
  };

  const restoreSample = () => {
    if (!window.confirm('Replace the current workspace with the sample workspace?')) return;
    actions.applyImport({ kind: 'workspace', workspace: createSampleWorkspace() });
    onClose();
  };

  const handleClearCookies = async () => {
    try {
      await clearCookies();
      notify({ title: 'Cookie jar cleared', tone: 'info' });
    } catch (error) {
      notify({ title: 'Could not clear cookies', description: errorMessage(error), tone: 'error' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="settings"
      title="Settings"
      subtitle="Tune the look and behaviour of your workspace."
      width={640}
      footer={
        <div className="modal-footer-split">
          <span className="muted small">
            {info ? `${info.name} ${info.version} · ${info.runtime}` : 'Courier'}
          </span>
          <Button variant="primary" icon="check" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="settings-stack">
        <section className="settings-section">
          <h3>Appearance</h3>

          <div className="setting-block">
            <div className="setting-copy">
              <span>Theme</span>
              <p>Follow the system or pick a side.</p>
            </div>
            <div className="segmented">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={settings.theme === theme.id ? 'is-active' : undefined}
                  onClick={() => actions.updateSettings({ theme: theme.id })}
                >
                  <Icon name={theme.icon} size={14} />
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-block">
            <div className="setting-copy">
              <span>Accent</span>
              <p>Used for highlights, focus rings and the send button.</p>
            </div>
            <div className="swatches">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  className={settings.accent === accent.id ? 'swatch is-active' : 'swatch'}
                  style={{ '--swatch': accent.color } as CSSProperties}
                  aria-label={accent.label}
                  title={accent.label}
                  onClick={() => actions.updateSettings({ accent: accent.id })}
                >
                  {settings.accent === accent.id ? <Icon name="check" size={12} /> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-block">
            <div className="setting-copy">
              <span>UI density</span>
              <p>Adjust the base font size of the app.</p>
            </div>
            <div className="segmented">
              {FONT_SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className={settings.fontSize === size.id ? 'is-active' : undefined}
                  onClick={() => actions.updateSettings({ fontSize: size.id })}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Requests</h3>

          <div className="setting-block">
            <div className="setting-copy">
              <span>Timeout</span>
              <p>How long to wait before giving up on a request.</p>
            </div>
            <div className="setting-inline">
              <TextInput
                type="number"
                min={1}
                max={300}
                value={timeoutText}
                onChange={(event) => {
                  const next = event.target.value;
                  setTimeoutText(next);
                  const seconds = Number(next);
                  if (Number.isFinite(seconds) && seconds > 0) {
                    actions.updateSettings({
                      timeoutMs: Math.min(300, seconds) * 1000,
                    });
                  }
                }}
                onBlur={() =>
                  setTimeoutText(
                    String(Math.max(1, Math.round(state.settings.timeoutMs / 1000))),
                  )
                }
              />
              <span className="muted small">seconds</span>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-copy">
              <span>Follow redirects</span>
              <p>Automatically follow 3xx responses.</p>
            </div>
            <Switch
              checked={settings.followRedirects}
              onChange={(checked) => actions.updateSettings({ followRedirects: checked })}
              label="Follow redirects"
            />
          </div>

          <div className="setting-row">
            <div className="setting-copy">
              <span>Verify TLS certificates</span>
              <p>Turn off only for trusted local servers.</p>
            </div>
            <Switch
              checked={settings.verifyTls}
              onChange={(checked) => actions.updateSettings({ verifyTls: checked })}
              label="Verify TLS certificates"
            />
          </div>

          <div className="setting-row">
            <div className="setting-copy">
              <span>Persist cookies</span>
              <p>Share a cookie jar between requests.</p>
            </div>
            <Switch
              checked={settings.cookieJar}
              onChange={(checked) => actions.updateSettings({ cookieJar: checked })}
              label="Persist cookies"
            />
          </div>

          <div className="setting-row">
            <div className="setting-copy">
              <span>Wrap response text</span>
              <p>Soft-wrap long lines in the response viewer.</p>
            </div>
            <Switch
              checked={settings.wordWrap}
              onChange={(checked) => actions.updateSettings({ wordWrap: checked })}
              label="Wrap response text"
            />
          </div>

          <Field label="HTTP proxy" hint="Leave empty to connect directly. Example: http://127.0.0.1:8080">
            <TextInput
              value={settings.proxy}
              placeholder="http://127.0.0.1:8080"
              spellCheck={false}
              onChange={(event) => actions.updateSettings({ proxy: event.target.value })}
            />
          </Field>
        </section>

        <section className="settings-section">
          <h3>Workspace</h3>
          <div className="button-row">
            <Button variant="default" icon="upload" onClick={handleImport}>
              Import file
            </Button>
            <Button variant="default" icon="download" onClick={handleExport}>
              Export workspace
            </Button>
            <Button variant="ghost" icon="refresh" onClick={handleClearCookies}>
              Clear cookies
            </Button>
            <Button variant="ghost" icon="sparkles" onClick={restoreSample}>
              Restore sample
            </Button>
          </div>
          <p className="form-note">
            Import Postman v2.1 collections, Postman environments or a Courier
            workspace export. Everything is stored locally on this machine.
          </p>
        </section>

        <section className="settings-section">
          <h3>Keyboard shortcuts</h3>
          <div className="shortcut-grid">
            {SHORTCUTS.map(([label, keys]) => (
              <div className="shortcut-row" key={label}>
                <span>{label}</span>
                <Kbd>{keys}</Kbd>
              </div>
            ))}
          </div>
        </section>

        {info ? (
          <p className="settings-about">
            {info.name} {info.version} · {info.runtime} · {info.platform}/{info.arch}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
