import { invoke } from '@tauri-apps/api/core';
import type {
  AppInfo,
  HttpRequestInput,
  HttpResponse,
  WorkspaceFile,
} from '../types';
import {
  bytesToBase64,
  contentTypeFamily,
  downloadBlob,
} from './utils';

export const IS_TAURI =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const WORKSPACE_KEY = 'courier.workspace.v1';
const browserControllers = new Map<string, AbortController>();
const browserCancelled = new Set<string>();

export interface ImportedFile {
  name: string;
  path: string;
  contents: string;
}

export async function loadWorkspace(): Promise<WorkspaceFile | null> {
  if (IS_TAURI) {
    const workspace = await invoke<WorkspaceFile | null>('load_workspace');
    return workspace ?? null;
  }

  const raw = localStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as WorkspaceFile;
}

export async function saveWorkspace(workspace: WorkspaceFile): Promise<void> {
  if (IS_TAURI) {
    await invoke('save_workspace', { workspace });
    return;
  }
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

export async function sendRequest(input: HttpRequestInput): Promise<HttpResponse> {
  if (IS_TAURI) {
    return invoke<HttpResponse>('send_request', { input });
  }
  return browserSendRequest(input);
}

export async function cancelRequest(requestId: string): Promise<void> {
  browserCancelled.add(requestId);
  browserControllers.get(requestId)?.abort();

  if (IS_TAURI) {
    try {
      await invoke('cancel_request', { requestId });
    } catch {
      // The request may have already finished.
    }
  }
}

export async function clearCookies(): Promise<void> {
  if (!IS_TAURI) return;
  await invoke('clear_cookies');
}

export async function importJsonFile(): Promise<ImportedFile | null> {
  if (IS_TAURI) {
    return invoke<ImportedFile | null>('import_json_file');
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    let settled = false;
    const finish = (result: ImportedFile | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      resolve(result);
    };

    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 600);
    };

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      const contents = await file.text();
      finish({ name: file.name, path: file.name, contents });
    });

    window.addEventListener('focus', onFocus);
    input.click();
  });
}

export async function exportJsonFile(
  defaultName: string,
  contents: string,
): Promise<string | null> {
  if (IS_TAURI) {
    return invoke<string | null>('export_json_file', {
      defaultName,
      contents,
    });
  }

  downloadBlob(defaultName, contents, 'application/json');
  return defaultName;
}

export async function getAppInfo(): Promise<AppInfo> {
  if (IS_TAURI) {
    return invoke<AppInfo>('app_info');
  }
  return {
    name: 'Courier',
    version: '0.1.0',
    runtime: 'Browser preview',
    platform: 'web',
    arch: navigator.platform || 'browser',
  };
}

function browserBody(input: HttpRequestInput): BodyInit | undefined {
  if (input.method === 'GET' || input.method === 'HEAD') return undefined;

  switch (input.body.mode) {
    case 'raw':
      return input.body.content;
    case 'urlencoded': {
      const params = new URLSearchParams();
      input.body.params
        .filter((param) => param.enabled && param.key)
        .forEach((param) => params.append(param.key, param.value));
      return params;
    }
    case 'formdata': {
      const form = new FormData();
      input.body.params
        .filter((param) => param.enabled && param.key)
        .forEach((param) => form.append(param.key, param.value));
      return form;
    }
    default:
      return undefined;
  }
}

async function browserSendRequest(input: HttpRequestInput): Promise<HttpResponse> {
  const controller = new AbortController();
  browserControllers.set(input.requestId, controller);

  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);

  const headers: Record<string, string> = {};
  input.headers
    .filter((header) => header.enabled && header.key)
    .forEach((header) => {
      if (input.body.mode === 'formdata' && header.key.toLowerCase() === 'content-type') {
        return;
      }
      headers[header.key] = headers[header.key]
        ? `${headers[header.key]}, ${header.value}`
        : header.value;
    });

  const body = browserBody(input);
  const startedAt = performance.now();

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers,
      body,
      signal: controller.signal,
      redirect: input.followRedirects ? 'follow' : 'manual',
      credentials: input.cookieJar ? 'include' : 'omit',
    });

    const buffer = await response.arrayBuffer();
    const elapsedMs = performance.now() - startedAt;
    const bytes = new Uint8Array(buffer);
    const contentType = response.headers.get('content-type') ?? '';
    const family = contentTypeFamily(contentType);

    let bodyText = '';
    let bodyEncoding: 'text' | 'base64' = 'text';
    const textual =
      family === 'json' ||
      family === 'text' ||
      family === 'html' ||
      family === 'xml' ||
      contentType === '';

    if (textual) {
      try {
        bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        bodyText = bytesToBase64(bytes);
        bodyEncoding = 'base64';
      }
    } else {
      bodyText = bytesToBase64(bytes);
      bodyEncoding = 'base64';
    }

    const responseHeaders: HttpResponse['headers'] = [];
    response.headers.forEach((value, key) => {
      responseHeaders.push({ key, value });
    });

    return {
      requestId: input.requestId,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: bodyText,
      bodyEncoding,
      sizeBytes: bytes.byteLength,
      elapsedMs,
      contentType,
      finalUrl: response.url,
      httpVersion: '',
      truncated: false,
    };
  } catch (error) {
    if (browserCancelled.has(input.requestId) && !timedOut) {
      throw new Error('The request was cancelled.');
    }
    if (timedOut) {
      throw new Error(
        `The request timed out after ${Math.round(input.timeoutMs / 1000)} seconds.`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network request failed: ${message}. The browser preview can be blocked by CORS — the desktop app has no such limits.`,
    );
  } finally {
    window.clearTimeout(timeout);
    browserControllers.delete(input.requestId);
    browserCancelled.delete(input.requestId);
  }
}
