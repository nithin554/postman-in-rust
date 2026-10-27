import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ActivityRail } from './components/ActivityRail';
import { RequestBar } from './components/RequestBar';
import { RequestEditor } from './components/RequestEditor';
import { RequestTabs } from './components/RequestTabs';
import { ResponsePanel } from './components/ResponsePanel';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/overlays/CommandPalette';
import { SaveRequestModal } from './components/overlays/SaveRequestModal';
import { SettingsModal } from './components/overlays/SettingsModal';
import { cx } from './lib/utils';
import { StoreProvider, useStore } from './state/store';
import { ToastProvider } from './state/toasts';

function BootSplash() {
  return (
    <div className="boot">
      <div className="boot-logo">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="boot-logo-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#boot-logo-gradient)" />
          <path
            d="M21.5 11.2a6.2 6.2 0 1 0 0 9.6"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="boot-name">Courier</div>
      <div className="boot-bar">
        <span />
      </div>
      <p>Preparing your workspace…</p>
    </div>
  );
}

function AppShell() {
  const { state, actions, activeTab } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const latest = useRef({ state, actions, activeTab, settingsOpen, saveOpen, paletteOpen });
  latest.current = { state, actions, activeTab, settingsOpen, saveOpen, paletteOpen };

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const theme =
        state.settings.theme === 'system'
          ? media.matches
            ? 'light'
            : 'dark'
          : state.settings.theme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.accent = state.settings.accent;
      document.documentElement.dataset.density = state.settings.fontSize;
      document.documentElement.style.colorScheme = theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state.settings.theme, state.settings.accent, state.settings.fontSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;

      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (current.paletteOpen) return;

      if (key === 'enter') {
        event.preventDefault();
        if (current.activeTab && !current.activeTab.sending) {
          void current.actions.sendTab(current.activeTab.id);
        }
        return;
      }

      if (current.settingsOpen || current.saveOpen) return;

      if (key === 's') {
        event.preventDefault();
        if (current.activeTab) setSaveOpen(true);
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        current.actions.newRequestTab();
        return;
      }

      if (key === 'w') {
        event.preventDefault();
        if (current.state.activeTabId) current.actions.closeTab(current.state.activeTabId);
        return;
      }

      if (key === 'b') {
        event.preventDefault();
        current.actions.toggleSidebar();
        return;
      }

      if (key === 'l') {
        event.preventDefault();
        const input = document.getElementById('request-url') as HTMLInputElement | null;
        input?.focus();
        input?.select();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const tabs = current.state.tabs;
        if (tabs.length < 2) return;
        const index = tabs.findIndex((tab) => tab.id === current.state.activeTabId);
        const direction = event.shiftKey ? -1 : 1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        current.actions.selectTab(next.id);
        return;
      }

      if (typing) return;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!state.ready) return <BootSplash />;

  return (
    <div className={cx('app', !state.sidebarOpen && 'is-sidebar-collapsed')}>
      <ActivityRail
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {state.sidebarOpen ? <Sidebar /> : null}

      <main className="main-panel">
        <RequestTabs onOpenSave={() => setSaveOpen(true)} />
        <RequestBar onOpenSave={() => setSaveOpen(true)} />

        <div className="work-area">
          <PanelGroup direction="vertical" autoSaveId="courier-main-split" className="pane-group">
            <Panel defaultSize={46} minSize={22} className="pane">
              <RequestEditor />
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={54} minSize={18} className="pane">
              <ResponsePanel />
            </Panel>
          </PanelGroup>
        </div>

        <StatusBar />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SaveRequestModal open={saveOpen} tab={activeTab} onClose={() => setSaveOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSave={() => {
          if (latest.current.activeTab) setSaveOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </ToastProvider>
  );
}
