import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CollectionNode, Environment, HistoryEntry, SidebarSection } from '../types';
import { exportJsonFile } from '../lib/api';
import { importFromFile } from '../lib/importExport';
import { collectionToPostman, slugifyFilename } from '../lib/postman';
import { countRequests, filterNodes } from '../lib/tree';
import {
  cx,
  dayLabel,
  formatBytes,
  formatMs,
  formatRelativeTime,
  hostOf,
  methodClass,
  pathOf,
  statusTone,
} from '../lib/utils';
import { useStore } from '../state/store';
import { useToast } from '../state/toasts';
import { EmptyState, IconButton, TextInput } from './ui/primitives';
import { Icon } from './ui/Icon';
import { EnvironmentModal } from './overlays/EnvironmentModal';

const SECTION_TITLES: Record<SidebarSection, string> = {
  collections: 'Collections',
  history: 'History',
  environments: 'Environments',
};

const SECTION_PLACEHOLDERS: Record<SidebarSection, string> = {
  collections: 'Filter collections…',
  history: 'Filter history…',
  environments: 'Filter environments…',
};

export function Sidebar() {
  const { state, actions } = useStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [state.sidebar]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <span>{SECTION_TITLES[state.sidebar]}</span>
        </div>
        <IconButton
          icon="panel-left"
          label="Hide sidebar"
          onClick={actions.toggleSidebar}
        />
      </div>

      <div className="sidebar-search">
        <TextInput
          icon="search"
          value={query}
          placeholder={SECTION_PLACEHOLDERS[state.sidebar]}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="sidebar-body">
        {state.sidebar === 'collections' ? <CollectionsPanel query={query} /> : null}
        {state.sidebar === 'history' ? <HistoryPanel query={query} /> : null}
        {state.sidebar === 'environments' ? <EnvironmentsPanel query={query} /> : null}
      </div>
    </aside>
  );
}

function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const settled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, []);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      className="tree-rename"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') cancel();
      }}
    />
  );
}

type MenuTarget =
  | { kind: 'collection'; collectionId: string }
  | { kind: 'node'; collectionId: string; node: CollectionNode };

type MenuState = MenuTarget & { x: number; y: number };

interface MenuAction {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  danger?: boolean;
  run: () => void;
}

function ContextMenu({
  state,
  items,
  onClose,
}: {
  state: MenuState | null;
  items: MenuAction[];
  onClose: () => void;
}) {
  if (!state) return null;
  const left = Math.min(state.x, window.innerWidth - 232);
  const top = Math.min(state.y, window.innerHeight - items.length * 34 - 24);

  return createPortal(
    <>
      <div
        className="menu-scrim"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div className="context-menu" style={{ left, top }} role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={cx('context-item', item.danger && 'is-danger')}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

function CollectionsPanel({ query }: { query: string }) {
  const { state, actions } = useStore();
  const { notify } = useToast();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expand = (id: string) => {
    setCollapsed((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleImport = () => {
    importFromFile()
      .then((result) => {
        if (!result) return;
        actions.applyImport(result);
        if (result.kind === 'collection') {
          expand(result.collection.id);
        }
      })
      .catch((error) => {
        notify({
          title: 'Import failed',
          description: error instanceof Error ? error.message : String(error),
          tone: 'error',
        });
      });
  };

  const createCollection = () => {
    const collection = actions.createCollection('New collection');
    setEditingId(collection.id);
    expand(collection.id);
  };

  const openMenu = (event: React.MouseEvent, target: MenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ ...target, x: event.clientX, y: event.clientY });
  };

  const exportCollection = (collectionId: string) => {
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) return;
    exportJsonFile(
      `${slugifyFilename(collection.name)}.postman_collection.json`,
      collectionToPostman(collection),
    )
      .then(() => notify({ title: 'Collection exported', tone: 'success' }))
      .catch((error) =>
        notify({
          title: 'Export failed',
          description: error instanceof Error ? error.message : String(error),
          tone: 'error',
        }),
      );
  };

  const menuItems = (target: MenuState | null): MenuAction[] => {
    if (!target) return [];
    if (target.kind === 'collection') {
      return [
        {
          label: 'New request',
          icon: 'plus',
          run: () => actions.createRequestNode(target.collectionId, null),
        },
        {
          label: 'New folder',
          icon: 'folder-plus',
          run: () => actions.addFolder(target.collectionId, null, 'New folder'),
        },
        {
          label: 'Rename',
          icon: 'pencil',
          run: () => setEditingId(target.collectionId),
        },
        {
          label: 'Export collection',
          icon: 'download',
          run: () => exportCollection(target.collectionId),
        },
        {
          label: 'Delete collection',
          icon: 'trash',
          danger: true,
          run: () => {
            const collection = state.collections.find(
              (item) => item.id === target.collectionId,
            );
            if (!collection) return;
            if (!window.confirm(`Delete “${collection.name}” and everything in it?`)) return;
            actions.deleteCollection(collection.id);
            notify({ title: 'Collection deleted', tone: 'info' });
          },
        },
      ];
    }

    const { node, collectionId } = target;
    if (node.type === 'folder') {
      return [
        {
          label: 'New request',
          icon: 'plus',
          run: () => actions.createRequestNode(collectionId, node.id),
        },
        {
          label: 'New folder',
          icon: 'folder-plus',
          run: () => actions.addFolder(collectionId, node.id, 'New folder'),
        },
        {
          label: 'Rename',
          icon: 'pencil',
          run: () => setEditingId(node.id),
        },
        {
          label: 'Duplicate',
          icon: 'copy',
          run: () => actions.duplicateNode(collectionId, node.id),
        },
        {
          label: 'Delete folder',
          icon: 'trash',
          danger: true,
          run: () => {
            if (!window.confirm(`Delete the folder “${node.name}” and its requests?`)) return;
            actions.deleteNode(collectionId, node.id);
          },
        },
      ];
    }

    return [
      {
        label: 'Open request',
        icon: 'external',
        run: () => actions.openRequest(collectionId, node),
      },
      {
        label: 'Rename',
        icon: 'pencil',
        run: () => setEditingId(node.id),
      },
      {
        label: 'Duplicate',
        icon: 'copy',
        run: () => actions.duplicateNode(collectionId, node.id),
      },
      {
        label: 'Delete request',
        icon: 'trash',
        danger: true,
        run: () => {
          if (!window.confirm(`Delete “${node.name}”?`)) return;
          actions.deleteNode(collectionId, node.id);
          notify({ title: 'Request deleted', tone: 'info' });
        },
      },
    ];
  };

  const renderNode = (collectionId: string, node: CollectionNode, depth: number): ReactNode => {
    if (node.type === 'folder') {
      const isOpen = !collapsed.has(node.id);
      return (
        <div key={node.id}>
          <div
            className="tree-row tree-folder"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => toggle(node.id)}
            onContextMenu={(event) =>
              openMenu(event, { kind: 'node', collectionId, node })
            }
          >
            <span className="tree-chevron">
              <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
            </span>
            <span className="tree-icon folder">
              <Icon name="folder" size={14} />
            </span>
            {editingId === node.id ? (
              <RenameInput
                value={node.name}
                onCancel={() => setEditingId(null)}
                onCommit={(value) => {
                  setEditingId(null);
                  actions.renameNode(collectionId, node.id, value);
                }}
              />
            ) : (
              <span className="tree-name">{node.name}</span>
            )}
            <span className="tree-badge">{countRequests(node.children ?? [])}</span>
            <span className="tree-actions">
              <IconButton
                icon="ellipsis"
                label={`Actions for ${node.name}`}
                size={13}
                onClick={(event) =>
                  openMenu(event, { kind: 'node', collectionId, node })
                }
              />
            </span>
          </div>
          {isOpen
            ? (node.children ?? []).map((child) => renderNode(collectionId, child, depth + 1))
            : null}
        </div>
      );
    }

    const isSelected =
      state.selected?.collectionId === collectionId &&
      state.selected?.nodeId === node.id;

    return (
      <div
        key={node.id}
        className={cx('tree-row tree-request', isSelected && 'is-selected')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => actions.openRequest(collectionId, node)}
        onContextMenu={(event) =>
          openMenu(event, { kind: 'node', collectionId, node })
        }
      >
        <span className="tree-chevron" />
        <span className={cx('method-tag', methodClass(node.request?.method ?? 'GET'))}>
          {(node.request?.method ?? 'GET').slice(0, 3)}
        </span>
        {editingId === node.id ? (
          <RenameInput
            value={node.name}
            onCancel={() => setEditingId(null)}
            onCommit={(value) => {
              setEditingId(null);
              actions.renameNode(collectionId, node.id, value);
            }}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
        <span className="tree-actions">
          <IconButton
            icon="ellipsis"
            label={`Actions for ${node.name}`}
            size={13}
            onClick={(event) => openMenu(event, { kind: 'node', collectionId, node })}
          />
        </span>
      </div>
    );
  };

  const visibleCollections = useMemo(() => {
    if (!query.trim()) return state.collections;
    return state.collections
      .map((collection) => ({
        ...collection,
        nodes: filterNodes(collection.nodes, query),
      }))
      .filter(
        (collection) =>
          collection.nodes.length > 0 ||
          collection.name.toLowerCase().includes(query.trim().toLowerCase()),
      );
  }, [state.collections, query]);

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <button type="button" className="toolbar-button" onClick={createCollection}>
          <Icon name="plus" size={14} />
          New
        </button>
        <button type="button" className="toolbar-button" onClick={handleImport}>
          <Icon name="upload" size={14} />
          Import
        </button>
      </div>

      {visibleCollections.length === 0 ? (
        <EmptyState
          icon="layers"
          title={state.collections.length === 0 ? 'No collections yet' : 'No matches'}
          description={
            state.collections.length === 0
              ? 'Create a collection or import a Postman file to get going.'
              : 'Try a different search term.'
          }
        >
          {state.collections.length === 0 ? (
            <>
              <button type="button" className="toolbar-button" onClick={createCollection}>
                <Icon name="plus" size={14} />
                New collection
              </button>
              <button type="button" className="toolbar-button" onClick={handleImport}>
                <Icon name="upload" size={14} />
                Import file
              </button>
            </>
          ) : null}
        </EmptyState>
      ) : (
        <div className="tree">
          {visibleCollections.map((collection) => {
            const isOpen = !collapsed.has(collection.id);
            return (
              <div className="collection-block" key={collection.id}>
                <div
                  className="tree-row collection-row"
                  onClick={() => toggle(collection.id)}
                  onContextMenu={(event) =>
                    openMenu(event, { kind: 'collection', collectionId: collection.id })
                  }
                >
                  <span className="tree-chevron">
                    <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
                  </span>
                  <span className="tree-icon collection">
                    <Icon name="layers" size={14} />
                  </span>
                  {editingId === collection.id ? (
                    <RenameInput
                      value={collection.name}
                      onCancel={() => setEditingId(null)}
                      onCommit={(value) => {
                        setEditingId(null);
                        actions.renameCollection(collection.id, value);
                      }}
                    />
                  ) : (
                    <span className="tree-name collection-name">{collection.name}</span>
                  )}
                  <span className="tree-badge">{countRequests(collection.nodes)}</span>
                  <span className="tree-actions">
                    <IconButton
                      icon="ellipsis"
                      label={`Actions for ${collection.name}`}
                      size={13}
                      onClick={(event) =>
                        openMenu(event, {
                          kind: 'collection',
                          collectionId: collection.id,
                        })
                      }
                    />
                  </span>
                </div>
                {isOpen ? (
                  collection.nodes.length === 0 ? (
                    <button
                      type="button"
                      className="tree-hint"
                      onClick={() => actions.createRequestNode(collection.id, null)}
                    >
                      + Add a request
                    </button>
                  ) : (
                    collection.nodes.map((node) => renderNode(collection.id, node, 0))
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ContextMenu state={menu} items={menuItems(menu)} onClose={() => setMenu(null)} />
    </div>
  );
}

function HistoryPanel({ query }: { query: string }) {
  const { state, actions, activeTab } = useStore();
  const { notify } = useToast();

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.history;
    return state.history.filter(
      (entry) =>
        entry.url.toLowerCase().includes(needle) ||
        entry.method.toLowerCase().includes(needle),
    );
  }, [state.history, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>();
    entries.forEach((entry) => {
      const label = dayLabel(entry.at);
      const bucket = groups.get(label) ?? [];
      bucket.push(entry);
      groups.set(label, bucket);
    });
    return Array.from(groups.entries());
  }, [entries]);

  if (state.history.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No history yet"
        description="Requests you send will appear here, ready to replay."
      >
        <button
          type="button"
          className="toolbar-button"
          disabled={!activeTab}
          onClick={() => activeTab && void actions.sendTab(activeTab.id)}
        >
          <Icon name="send" size={14} />
          Send current request
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <span className="muted small">{state.history.length} requests</span>
        <button
          type="button"
          className="toolbar-button"
          onClick={() => {
            if (!window.confirm('Clear the entire request history?')) return;
            actions.clearHistory();
            notify({ title: 'History cleared', tone: 'info' });
          }}
        >
          <Icon name="trash" size={13} />
          Clear
        </button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon="search" title="No matches" description="Nothing in history matches that filter." />
      ) : (
        <div className="history">
          {grouped.map(([label, items]) => (
            <div className="history-group" key={label}>
              <div className="history-day">{label}</div>
              {items.map((entry) => (
                <div
                  key={entry.id}
                  className="history-row"
                  onClick={() => actions.openHistoryEntry(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') actions.openHistoryEntry(entry);
                  }}
                >
                  <span className={cx('method-tag', methodClass(entry.method))}>
                    {entry.method.slice(0, 3)}
                  </span>
                  <div className="history-main">
                    <div className="history-url" title={entry.url}>
                      <span className="history-host">{hostOf(entry.url) || entry.url}</span>
                      <span className="history-path">{pathOf(entry.url)}</span>
                    </div>
                    <div className="history-meta">
                      <span>{formatRelativeTime(entry.at)}</span>
                      {entry.status !== undefined ? (
                        <span className={cx('status-dot', `tone-${statusTone(entry.status)}`)}>
                          {entry.status}
                        </span>
                      ) : (
                        <span className="status-dot tone-none">failed</span>
                      )}
                      {entry.timeMs !== undefined ? <span>{formatMs(entry.timeMs)}</span> : null}
                      {entry.sizeBytes !== undefined ? (
                        <span>{formatBytes(entry.sizeBytes)}</span>
                      ) : null}
                      {entry.environmentName ? (
                        <span className="history-env">{entry.environmentName}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="history-actions">
                    <IconButton
                      icon="trash"
                      label="Remove from history"
                      size={13}
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.removeHistory(entry.id);
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvironmentsPanel({ query }: { query: string }) {
  const { state, actions } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Environment | null>(null);

  const environments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.environments;
    return state.environments.filter((environment) =>
      environment.name.toLowerCase().includes(needle),
    );
  }, [state.environments, query]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <button type="button" className="toolbar-button" onClick={openNew}>
          <Icon name="plus" size={14} />
          New
        </button>
        <span className="muted small">{state.environments.length} saved</span>
      </div>

      {state.environments.length === 0 ? (
        <EmptyState
          icon="globe"
          title="No environments"
          description="Environments hold variables like {{baseUrl}} that you can swap in one click."
        >
          <button type="button" className="toolbar-button" onClick={openNew}>
            <Icon name="plus" size={14} />
            Create environment
          </button>
        </EmptyState>
      ) : (
        <div className="env-list">
          <button
            type="button"
            className={cx('env-row', state.activeEnvironmentId === null && 'is-active')}
            onClick={() => actions.setActiveEnvironment(null)}
          >
            <span className="env-radio">
              {state.activeEnvironmentId === null ? <span className="env-radio-dot" /> : null}
            </span>
            <span className="env-main">
              <span className="env-name">No environment</span>
              <span className="env-meta">Variables stay unresolved</span>
            </span>
          </button>

          {environments.map((environment) => (
            <div
              key={environment.id}
              className={cx(
                'env-row',
                state.activeEnvironmentId === environment.id && 'is-active',
              )}
              role="button"
              tabIndex={0}
              onClick={() => actions.setActiveEnvironment(environment.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') actions.setActiveEnvironment(environment.id);
              }}
            >
              <span className="env-radio">
                {state.activeEnvironmentId === environment.id ? (
                  <span className="env-radio-dot" />
                ) : null}
              </span>
              <span className="env-main">
                <span className="env-name">{environment.name}</span>
                <span className="env-meta">
                  {environment.variables.length} variable
                  {environment.variables.length === 1 ? '' : 's'}
                </span>
              </span>
              <span className="env-actions">
                <IconButton
                  icon="pencil"
                  label={`Edit ${environment.name}`}
                  size={13}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(environment);
                    setModalOpen(true);
                  }}
                />
              </span>
            </div>
          ))}

          {environments.length === 0 ? (
            <div className="muted small panel-note">No environments match that filter.</div>
          ) : null}
        </div>
      )}

      <EnvironmentModal
        open={modalOpen}
        environment={editing}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
