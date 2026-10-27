import {
  HTTP_METHODS,
  type AuthConfig,
  type Collection,
  type CollectionNode,
  type Environment,
  type HttpMethod,
  type KeyValue,
  type RequestSpec,
  type WorkspaceFile,
} from '../types';
import { createEmptyRequest } from './request';
import { uid } from './utils';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function rowsFrom(value: unknown): KeyValue[] {
  return asArray(value).flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    return [
      {
        id: uid(),
        key: str(record.key),
        value: str(record.value),
        enabled: record.disabled !== true && record.enabled !== false,
        description: str(record.description) || undefined,
      },
    ];
  });
}

function headerValue(headers: KeyValue[], name: string): string {
  return (
    headers.find(
      (header) => header.enabled && header.key.toLowerCase() === name.toLowerCase(),
    )?.value ?? ''
  );
}

function parsePostmanUrl(raw: unknown): { url: string; params: KeyValue[] } {
  if (typeof raw === 'string') return { url: raw, params: [] };

  const record = asRecord(raw);
  if (!record) return { url: '', params: [] };

  const params = rowsFrom(record.query);
  let url = str(record.raw).trim();

  if (!url) {
    const protocol = str(record.protocol);
    const host = asArray(record.host).map((part) => str(part)).join('.');
    const path = asArray(record.path).map((part) => str(part)).join('/');
    if (host) {
      url = `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}`;
    }
  }

  return { url, params };
}

function parseAuth(raw: unknown): AuthConfig {
  const auth = createEmptyRequest().auth;
  const record = asRecord(raw);
  if (!record) return auth;

  const type = str(record.type, 'noauth');
  const entries = asArray(record[type]);
  const entry = (name: string): string => {
    const found = entries
      .map(asRecord)
      .find((item) => item && str(item.key) === name);
    return found ? str(found.value) : '';
  };

  if (type === 'bearer') return { ...auth, type: 'bearer', token: entry('token') };
  if (type === 'basic') {
    return {
      ...auth,
      type: 'basic',
      username: entry('username'),
      password: entry('password'),
    };
  }
  if (type === 'apikey') {
    return {
      ...auth,
      type: 'apikey',
      key: entry('key'),
      value: entry('value'),
      addTo: entry('in') === 'query' ? 'query' : 'header',
    };
  }
  return auth;
}

function parseBody(
  raw: unknown,
  headers: KeyValue[],
): Pick<RequestSpec, 'bodyMode' | 'body' | 'formFields'> {
  const record = asRecord(raw);
  if (!record) return { bodyMode: 'none', body: '', formFields: [] };

  const mode = str(record.mode);

  if (mode === 'raw') {
    const options = asRecord(record.options);
    const rawOptions = asRecord(options?.raw);
    const language = str(rawOptions?.language).toLowerCase();
    const contentType = headerValue(headers, 'content-type').toLowerCase();
    const isJson =
      language === 'json' ||
      contentType.includes('json') ||
      (!language && looksLikeJson(str(record.raw)));
    return {
      bodyMode: isJson ? 'json' : 'text',
      body: str(record.raw),
      formFields: [],
    };
  }

  if (mode === 'urlencoded') {
    return {
      bodyMode: 'urlencoded',
      body: '',
      formFields: rowsFrom(record.urlencoded),
    };
  }

  if (mode === 'formdata') {
    return {
      bodyMode: 'formdata',
      body: '',
      formFields: rowsFrom(record.formdata),
    };
  }

  if (mode === 'graphql') {
    const graphql = asRecord(record.graphql);
    const variables = str(graphql?.variables).trim();
    let parsedVariables: unknown = {};
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch {
        parsedVariables = {};
      }
    }
    return {
      bodyMode: 'json',
      body: JSON.stringify(
        { query: str(graphql?.query), variables: parsedVariables },
        null,
        2,
      ),
      formFields: [],
    };
  }

  return { bodyMode: 'none', body: '', formFields: [] };
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function parseMethod(value: unknown): HttpMethod {
  const method = str(value, 'GET').toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(method)
    ? (method as HttpMethod)
    : 'GET';
}

function parseItem(raw: unknown): CollectionNode | null {
  const item = asRecord(raw);
  if (!item) return null;

  const name = str(item.name, 'Untitled');
  const requestRaw = item.request;

  if (requestRaw !== undefined) {
    const request = asRecord(requestRaw);
    const { url, params } = parsePostmanUrl(request?.url);
    const headers = rowsFrom(request?.header);
    const body = parseBody(request?.body, headers);

    return {
      id: uid(),
      type: 'request',
      name,
      request: {
        method: parseMethod(request?.method),
        url,
        params,
        headers,
        auth: parseAuth(request?.auth),
        ...body,
      },
    };
  }

  if (Array.isArray(item.item)) {
    return {
      id: uid(),
      type: 'folder',
      name,
      children: item.item
        .map(parseItem)
        .filter((node): node is CollectionNode => node !== null),
    };
  }

  return null;
}

export function collectionFromPostman(raw: unknown): Collection | null {
  const record = asRecord(raw);
  if (!record) return null;

  const info = asRecord(record.info);
  const items = asArray(record.item);
  if (!info && !Array.isArray(record.item)) return null;

  const now = Date.now();
  return {
    id: uid(),
    name: str(info?.name, 'Imported collection'),
    description: str(info?.description) || undefined,
    nodes: items
      .map(parseItem)
      .filter((node): node is CollectionNode => node !== null),
    createdAt: now,
    updatedAt: now,
  };
}

export function environmentFromPostman(raw: unknown): Environment | null {
  const record = asRecord(raw);
  if (!record) return null;

  const values = record.values;
  if (!Array.isArray(values)) return null;

  return {
    id: uid(),
    name: str(record.name, 'Imported environment'),
    variables: rowsFrom(values),
  };
}

export type ImportResult =
  | { kind: 'collection'; collection: Collection }
  | { kind: 'environment'; environment: Environment }
  | { kind: 'workspace'; workspace: WorkspaceFile };

export function parseImportFile(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const record = asRecord(raw);
  if (!record) throw new Error('Unrecognised file: expected a JSON object.');

  if (record.version === 1 && Array.isArray(record.collections) && Array.isArray(record.environments)) {
    return { kind: 'workspace', workspace: raw as WorkspaceFile };
  }

  if (Array.isArray(record.values)) {
    const environment = environmentFromPostman(raw);
    if (environment) return { kind: 'environment', environment };
  }

  if (record.info || Array.isArray(record.item)) {
    const collection = collectionFromPostman(raw);
    if (collection) return { kind: 'collection', collection };
  }

  throw new Error(
    'Unrecognised file. Courier can import Postman v2.1 collections, Postman environments, and Courier workspaces.',
  );
}

function serializeUrl(request: RequestSpec): Json {
  const url = request.url.trim();
  return {
    raw: url,
    query: request.params.map((param) => ({
      key: param.key,
      value: param.value,
      disabled: !param.enabled,
    })),
  };
}

function serializeAuth(auth: AuthConfig): Json {
  switch (auth.type) {
    case 'bearer':
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: auth.token, type: 'string' }],
      };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username, type: 'string' },
          { key: 'password', value: auth.password, type: 'string' },
        ],
      };
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.key, type: 'string' },
          { key: 'value', value: auth.value, type: 'string' },
          { key: 'in', value: auth.addTo, type: 'string' },
        ],
      };
    default:
      return { type: 'noauth' };
  }
}

function serializeBody(request: RequestSpec): Json | undefined {
  if (request.bodyMode === 'none') return undefined;
  if (request.bodyMode === 'json' || request.bodyMode === 'text') {
    return {
      mode: 'raw',
      raw: request.body,
      options: { raw: { language: request.bodyMode === 'json' ? 'json' : 'text' } },
    };
  }
  return {
    mode: request.bodyMode,
    [request.bodyMode]: request.formFields.map((field) => ({
      key: field.key,
      value: field.value,
      type: 'text',
      disabled: !field.enabled,
    })),
  };
}

function serializeNode(node: CollectionNode): Json {
  if (node.type === 'folder') {
    return {
      name: node.name,
      item: (node.children ?? []).map(serializeNode),
    };
  }

  const request = node.request ?? createEmptyRequest();
  return {
    name: node.name,
    request: {
      method: request.method,
      header: request.headers.map((header) => ({
        key: header.key,
        value: header.value,
        type: 'text',
        disabled: !header.enabled,
      })),
      url: serializeUrl(request),
      body: serializeBody(request),
      auth: serializeAuth(request.auth),
    },
    response: [],
  };
}

export function collectionToPostman(collection: Collection): string {
  return JSON.stringify(
    {
      info: {
        _postman_id: collection.id,
        name: collection.name,
        description: collection.description ?? '',
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: collection.nodes.map(serializeNode),
    },
    null,
    2,
  );
}

export function environmentToPostman(environment: Environment): string {
  return JSON.stringify(
    {
      id: environment.id,
      name: environment.name,
      values: environment.variables.map((variable) => ({
        key: variable.key,
        value: variable.value,
        type: 'default',
        enabled: variable.enabled,
      })),
      _postman_variable_scope: 'environment',
    },
    null,
    2,
  );
}

export function workspaceToJson(workspace: WorkspaceFile): string {
  return JSON.stringify(workspace, null, 2);
}

export function slugifyFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'courier-export';
}
