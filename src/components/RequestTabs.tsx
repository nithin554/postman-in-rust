import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { cx, methodClass, tabLabel } from '../lib/utils';
import { Icon } from './ui/Icon';

function EnvironmentPicker() {
  const { state, actions } = useStore();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = state.environments.find(
    (environment) => environment.id === state.activeEnvironmentId,
  );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_WIDTH = 232;
    // Prefer aligning the menu's right edge with the pill's right edge when the
    // pill sits close to the window border, clamped by a 16px safety margin.
    const left = Math.max(
      16,
      Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 16),
    );
    setAnchor({ left, top: rect.bottom + 10 });
    setOpen(true);
  };

  const pick = (id: string | null) => {
    actions.setActiveEnvironment(id);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="env-select"
        title="Active environment"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="globe" size={13} />
        <span className="env-select-name">{active?.name ?? 'No environment'}</span>
        <Icon name="chevron-down" size={11} className="env-select-chevron" />
      </button>

      {open && anchor
        ? createPortal(
            <>
              <div className="menu-scrim" onMouseDown={() => setOpen(false)} />
              <div
                className="context-menu env-menu"
                style={{ left: anchor.left, top: anchor.top }}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={cx('context-item', active === undefined && 'is-active')}
                  onClick={() => pick(null)}
                >
                  <span className="env-menu-radio">
                    {active === undefined ? <Icon name="check" size={12} /> : null}
                  </span>
                  No environment
                </button>
                {state.environments.map((environment) => (
                  <button
                    key={environment.id}
                    type="button"
                    role="menuitem"
                    className={cx('context-item', active?.id === environment.id && 'is-active')}
                    onClick={() => pick(environment.id)}
                  >
                    <span className="env-menu-radio">
                      {active?.id === environment.id ? <Icon name="check" size={12} /> : null}
                    </span>
                    {environment.name}
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

export function RequestTabs() {
  const { state, actions } = useStore();

  return (
    <div className="tabs-bar">
      <div className="tabs-scroll" role="tablist" aria-label="Open requests">
        {state.tabs.map((tab) => {
          const active = tab.id === state.activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={cx('tab', active && 'is-active')}
              onClick={() => actions.selectTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) actions.closeTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  actions.selectTab(tab.id);
                }
              }}
              title={tab.draft.url || tab.name}
            >
              <span className={cx('tab-method', methodClass(tab.draft.method))}>
                {tab.draft.method}
              </span>
              <span className="tab-name">{tabLabel(tab)}</span>
              {tab.dirty ? <span className="tab-dirty" title="Unsaved changes" /> : null}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.name}`}
                title="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.closeTab(tab.id);
                }}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="tab-add"
          title="New request (Ctrl+N)"
          aria-label="New request"
          onClick={() => actions.newRequestTab()}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="tabs-actions">
        <EnvironmentPicker />
      </div>
    </div>
  );
}
