import { useStore } from '../state/store';
import { cx, methodClass, tabLabel } from '../lib/utils';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/primitives';

interface RequestTabsProps {
  onOpenSave: () => void;
}

export function RequestTabs({ onOpenSave }: RequestTabsProps) {
  const { state, actions, activeTab } = useStore();

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
        <label className="env-select" title="Active environment">
          <Icon name="globe" size={13} />
          <select
            value={state.activeEnvironmentId ?? ''}
            onChange={(event) =>
              actions.setActiveEnvironment(event.target.value || null)
            }
          >
            <option value="">No environment</option>
            {state.environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </label>

        <IconButton
          icon="save"
          label="Save request (Ctrl+S)"
          disabled={!activeTab}
          onClick={onOpenSave}
        />
      </div>
    </div>
  );
}
