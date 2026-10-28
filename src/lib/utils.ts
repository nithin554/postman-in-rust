import type { HttpMethod, KeyValue, ResponseHeader } from '../types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function emptyRow(overrides: Partial<KeyValue> = {}): KeyValue {
  return { id: uid(), key: '', value: '', enabled: true, ...overrides };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  if (delta < 45_000) return 'just now';
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatClockWithSeconds(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function statusTone(status: number | undefined): string {
  if (status === undefined) return 'none';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'info';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'danger';
  return 'none';
}

export function methodClass(method: HttpMethod | string): string {
  const lowered = method.toLowerCase();
  if (
    ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(
      lowered,
    )
  ) {
    return `method-${lowered}`;
  }
  return 'method-get';
}

export function hostOf(url: string): string {
  const match = url.match(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/([^/?#]+)/);
  return match ? match[1] : '';
}

export function pathOf(url: string): string {
  const withoutScheme = url.replace(
    /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/[^/?#]*/,
    '',
  );
  return withoutScheme || '/';
}

export function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) return value;
  const isLocal =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(value);
  return `${isLocal ? 'http' : 'https'}://${value}`;
}

export function prettyJson(source: string): string | null {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return null;
  }
}

export function isJsonValue(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function contentTypeFamily(
  contentType: string,
): 'json' | 'xml' | 'html' | 'image' | 'text' | 'binary' {
  const value = contentType.toLowerCase();
  if (value.includes('json')) return 'json';
  if (value.includes('html')) return 'html';
  if (value.includes('xml') || value.includes('svg')) return 'xml';
  if (value.startsWith('image/')) return 'image';
  if (
    value.startsWith('text/') ||
    value.includes('javascript') ||
    value.includes('graphql')
  ) {
    return 'text';
  }
  return 'binary';
}

export function languageFor(
  contentType: string,
  body: string,
): 'json' | 'xml' | 'html' | 'plain' {
  const family = contentTypeFamily(contentType);
  if (family === 'json' || isJsonValue(body)) return 'json';
  if (family === 'html') return 'html';
  if (family === 'xml') return 'xml';
  return 'plain';
}

export function base64ToDataUrl(base64: string, contentType: string): string {
  return `data:${contentType || 'application/octet-stream'};base64,${base64}`;
}

export function textToDataUrl(text: string, contentType: string): string {
  return `data:${contentType || 'text/plain'};charset=utf-8,${encodeURIComponent(text)}`;
}

export function safeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function decodeBody(
  body: string,
  encoding: 'text' | 'base64',
): Uint8Array {
  if (encoding === 'base64') {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new TextEncoder().encode(body);
}

export function headerValue(
  headers: ResponseHeader[],
  name: string,
): string {
  const match = headers.find(
    (header) => header.key.toLowerCase() === name.toLowerCase(),
  );
  return match?.value ?? '';
}

export function deriveRequestName(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const last = decodeURIComponent(segments[segments.length - 1]);
      return last.length > 42 ? `${last.slice(0, 39)}…` : last;
    }
    return parsed.hostname;
  } catch {
    return 'Untitled request';
  }
}

export function tabLabel(tab: { name: string; draft: { url: string } }): string {
  if (tab.name && tab.name !== 'Untitled request') return tab.name;
  if (tab.draft.url.trim()) return deriveRequestName(tab.draft.url);
  return 'Untitled request';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      return copied;
    } catch {
      return false;
    }
  }
}

export function downloadBlob(
  filename: string,
  contents: BlobPart | Uint8Array,
  type: string,
): void {
  const part = contents instanceof Uint8Array ? new Uint8Array(contents) : contents;
  const blob = new Blob([part], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function filenameForResponse(
  contentType: string,
  status: number,
): string {
  const family = contentTypeFamily(contentType);
  const extension =
    family === 'json'
      ? 'json'
      : family === 'html'
        ? 'html'
        : family === 'xml'
          ? 'xml'
          : family === 'image'
            ? contentType.split('/')[1]?.split(';')[0] || 'png'
            : 'txt';
  return `response-${status}.${extension}`;
}

export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
