import { useEffect, useState } from 'react';
import type { AppInfo } from '../types';
import { getAppInfo } from '../lib/api';
import { useStore } from '../state/store';
import { Icon } from './ui/Icon';
import { cx } from '../lib/utils';

export function StatusBar() {
  const { state, activeEnvironment, activeTab } = useStore();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = state.tabs.filter((tab) => tab.dirty).length;

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span className="status-brand">
          <span className="status-brand-dot" />
          Courier
        </span>
        {info ? (
          <span className="status-item">
            v{info.version}
            <span className="status-tag">{info.runtime}</span>
          </span>
        ) : null}
        {info ? <span className="status-item muted">{info.platform} · {info.arch}</span> : null}
      </div>

      <div className="status-group">
        <span className={cx('status-chip', activeEnvironment && 'is-accent')}>
          <Icon name="globe" size={11} />
          {activeEnvironment?.name ?? 'No environment'}
        </span>
        <span className="status-item">
          <Icon name="layers" size={11} />
          {state.tabs.length} tab{state.tabs.length === 1 ? '' : 's'}
        </span>
        {dirty > 0 ? (
          <span className="status-item status-dirty">
            <span className="status-brand-dot" />
            {dirty} unsaved
          </span>
        ) : null}
        {activeTab ? (
          <span className="status-item muted status-hidden-small">
            {activeTab.draft.method}
          </span>
        ) : null}
      </div>

      <div className="status-group status-hints">
        <span className="status-item">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">↵</kbd>
          Send
        </span>
        <span className="status-item status-hidden-small">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
          Palette
        </span>
      </div>
    </footer>
  );
}
