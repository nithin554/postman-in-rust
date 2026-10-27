import type { PreparedRequest } from '../types';

export type SnippetLanguage = 'curl' | 'javascript' | 'python' | 'rust';

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
];

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function bodyPairs(input: PreparedRequest['input']): [string, string][] {
  if (input.body.mode === 'urlencoded' || input.body.mode === 'formdata') {
    return input.body.params
      .filter((param) => param.enabled && param.key)
      .map((param) => [param.key, param.value]);
  }
  return [];
}

function buildCurl(prepared: PreparedRequest): string {
  const { input } = prepared;
  const lines = [`curl --request ${input.method} \\`, `  --url ${shellQuote(input.url)}`];

  input.headers
    .filter((header) => header.enabled && header.key)
    .forEach((header) => {
      lines.push(`  --header ${shellQuote(`${header.key}: ${header.value}`)}`);
    });

  if (input.body.mode === 'raw' && input.body.content) {
    lines.push(`  --data-raw ${shellQuote(input.body.content)}`);
  } else if (input.body.mode === 'urlencoded') {
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`  --data-urlencode ${shellQuote(`${key}=${value}`)}`);
    });
  } else if (input.body.mode === 'formdata') {
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`  --form ${shellQuote(`${key}=${value}`)}`);
    });
  }

  return `${lines.join(' \\\n')}\n`;
}

function buildFetch(prepared: PreparedRequest): string {
  const { input } = prepared;
  const headers = input.headers.filter((header) => header.enabled && header.key);
  const lines: string[] = [];

  if (input.body.mode === 'formdata') {
    lines.push('const form = new FormData();');
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`form.append(${jsonString(key)}, ${jsonString(value)});`);
    });
    lines.push('');
  }

  if (input.body.mode === 'urlencoded') {
    lines.push('const params = new URLSearchParams();');
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`params.append(${jsonString(key)}, ${jsonString(value)});`);
    });
    lines.push('');
  }

  const options: string[] = [`  method: ${jsonString(input.method)}`];

  if (headers.length > 0) {
    const headerLines = headers
      .map((header) => `    ${jsonString(header.key)}: ${jsonString(header.value)}`)
      .join(',\n');
    options.push(`  headers: {\n${headerLines}\n  }`);
  }

  if (input.body.mode === 'raw' && input.body.content) {
    options.push(`  body: ${jsonString(input.body.content)}`);
  } else if (input.body.mode === 'urlencoded') {
    options.push('  body: params');
  } else if (input.body.mode === 'formdata') {
    options.push('  body: form');
  }

  lines.push(`const response = await fetch(${jsonString(input.url)}, {`);
  lines.push(options.join(',\n'));
  lines.push('});');
  lines.push('');
  lines.push('const contentType = response.headers.get("content-type") ?? "";');
  lines.push(
    'const data = contentType.includes("json") ? await response.json() : await response.text();',
  );
  lines.push('console.log(response.status, data);');

  return `${lines.join('\n')}\n`;
}

function buildPython(prepared: PreparedRequest): string {
  const { input } = prepared;
  const headers = input.headers.filter((header) => header.enabled && header.key);
  const lines = ['import requests', '', `url = ${jsonString(input.url)}`];

  if (headers.length > 0) {
    const headerLines = headers
      .map((header) => `    ${jsonString(header.key)}: ${jsonString(header.value)},`)
      .join('\n');
    lines.push('headers = {');
    lines.push(headerLines);
    lines.push('}');
  }

  const argumentsList = [`${jsonString(input.method)}`, 'url'];
  if (headers.length > 0) argumentsList.push('headers=headers');

  if (input.body.mode === 'raw' && input.body.content) {
    lines.push(`payload = ${jsonString(input.body.content)}`);
    argumentsList.push('data=payload');
  } else if (input.body.mode === 'urlencoded') {
    lines.push('payload = {');
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`    ${jsonString(key)}: ${jsonString(value)},`);
    });
    lines.push('}');
    argumentsList.push('data=payload');
  } else if (input.body.mode === 'formdata') {
    lines.push('files = {');
    bodyPairs(input).forEach(([key, value]) => {
      lines.push(`    ${jsonString(key)}: (None, ${jsonString(value)}),`);
    });
    lines.push('}');
    argumentsList.push('files=files');
  }

  lines.push('');
  lines.push(
    `response = requests.request(method=${argumentsList[0]}, ${argumentsList
      .slice(1)
      .join(', ')}, timeout=${Math.round(input.timeoutMs / 1000) || 30})`,
  );
  lines.push('print(response.status_code)');
  lines.push('print(response.text)');

  return `${lines.join('\n')}\n`;
}

function buildRust(prepared: PreparedRequest): string {
  const { input } = prepared;
  const headers = input.headers.filter((header) => header.enabled && header.key);
  const lines = [
    'fn main() -> Result<(), Box<dyn std::error::Error>> {',
    '    let client = reqwest::blocking::Client::new();',
    '    let response = client',
    `        .request(reqwest::Method::from_bytes(b${jsonString(input.method)})?, ${jsonString(input.url)})`,
  ];

  headers.forEach((header) => {
    lines.push(
      `        .header(${jsonString(header.key)}, ${jsonString(header.value)})`,
    );
  });

  if (input.body.mode === 'raw' && input.body.content) {
    lines.push(`        .body(${jsonString(input.body.content)})`);
  } else if (input.body.mode === 'urlencoded') {
    const pairs = bodyPairs(input)
      .map(([key, value]) => `(${jsonString(key)}.to_string(), ${jsonString(value)}.to_string())`)
      .join(', ');
    lines.push(`        .form(&[${pairs}])`);
  } else if (input.body.mode === 'formdata') {
    const pairs = bodyPairs(input)
      .map(([key, value]) => `(${jsonString(key)}.to_string(), ${jsonString(value)}.to_string())`)
      .join(', ');
    lines.push(`        .form(&[${pairs}])`);
  }

  lines.push('        .send()?;');
  lines.push('    println!("{}", response.status());');
  lines.push('    println!("{}", response.text()?);');
  lines.push('    Ok(())');
  lines.push('}');

  return `${lines.join('\n')}\n`;
}

export function buildSnippet(
  language: SnippetLanguage,
  prepared: PreparedRequest,
): string {
  switch (language) {
    case 'javascript':
      return buildFetch(prepared);
    case 'python':
      return buildPython(prepared);
    case 'rust':
      return buildRust(prepared);
    case 'curl':
    default:
      return buildCurl(prepared);
  }
}
