import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  Collection,
  CollectionNode,
  Environment,
  HistoryEntry,
  HttpResponse,
  KeyValue,
  PersistedTab,
  RequestSpec,
  SavedRef,
  Settings,
  SidebarSection,
  TabState,
  WorkspaceFile,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import {
  cancelRequest,
  loadWorkspace,
  saveWorkspace,
  sendRequest,
} from '../lib/api';
import { createEmptyRequest, prepareRequest } from '../lib/request';
import { createSampleWorkspace } from '../lib/sampleWorkspace';
import { duplicateNodeDeep, findNode, insertNode, removeNode, updateNode } from '../lib/tree';
import { deriveRequestName, uid } from '../lib/utils';
import type { ImportResult } from '../lib/postman';
import { useToast } from './toasts';

export interface StoreState {
  ready: boolean;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  settings: Settings;
  tabs: TabState[];
  activeTabId: string | null;
  sidebar: SidebarSection;
  sidebarOpen: boolean;
  selected: SavedRef | null;
}

export type Action =
  | { type: 'hydrate'; workspace: WorkspaceFile }
  | { type: 'sidebar'; section: SidebarSection }
  | { type: 'toggleSidebar' }
  | { type: 'selectTab'; id: string }
  | { type: 'newTab'; tab: TabState; activate: boolean }
  | { type: 'closeTab'; id: string }
  | { type: 'patchTab'; id: string; patch: Partial<TabState> }
  | { type: 'patchDraft'; id: string; patch: Partial<RequestSpec> }
  | { type: 'beginSend'; id: string }
  | { type: 'resolveSend'; id: string; response: HttpResponse }
  | { type: 'failSend'; id: string; error: string }
  | { type: 'saveTabRef'; id: string; nodeId: string; collectionId: string; name: string }
  | { type: 'selectNode'; collectionId: string; nodeId: string }
  | { type: 'addCollection'; collection: Collection }
  | { type: 'updateCollection'; id: string; patch: Partial<Collection> }
  | { type: 'deleteCollection'; id: string }
  | { type: 'addNode'; collectionId: string; parentId: string | null; node: CollectionNode }
  | { type: 'replaceNode'; collectionId: string; nodeId: string; node: CollectionNode }
  | { type: 'patchNode'; collectionId: string; nodeId: string; patch: Partial<CollectionNode> }
  | { type: 'removeTreeNode'; collectionId: string; nodeId: string }
  | { type: 'addEnvironment'; environment: Environment }
  | { type: 'updateEnvironment'; id: string; patch: Partial<Environment> }
  | { type: 'deleteEnvironment'; id: string }
  | { type: 'activeEnvironment'; id: string | null }
  | { type: 'pushHistory'; entry: HistoryEntry }
  | { type: 'removeHistory'; id: string }
  | { type: 'clearHistory' }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'applyImport'; result: ImportResult };

const EMPTY_STATE: StoreState = {
  ready: false,
  collections: [],
  environments: [],
  activeEnvironmentId: null,
  history: [],
  settings: DEFAULT_SETTINGS,
  tabs: [],
  activeTabId: null,
  sidebar: 'collections',
  sidebarOpen: true,
  selected: null,
};

function newTab(
  name = 'Untitled request',
  draft: RequestSpec = createEmptyRequest(),
  savedRef: SavedRef | null = null,
  dirty = false,
): TabState {
  return {
    id: uid(),
    name,
    draft,
    savedRef,
    dirty,
    sending: false,
    startedAt: null,
    response: null,
    error: null,
  };
}

function hydrate(workspace: WorkspaceFile): StoreState {
  const saved = workspace.session;
  let tabs: TabState[] = (saved?.tabs ?? []).map((tab: PersistedTab) => ({
    ...newTab(tab.name, { ...createEmptyRequest(), ...tab.draft }, tab.savedRef, tab.dirty),
    id: tab.id,
  }));

  if (tabs.length === 0) tabs = [newTab()];
  const activeTabId = tabs.some((tab) => tab.id === saved?.activeTabId)
    ? saved.activeTabId
    : tabs[0].id;

  return {
    ...EMPTY_STATE,
    ready: true,
    collections: workspace.collections ?? [],
    environments: workspace.environments ?? [],
    activeEnvironmentId: workspace.activeEnvironmentId ?? null,
    history: workspace.history ?? [],
    settings: { ...DEFAULT_SETTINGS, ...workspace.settings },
    tabs,
    activeTabId,
  };
}

function replaceCollection(
  collections: Collection[],
  id: string,
  updater: (collection: Collection) => Collection,
): Collection[] {
  return collections.map((collection) =>
    collection.id === id
      ? { ...updater(collection), updatedAt: Date.now() }
      : collection,
  );
}

function clearRefs(tabs: TabState[], predicate: (ref: SavedRef) => boolean): TabState[] {
  return tabs.map((tab) =>
    tab.savedRef && predicate(tab.savedRef) ? { ...tab, savedRef: null } : tab,
  );
}

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'hydrate':
      return hydrate(action.workspace);

    case 'sidebar':
      return { ...state, sidebar: action.section, sidebarOpen: true };

    case 'toggleSidebar':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'selectTab':
      return { ...state, activeTabId: action.id };

    case 'newTab':
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeTabId: action.activate ? action.tab.id : state.activeTabId,
      };

    case 'closeTab': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      if (index === -1) return state;
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === action.id) {
        if (tabs.length === 0) {
          const replacement = newTab();
          return { ...state, tabs: [replacement], activeTabId: replacement.id };
        }
        const next = tabs[Math.min(index, tabs.length - 1)];
        activeTabId = next.id;
      }
      return { ...state, tabs, activeTabId };
    }

    case 'patchTab':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id ? { ...tab, ...action.patch } : tab,
        ),
      };

    case 'patchDraft':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? {
                ...tab,
                draft: { ...tab.draft, ...action.patch },
                dirty: true,
              }
            : tab,
        ),
      };

    case 'beginSend':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? {
                ...tab,
                sending: true,
                startedAt: Date.now(),
                response: null,
                error: null,
              }
            : tab,
        ),
      };

    case 'resolveSend':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? {
                ...tab,
                sending: false,
                startedAt: null,
                response: action.response,
                error: null,
              }
            : tab,
        ),
      };

    case 'failSend':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? { ...tab, sending: false, startedAt: null, response: null, error: action.error }
            : tab,
        ),
      };

    case 'saveTabRef':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? {
                ...tab,
                name: action.name,
                dirty: false,
                savedRef: { collectionId: action.collectionId, nodeId: action.nodeId },
              }
            : tab,
        ),
      };

    case 'selectNode':
      return {
        ...state,
        selected: { collectionId: action.collectionId, nodeId: action.nodeId },
      };

    case 'addCollection':
      return { ...state, collections: [...state.collections, action.collection] };

    case 'updateCollection':
      return {
        ...state,
        collections: replaceCollection(state.collections, action.id, (collection) => ({
          ...collection,
          ...action.patch,
        })),
      };

    case 'deleteCollection':
      return {
        ...state,
        collections: state.collections.filter(
          (collection) => collection.id !== action.id,
        ),
        tabs: clearRefs(state.tabs, (ref) => ref.collectionId === action.id),
      };

    case 'addNode':
      return {
        ...state,
        collections: replaceCollection(state.collections, action.collectionId, (collection) => ({
          ...collection,
          nodes: insertNode(collection.nodes, action.parentId, action.node),
        })),
        selected: { collectionId: action.collectionId, nodeId: action.node.id },
      };

    case 'replaceNode':
      return {
        ...state,
        collections: replaceCollection(state.collections, action.collectionId, (collection) => ({
          ...collection,
          nodes: updateNode(collection.nodes, action.nodeId, () => action.node),
        })),
      };

    case 'patchNode':
      return {
        ...state,
        collections: replaceCollection(state.collections, action.collectionId, (collection) => ({
          ...collection,
          nodes: updateNode(collection.nodes, action.nodeId, (node) => ({
            ...node,
            ...action.patch,
          })),
        })),
      };

    case 'removeTreeNode':
      return {
        ...state,
        collections: replaceCollection(state.collections, action.collectionId, (collection) => ({
          ...collection,
          nodes: removeNode(collection.nodes, action.nodeId),
        })),
        tabs: clearRefs(state.tabs, (ref) => ref.nodeId === action.nodeId),
      };

    case 'addEnvironment':
      return {
        ...state,
        environments: [...state.environments, action.environment],
        activeEnvironmentId: state.activeEnvironmentId ?? action.environment.id,
      };

    case 'updateEnvironment':
      return {
        ...state,
        environments: state.environments.map((environment) =>
          environment.id === action.id
            ? { ...environment, ...action.patch }
            : environment,
        ),
      };

    case 'deleteEnvironment':
      return {
        ...state,
        environments: state.environments.filter(
          (environment) => environment.id !== action.id,
        ),
        activeEnvironmentId:
          state.activeEnvironmentId === action.id ? null : state.activeEnvironmentId,
      };

    case 'activeEnvironment':
      return { ...state, activeEnvironmentId: action.id };

    case 'pushHistory':
      return {
        ...state,
        history: [action.entry, ...state.history].slice(0, 250),
      };

    case 'removeHistory':
      return {
        ...state,
        history: state.history.filter((entry) => entry.id !== action.id),
      };

    case 'clearHistory':
      return { ...state, history: [] };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'applyImport':
      if (action.result.kind === 'collection') {
        return {
          ...state,
          collections: [...state.collections, action.result.collection],
        };
      }
      if (action.result.kind === 'environment') {
        return {
          ...state,
          environments: [...state.environments, action.result.environment],
        };
      }
      return hydrate(action.result.workspace);

    default:
      return state;
  }
}

interface SaveTarget {
  collectionId: string;
  parentId: string | null;
  name: string;
  existingNodeId?: string | null;
}

export type { SaveTarget };

export interface StoreActions {
  selectTab: (id: string) => void;
  newRequestTab: (options?: { activate?: boolean }) => void;
  openRequest: (collectionId: string, node: CollectionNode) => void;
  openHistoryEntry: (entry: HistoryEntry) => void;
  closeTab: (id: string) => void;
  patchDraft: (id: string, patch: Partial<RequestSpec>) => void;
  sendTab: (id: string) => Promise<void>;
  cancelTab: (id: string) => Promise<void>;
  saveTab: (id: string, target: SaveTarget) => void;
  createCollection: (name: string) => Collection;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  deleteNode: (collectionId: string, nodeId: string) => void;
  renameNode: (collectionId: string, nodeId: string, name: string) => void;
  duplicateNode: (collectionId: string, nodeId: string) => void;
  addFolder: (collectionId: string, parentId: string | null, name: string) => void;
  createRequestNode: (collectionId: string, parentId: string | null) => void;
  createEnvironment: (name: string) => Environment;
  updateEnvironment: (environment: Environment) => void;
  deleteEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  clearHistory: () => void;
  removeHistory: (id: string) => void;
  applyImport: (result: ImportResult) => void;
  setSidebar: (section: SidebarSection) => void;
  toggleSidebar: () => void;
}

interface StoreContextValue {
  state: StoreState;
  actions: StoreActions;
  activeTab: TabState | null;
  activeEnvironment: Environment | null;
}

const StoreContext = createContext<StoreContextValue | null>(null);

let initialWorkspacePromise: Promise<WorkspaceFile> | null = null;

function loadInitialWorkspace(): Promise<WorkspaceFile> {
  if (!initialWorkspacePromise) {
    initialWorkspacePromise = (async () => {
      const stored = await loadWorkspace();
      return stored ?? createSampleWorkspace();
    })();
  }
  return initialWorkspacePromise;
}

export function toWorkspaceFile(state: StoreState): WorkspaceFile {
  return {
    version: 1,
    collections: state.collections,
    environments: state.environments,
    activeEnvironmentId: state.activeEnvironmentId,
    history: state.history,
    settings: state.settings,
    session: {
      tabs: state.tabs.map<PersistedTab>((tab) => ({
        id: tab.id,
        name: tab.name,
        draft: tab.draft,
        savedRef: tab.savedRef,
        dirty: tab.dirty,
      })),
      activeTabId: state.activeTabId,
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong.';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY_STATE);
  const { notify } = useToast();

  useEffect(() => {
    let cancelled = false;
    loadInitialWorkspace()
      .then((workspace) => {
        if (!cancelled) dispatch({ type: 'hydrate', workspace });
      })
      .catch((error) => {
        if (cancelled) return;
        notify({
          title: 'Could not load your workspace',
          description: `${errorMessage(error)} Starting a fresh one instead.`,
          tone: 'error',
        });
        dispatch({ type: 'hydrate', workspace: createSampleWorkspace() });
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    if (!state.ready) return;
    const snapshot = toWorkspaceFile(state);
    const handle = window.setTimeout(() => {
      saveWorkspace(snapshot).catch((error) => {
        notify({
          title: 'Workspace not saved',
          description: errorMessage(error),
          tone: 'error',
        });
      });
    }, 650);
    return () => window.clearTimeout(handle);
  }, [
    state.ready,
    state.collections,
    state.environments,
    state.activeEnvironmentId,
    state.history,
    state.settings,
    state.tabs,
    state.activeTabId,
    notify,
  ]);

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
    [state.tabs, state.activeTabId],
  );

  const activeEnvironment = useMemo(
    () =>
      state.environments.find(
        (environment) => environment.id === state.activeEnvironmentId,
      ) ?? null,
    [state.environments, state.activeEnvironmentId],
  );

  const openRequest = useCallback((collectionId: string, node: CollectionNode) => {
    if (node.type !== 'request' || !node.request) return;
    const tab = newTab(
      node.name,
      structuredClone(node.request),
      { collectionId, nodeId: node.id },
      false,
    );
    dispatch({ type: 'newTab', tab, activate: true });
    dispatch({ type: 'selectNode', collectionId, nodeId: node.id });
  }, []);

  const actions = useMemo<StoreActions>(() => {
    const sendTab = async (id: string) => {
      const tab = state.tabs.find((candidate) => candidate.id === id);
      if (!tab || tab.sending) return;

      const prepared = prepareRequest(
        tab.draft,
        activeEnvironment,
        state.settings,
        id,
      );

      if (!prepared.input.url) {
        notify({ title: 'Enter a URL before sending', tone: 'warning' });
        return;
      }

      if (prepared.missingVariables.length > 0) {
        notify({
          title: 'Some variables are undefined',
          description: `${prepared.missingVariables
            .map((name) => `{{${name}}}`)
            .join(', ')} will be sent literally.`,
          tone: 'warning',
        });
      }

      dispatch({ type: 'beginSend', id });

      try {
        const response = await sendRequest(prepared.input);
        dispatch({ type: 'resolveSend', id, response });
        dispatch({
          type: 'pushHistory',
          entry: {
            id: uid(),
            at: Date.now(),
            method: tab.draft.method,
            url: prepared.resolvedUrl,
            status: response.status,
            timeMs: response.elapsedMs,
            sizeBytes: response.sizeBytes,
            request: structuredClone(tab.draft),
            environmentName: activeEnvironment?.name,
          },
        });
      } catch (error) {
        const message = errorMessage(error);
        dispatch({ type: 'failSend', id, error: message });
        dispatch({
          type: 'pushHistory',
          entry: {
            id: uid(),
            at: Date.now(),
            method: tab.draft.method,
            url: prepared.resolvedUrl,
            request: structuredClone(tab.draft),
            environmentName: activeEnvironment?.name,
          },
        });
      }
    };

    return {
      selectTab: (id) => dispatch({ type: 'selectTab', id }),

      newRequestTab: (options) => {
        dispatch({
          type: 'newTab',
          tab: newTab(),
          activate: options?.activate ?? true,
        });
      },

      openRequest,

      openHistoryEntry: (entry) => {
        dispatch({
          type: 'newTab',
          tab: newTab(deriveRequestName(entry.url), structuredClone(entry.request), null, false),
          activate: true,
        });
      },

      closeTab: (id) => dispatch({ type: 'closeTab', id }),

      patchDraft: (id, patch) => dispatch({ type: 'patchDraft', id, patch }),

      sendTab,

      cancelTab: async (id) => {
        await cancelRequest(id);
      },

      saveTab: (id, target) => {
        const tab = state.tabs.find((candidate) => candidate.id === id);
        if (!tab) return;
        const nodeId = target.existingNodeId ?? uid();
        const node: CollectionNode = {
          id: nodeId,
          type: 'request',
          name: target.name,
          request: structuredClone(tab.draft),
        };

        if (target.existingNodeId) {
          dispatch({
            type: 'replaceNode',
            collectionId: target.collectionId,
            nodeId,
            node,
          });
        } else {
          dispatch({
            type: 'addNode',
            collectionId: target.collectionId,
            parentId: target.parentId,
            node,
          });
        }

        dispatch({
          type: 'saveTabRef',
          id,
          nodeId,
          collectionId: target.collectionId,
          name: target.name,
        });
        notify({ title: 'Request saved', tone: 'success' });
      },

      createCollection: (name) => {
        const collection: Collection = {
          id: uid(),
          name: name.trim() || 'New collection',
          nodes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        dispatch({ type: 'addCollection', collection });
        return collection;
      },

      deleteCollection: (id) => dispatch({ type: 'deleteCollection', id }),

      renameCollection: (id, name) =>
        dispatch({ type: 'updateCollection', id, patch: { name: name.trim() || 'Untitled' } }),

      deleteNode: (collectionId, nodeId) =>
        dispatch({ type: 'removeTreeNode', collectionId, nodeId }),

      renameNode: (collectionId, nodeId, name) =>
        dispatch({
          type: 'patchNode',
          collectionId,
          nodeId,
          patch: { name: name.trim() || 'Untitled' },
        }),

      duplicateNode: (collectionId, nodeId) => {
        const collection = state.collections.find(
          (candidate) => candidate.id === collectionId,
        );
        const node = collection ? findNode(collection.nodes, nodeId) : null;
        if (!collection || !node) return;
        const clone = duplicateNodeDeep(node);
        dispatch({
          type: 'addNode',
          collectionId,
          parentId: null,
          node: clone,
        });
      },

      addFolder: (collectionId, parentId, name) =>
        dispatch({
          type: 'addNode',
          collectionId,
          parentId,
          node: { id: uid(), type: 'folder', name, children: [] },
        }),

      createRequestNode: (collectionId, parentId) => {
        const node: CollectionNode = {
          id: uid(),
          type: 'request',
          name: 'New request',
          request: createEmptyRequest(),
        };
        dispatch({ type: 'addNode', collectionId, parentId, node });
        dispatch({
          type: 'newTab',
          tab: newTab(
            node.name,
            structuredClone(node.request!),
            { collectionId, nodeId: node.id },
            false,
          ),
          activate: true,
        });
      },

      createEnvironment: (name) => {
        const environment: Environment = {
          id: uid(),
          name: name.trim() || 'New environment',
          variables: [],
        };
        dispatch({ type: 'addEnvironment', environment });
        return environment;
      },

      updateEnvironment: (environment) =>
        dispatch({
          type: 'updateEnvironment',
          id: environment.id,
          patch: { name: environment.name, variables: environment.variables },
        }),

      deleteEnvironment: (id) => dispatch({ type: 'deleteEnvironment', id }),

      setActiveEnvironment: (id) => dispatch({ type: 'activeEnvironment', id }),

      updateSettings: (patch) => dispatch({ type: 'updateSettings', patch }),

      clearHistory: () => dispatch({ type: 'clearHistory' }),

      removeHistory: (id) => dispatch({ type: 'removeHistory', id }),

      applyImport: (result) => {
        dispatch({ type: 'applyImport', result });
        notify({
          title:
            result.kind === 'workspace'
              ? 'Workspace restored'
              : result.kind === 'collection'
                ? `Imported “${result.collection.name}”`
                : `Imported environment “${result.environment.name}”`,
          tone: 'success',
        });
      },

      setSidebar: (section) => dispatch({ type: 'sidebar', section }),

      toggleSidebar: () => dispatch({ type: 'toggleSidebar' }),
    };
  }, [state, activeEnvironment, notify, openRequest]);

  const value = useMemo<StoreContextValue>(
    () => ({ state, actions, activeTab, activeEnvironment }),
    [state, actions, activeTab, activeEnvironment],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider');
  return context;
}

export function emptyKeyValue(): KeyValue {
  return { id: uid(), key: '', value: '', enabled: true };
}
