export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type BodyMode = 'none' | 'json' | 'text' | 'urlencoded' | 'formdata';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export type AccentId = 'ember' | 'violet' | 'teal' | 'rose' | 'azure';

export type ThemeMode = 'dark' | 'light' | 'system';

export type FontSize = 'compact' | 'comfortable' | 'large';

export type SidebarSection = 'collections' | 'history' | 'environments';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  secret?: boolean;
}

export interface AuthConfig {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  key: string;
  value: string;
  addTo: 'header' | 'query';
}

export interface RequestSpec {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  formFields: KeyValue[];
  auth: AuthConfig;
}

export interface SavedRef {
  collectionId: string;
  nodeId: string;
}

export interface CollectionNode {
  id: string;
  type: 'folder' | 'request';
  name: string;
  children?: CollectionNode[];
  request?: RequestSpec;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  nodes: CollectionNode[];
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: HttpMethod;
  url: string;
  status?: number;
  timeMs?: number;
  sizeBytes?: number;
  request: RequestSpec;
  environmentName?: string;
}

export interface Settings {
  theme: ThemeMode;
  accent: AccentId;
  fontSize: FontSize;
  timeoutMs: number;
  followRedirects: boolean;
  verifyTls: boolean;
  cookieJar: boolean;
  wordWrap: boolean;
  proxy: string;
}

export interface PersistedTab {
  id: string;
  name: string;
  draft: RequestSpec;
  savedRef: SavedRef | null;
  dirty: boolean;
}

export interface SessionState {
  tabs: PersistedTab[];
  activeTabId: string | null;
}

export interface WorkspaceFile {
  version: 1;
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  settings: Settings;
  session: SessionState;
}

export interface TabState {
  id: string;
  name: string;
  draft: RequestSpec;
  savedRef: SavedRef | null;
  dirty: boolean;
  sending: boolean;
  startedAt: number | null;
  response: HttpResponse | null;
  error: string | null;
}

export interface ResponseHeader {
  key: string;
  value: string;
}

export interface HttpResponse {
  requestId: string;
  status: number;
  statusText: string;
  headers: ResponseHeader[];
  body: string;
  bodyEncoding: 'text' | 'base64';
  sizeBytes: number;
  elapsedMs: number;
  contentType: string;
  finalUrl: string;
  httpVersion: string;
  truncated: boolean;
}

export type HttpBodyInput =
  | { mode: 'none' }
  | { mode: 'raw'; content: string }
  | { mode: 'urlencoded'; params: KeyValue[] }
  | { mode: 'formdata'; params: KeyValue[] };

export interface HttpRequestInput {
  requestId: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: HttpBodyInput;
  timeoutMs: number;
  followRedirects: boolean;
  verifyTls: boolean;
  cookieJar: boolean;
  proxy: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  runtime: string;
  platform: string;
  arch: string;
}

export interface PreparedRequest {
  input: HttpRequestInput;
  resolvedUrl: string;
  missingVariables: string[];
  headerCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'ember',
  fontSize: 'comfortable',
  timeoutMs: 30_000,
  followRedirects: true,
  verifyTls: true,
  cookieJar: true,
  wordWrap: true,
  proxy: '',
};

export const DEFAULT_AUTH: AuthConfig = {
  type: 'none',
  token: '',
  username: '',
  password: '',
  key: '',
  value: '',
  addTo: 'header',
};
