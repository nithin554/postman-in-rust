import type { Environment, KeyValue } from '../types';

const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export interface ResolveResult {
  value: string;
  missing: string[];
}

export function environmentMap(
  environment: Environment | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!environment) return map;
  environment.variables.forEach((variable) => {
    const key = variable.key.trim();
    if (variable.enabled && key) {
      map[key] = variable.value;
    }
  });
  return map;
}

function dynamicValue(name: string): string | null {
  switch (name) {
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$uuid':
    case '$guid':
    case '$randomUUID':
      return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    case '$randomInt':
      return String(Math.floor(Math.random() * 1000));
    case '$randomBoolean':
      return Math.random() > 0.5 ? 'true' : 'false';
    default:
      return null;
  }
}

export function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): ResolveResult {
  if (!template || !template.includes('{{')) {
    return { value: template, missing: [] };
  }

  const missing = new Set<string>();
  const value = template.replace(
    VARIABLE_PATTERN,
    (match: string, rawName: string) => {
      const name = rawName.trim();
      if (!name) return match;
      if (name.startsWith('$')) {
        const dynamic = dynamicValue(name);
        if (dynamic !== null) return dynamic;
      }
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        return variables[name];
      }
      missing.add(name);
      return match;
    },
  );

  return { value, missing: Array.from(missing) };
}

export function resolveRows(
  rows: KeyValue[],
  variables: Record<string, string>,
): { rows: KeyValue[]; missing: string[] } {
  const missing = new Set<string>();
  const resolved = rows.map((row) => {
    const key = resolveTemplate(row.key, variables);
    const value = resolveTemplate(row.value, variables);
    key.missing.forEach((name) => missing.add(name));
    value.missing.forEach((name) => missing.add(name));
    return { ...row, key: key.value, value: value.value };
  });
  return { rows: resolved, missing: Array.from(missing) };
}

export function variableNamesFrom(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]?.trim();
    if (name && !name.startsWith('$')) names.add(name);
  }
  return Array.from(names);
}
