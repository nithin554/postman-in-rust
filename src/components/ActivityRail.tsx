import type { SidebarSection, ThemeMode } from '../types';
import { useStore } from '../state/store';
import { Icon, type IconName } from './ui/Icon';
import { cx } from '../lib/utils';

const SECTIONS: { id: SidebarSection; icon: IconName; label: string }[] = [
  { id: 'collections', icon: 'layers', label: 'Collections' },
  { id: 'history', icon: 'history', label: 'History' },
  { id: 'environments', icon: 'globe', label: 'Environments' },
];

const THEME_CYCLE: ThemeMode[] = ['dark', 'light', 'system'];

const THEME_ICON: Record<ThemeMode, IconName> = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
};

interface ActivityRailProps {
  onOpenSettings: () => void;
  onOpenPalette: () => void;
}

export function ActivityRail({ onOpenSettings, onOpenPalette }: ActivityRailProps) {
  const { state, actions } = useStore();

  const cycleTheme = () => {
    const index = THEME_CYCLE.indexOf(state.settings.theme);
    const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
    actions.updateSettings({ theme: next });
  };

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-logo" title="Courier">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="rail-logo-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-2)" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#rail-logo-gradient)" />
          <path
            d="M21.5 11.2a6.2 6.2 0 1 0 0 9.6"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <button
        type="button"
        className="rail-button"
        onClick={onOpenPalette}
        title="Command palette (Ctrl+K)"
        aria-label="Command palette"
      >
        <Icon name="command" size={17} />
      </button>

      <div className="rail-divider" />

      <div className="rail-stack">
        {SECTIONS.map((section) => {
          const active = state.sidebarOpen && state.sidebar === section.id;
          return (
            <button
              key={section.id}
              type="button"
              className={cx('rail-button', active && 'is-active')}
              title={section.label}
              aria-label={section.label}
              onClick={() => actions.setSidebar(section.id)}
            >
              <Icon name={section.icon} size={18} />
              <span className="rail-indicator" />
            </button>
          );
        })}
      </div>

      <div className="rail-spacer" />

      <button
        type="button"
        className="rail-button"
        onClick={cycleTheme}
        title={`Theme: ${state.settings.theme} (click to change)`}
        aria-label="Change theme"
      >
        <Icon name={THEME_ICON[state.settings.theme]} size={17} />
      </button>

      <button
        type="button"
        className="rail-button"
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
      >
        <Icon name="settings" size={17} />
      </button>
    </nav>
  );
}
