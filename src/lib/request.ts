import {
  DEFAULT_AUTH,
  type Environment,
  type HttpBodyInput,
  type PreparedRequest,
  type RequestSpec,
  type Settings,
} from '../types';
import { emptyRow, normalizeUrl, safeBase64 } from './utils';
import { environmentMap, resolveTemplate } from './variables';

export function createEmptyRequest(overrides: Partial<RequestSpec> = {}): RequestSpec {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    bodyMode: 'none',
    body: '',
    formFields: [],
    auth: { ...DEFAULT_AUTH },
    ...overrides,
  };
}

export function buildUrlPreview(
  url: string,
  params: RequestSpec['params'],
  environment: Environment | null,
): string {
  const variables = environmentMap(environment);
  const resolvedUrl = normalizeUrl(resolveTemplate(url, variables).value);
  if (!resolvedUrl) return '';

  const pairs = params
    .filter((param) => param.enabled && param.key.trim())
    .map((param) => {
      const key = resolveTemplate(param.key, variables).value;
      const value = resolveTemplate(param.value, variables).value;
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    });

  if (pairs.length === 0) return resolvedUrl;

  const hashIndex = resolvedUrl.indexOf('#');
  const fragment = hashIndex >= 0 ? resolvedUrl.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? resolvedUrl.slice(0, hashIndex) : resolvedUrl;
  const separator = base.includes('?')
    ? base.endsWith('?') || base.endsWith('&')
      ? ''
      : '&'
    : '?';

  return `${base}${separator}${pairs.join('&')}${fragment}`;
}

export function prepareRequest(
  draft: RequestSpec,
  environment: Environment | null,
  settings: Settings,
  requestId: string,
): PreparedRequest {
  const variables = environmentMap(environment);
  const missing = new Set<string>();

  const resolve = (template: string): string => {
    const result = resolveTemplate(template, variables);
    result.missing.forEach((name) => missing.add(name));
    return result.value;
  };

  const headers: PreparedRequest['input']['headers'] = [];

  draft.headers
    .filter((header) => header.enabled && header.key.trim())
    .forEach((header) => {
      headers.push({
        key: resolve(header.key).trim(),
        value: resolve(header.value),
        enabled: true,
      });
    });

  const auth = draft.auth;
  if (auth.type !== 'none') {
    for (let index = headers.length - 1; index >= 0; index -= 1) {
      if (headers[index].key.toLowerCase() === 'authorization') headers.splice(index, 1);
    }
  }

  const queryPairs: { key: string; value: string }[] = [];

  draft.params
    .filter((param) => param.enabled && param.key.trim())
    .forEach((param) => {
      queryPairs.push({ key: resolve(param.key), value: resolve(param.value) });
    });

  if (auth.type === 'bearer') {
    const token = resolve(auth.token).trim();
    if (token) headers.push({ key: 'Authorization', value: `Bearer ${token}`, enabled: true });
  } else if (auth.type === 'basic') {
    const username = resolve(auth.username);
    const password = resolve(auth.password);
    if (username || password) {
      headers.push({
        key: 'Authorization',
        value: `Basic ${safeBase64(`${username}:${password}`)}`,
        enabled: true,
      });
    }
  } else if (auth.type === 'apikey' && auth.key.trim()) {
    const key = resolve(auth.key).trim();
    const value = resolve(auth.value);
    if (auth.addTo === 'query') {
      queryPairs.push({ key, value });
    } else {
      headers.push({ key, value, enabled: true });
    }
  }

  let resolvedUrl = normalizeUrl(resolve(draft.url).trim());
  if (resolvedUrl && queryPairs.length > 0) {
    const hashIndex = resolvedUrl.indexOf('#');
    const fragment = hashIndex >= 0 ? resolvedUrl.slice(hashIndex) : '';
    const base = hashIndex >= 0 ? resolvedUrl.slice(0, hashIndex) : resolvedUrl;
    const separator = base.includes('?')
      ? base.endsWith('?') || base.endsWith('&')
        ? ''
        : '&'
      : '?';
    const query = queryPairs
      .map(
        (pair) =>
          `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value)}`,
      )
      .join('&');
    resolvedUrl = `${base}${separator}${query}${fragment}`;
  }

  let body: HttpBodyInput = { mode: 'none' };
  const methodAllowsBody = draft.method !== 'GET' && draft.method !== 'HEAD';

  if (methodAllowsBody) {
    if (draft.bodyMode === 'json' || draft.bodyMode === 'text') {
      const content = resolve(draft.body);
      body = { mode: 'raw', content };
      const hasContentType = headers.some(
        (header) => header.key.toLowerCase() === 'content-type',
      );
      if (!hasContentType) {
        headers.push({
          key: 'Content-Type',
          value: draft.bodyMode === 'json' ? 'application/json' : 'text/plain',
          enabled: true,
        });
      }
    } else if (draft.bodyMode === 'urlencoded' || draft.bodyMode === 'formdata') {
      const params = draft.formFields.map((field) => ({
        ...field,
        key: resolve(field.key),
        value: resolve(field.value),
      }));
      body = { mode: draft.bodyMode, params };
    }
  }

  return {
    input: {
      requestId,
      method: draft.method,
      url: resolvedUrl,
      headers,
      body,
      timeoutMs: settings.timeoutMs,
      followRedirects: settings.followRedirects,
      verifyTls: settings.verifyTls,
      cookieJar: settings.cookieJar,
      proxy: settings.proxy.trim() ? settings.proxy.trim() : null,
    },
    resolvedUrl,
    missingVariables: Array.from(missing),
    headerCount: headers.length,
  };
}

export function ensureRow(rows: RequestSpec['headers']): RequestSpec['headers'] {
  return rows.length > 0 ? rows : [emptyRow()];
}
