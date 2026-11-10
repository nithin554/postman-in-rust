// Tolerant cURL command parser — powers "paste curl in the URL bar" like Postman.
import type { AuthConfig, BodyMode, RequestSpec } from "../types";
import { emptyRow } from "./utils";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      if (ch === 'n') token += '\n';
      else if (ch === 't') token += '\t';
      else if (ch === 'r') token += '\r';
      else token += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else token += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (token) tokens.push(token);
      token = '';
      continue;
    }
    token += ch;
  }
  if (token) tokens.push(token);
  return tokens;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export interface ParsedCurl {
  method: string;
  url: string;
  headers: RequestSpec['headers'];
  params: RequestSpec['params'];
  queryInUrl?: { key: string; value: string }[];
  bodyMode: BodyMode;
  body: string;
  formFields: RequestSpec['formFields'];
  auth: Partial<AuthConfig>;
}

export function parseCurl(command: string): ParsedCurl | null {
  const text = command.trim();
  if (!/^curl(\s|$)/i.test(text)) return null;

  const tokens = tokenize(text);
  const headers: RequestSpec['headers'] = [];
  const formFields: RequestSpec['formFields'] = [];
  let method = '';
  let url = '';
  let body = '';
  let bodyMode: BodyMode = 'none';
  let sawRawData = false;
  let user = '';
  let queryPairs: { key: string; value: string }[] | undefined;

  const urlArgs: string[] = [];
  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || '').toUpperCase();
    } else if (token.startsWith('-X') && token.length > 2 && !token.startsWith('--')) {
      method = token.slice(2).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const header = tokens[++i];
      if (header) {
        const idx = header.indexOf(':');
        if (idx === -1) {
          if (header.startsWith('-')) headers.push(emptyRow({ key: header.slice(1), value: '', enabled: false }));
        } else {
          headers.push(
            emptyRow({ key: header.slice(0, idx).trim(), value: header.slice(idx + 1).trim() }),
          );
        }
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-ascii' || token === '--data-binary') {
      body = tokens[++i] ?? '';
      sawRawData = true;
    } else if (token === '--json') {
      body = tokens[++i] ?? '';
      sawRawData = true;
      if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
        headers.push(emptyRow({ key: 'Content-Type', value: 'application/json' }));
      }
    } else if (token === '-F' || token === '--form') {
      const form = tokens[++i] ?? '';
      const eq = form.indexOf('=');
      if (eq > 0) {
        formFields.push(emptyRow({ key: form.slice(0, eq), value: form.slice(eq + 1) }));
        bodyMode = 'formdata';
      }
    } else if (token === '-u' || token === '--user') {
      user = tokens[++i] ?? '';
    } else if (token === '--url') {
      urlArgs.push(tokens[++i] ?? '');
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      urlArgs.push(token);
    } else if (!token.startsWith('-') && url === '' && /^\[?[a-z0-9.-]+\]?([/:]|$)/i.test(token) === true && token.includes('.')) {
      // bare host-ish argument (curl assumes http://)
      urlArgs.push(token);
    } else if (token === '-G' || token === '--get' || token === '-k' || token === '--insecure' || token === '-L' || token === '--location' || token === '-s' || token === '--silent' || token === '-v' || token === '--verbose' || token === '--compressed' || token === '-i' || token === '--include') {
      // flags we intentionally ignore
    } else if (token.startsWith('--')) {
      i++; // skip the value of unknown long flags
    } else if (token.startsWith('-') && token.length === 2) {
      i++; // skip the value of unknown short flags
    }

    i++;
  }

  if (urlArgs.length > 0) url = urlArgs[0];

  if (sawRawData) {
    if (looksLikeJson(body)) {
      bodyMode = 'json';
      if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
        headers.push(emptyRow({ key: 'Content-Type', value: 'application/json' }));
      }
    } else {
      bodyMode = 'text';
    }
  } else if (bodyMode === 'none' && body) {
    bodyMode = 'text';
  }

  // Split query string out of the URL into params, like Postman does.
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    const query = url.slice(queryIndex + 1);
    url = url.slice(0, queryIndex);
    if (query.includes('=')) {
      queryPairs = query
        .split('&')
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf('=');
          let key = eq >= 0 ? pair.slice(0, eq) : pair;
          let value = eq >= 0 ? pair.slice(eq + 1) : '';
          try {
            key = decodeURIComponent(key.replace(/\+/g, ' '));
            value = decodeURIComponent(value.replace(/\+/g, ' '));
          } catch {
            // keep raw values when decoding fails
          }
          return { key, value };
        });
    }
  }

  const auth: Partial<AuthConfig> = {};
  if (user && user.includes(':')) {
    const idx = user.indexOf(':');
    auth.type = 'basic';
    auth.username = user.slice(0, idx);
    auth.password = user.slice(idx + 1);
  }

  if (!url) return null;
  if (!method) {
    // curl defaults to GET, POST when a body is present.
    method = body ? 'POST' : 'GET';
  }

  return {
    method,
    url,
    headers,
    params: queryPairs ? queryPairs.map((p) => emptyRow(p)) : [],
    bodyMode,
    body,
    formFields,
    auth,
  };
}
