import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { CollectionNode } from '../../types';
import { collectRequests } from '../../lib/tree';
import { importFromFile } from '../../lib/importExport';
import { cx } from '../../lib/utils';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toasts';
import { Icon, type IconName } from '../ui/Icon';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenSave: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  group: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenSettings,
  onOpenSave,
}: CommandPaletteProps) {
  const { state, actions, activeTab } = useStore();
  const { notify } = useToast();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const actionsList: PaletteItem[] = [
      {
        id: 'new-request',
        label: 'New request',
        hint: 'Open a blank request tab',
        icon: 'plus',
        group: 'Actions',
        run: () => actions.newRequestTab(),
      },
      {
        id: 'send',
        label: 'Send current request',
        hint: 'Ctrl + Enter',
        icon: 'send',
        group: 'Actions',
        run: () => {
          if (activeTab) void actions.sendTab(activeTab.id);
        },
      },
      {
        id: 'save',
        label: 'Save current request',
        hint: 'Ctrl + S',
        icon: 'save',
        group: 'Actions',
        run: onOpenSave,
      },
      {
        id: 'import',
        label: 'Import from file',
        hint: 'Postman collection or environment',
        icon: 'upload',
        group: 'Actions',
        run: () => {
          importFromFile()
            .then((result) => {
              if (result) actions.applyImport(result);
            })
            .catch((error) => {
              notify({
                title: 'Import failed',
                description: error instanceof Error ? error.message : String(error),
                tone: 'error',
              });
            });
        },
      },
      {
        id: 'theme',
        label: 'Toggle theme',
        hint: 'Switch between dark and light',
        icon: state.settings.theme === 'dark' ? 'sun' : 'moon',
        group: 'Actions',
        run: () =>
          actions.updateSettings({
            theme: state.settings.theme === 'dark' ? 'light' : 'dark',
          }),
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Theme, accents, network',
        icon: 'settings',
        group: 'Actions',
        run: onOpenSettings,
      },
      {
        id: 'sidebar-collections',
        label: 'Show collections',
        hint: 'Sidebar',
        icon: 'layers',
        group: 'Navigate',
        run: () => actions.setSidebar('collections'),
      },
      {
        id: 'sidebar-history',
        label: 'Show history',
        hint: 'Sidebar',
        icon: 'history',
        group: 'Navigate',
        run: () => actions.setSidebar('history'),
      },
      {
        id: 'sidebar-environments',
        label: 'Show environments',
        hint: 'Sidebar',
        icon: 'globe',
        group: 'Navigate',
        run: () => actions.setSidebar('environments'),
      },
    ];

    const requestItems: PaletteItem[] = state.collections.flatMap((collection) =>
      collectRequests(collection.nodes, collection.id).map(({ node }) => ({
        id: `request-${node.id}`,
        label: node.name,
        hint: `${collection.name} · ${node.request?.method ?? 'GET'}`,
        icon: 'send' as IconName,
        group: 'Saved requests',
        run: () => actions.openRequest(collection.id, node as CollectionNode),
      })),
    );

    const environmentItems: PaletteItem[] = state.environments.map((environment) => ({
      id: `env-${environment.id}`,
      label: environment.name,
      hint: state.activeEnvironmentId === environment.id ? 'Active environment' : 'Environment',
      icon: 'globe' as IconName,
      group: 'Environments',
      run: () => actions.setActiveEnvironment(environment.id),
    }));

    return [...actionsList, ...requestItems, ...environmentItems];
  }, [state.collections, state.environments, state.activeEnvironmentId, state.settings.theme, activeTab, actions, notify, onOpenSave, onOpenSettings]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.hint.toLowerCase().includes(needle) ||
        item.group.toLowerCase().includes(needle),
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filtered.length]);

  if (!open) return null;

  const run = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length === 0 ? 0 : (current + 1) % filtered.length,
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length === 0
          ? 0
          : (current - 1 + filtered.length) % filtered.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) run(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return createPortal(
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search actions, requests and environments…"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="palette-empty">No matches for “{query}”.</div>
          ) : (
            filtered.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <div className="palette-group">{item.group}</div> : null}
                  <button
                    type="button"
                    data-index={index}
                    className={cx('palette-item', index === activeIndex && 'is-active')}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => run(item)}
                  >
                    <span className="palette-item-icon">
                      <Icon name={item.icon} size={15} />
                    </span>
                    <span className="palette-item-label">{item.label}</span>
                    <span className="palette-item-hint">{item.hint}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="palette-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> run</span>
          <span className="palette-brand">Courier</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
