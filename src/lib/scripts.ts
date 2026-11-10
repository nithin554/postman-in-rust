// Postman-style pre-request and test scripts, run in the webview JS realm.
// Provides a small `pm` shim: environment access, pm.test, pm.expect, pm.response,
// and jc-style stdout capture via console.log.
import type { Environment, HttpResponse, TestResult } from '../types';
import { uid } from './utils';

export interface ConsoleCapture {
  log: (...args: unknown[]) => void;
}

export interface PreRequestOutcome {
  logs: string[];
  envPatch: Environment['variables'];
  changed: boolean;
}

function makeConsole(logs: string[]) {
  const fmt = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  return {
    log: (...args: unknown[]) => {
      logs.push(args.map(fmt).join(' '));
    },
  };
}

/** Run a pre-request script. Returns mutated variables to write back to the environment. */
export function runPreRequest(
  code: string,
  environment: Environment | null,
): PreRequestOutcome {
  const logs: string[] = [];
  const originalLog = console.log;

  const variables = new Map<string, { id: string; value: string }>();
  for (const row of environment?.variables ?? []) {
    if (row.enabled && row.key.trim()) variables.set(row.key, { id: row.id, value: row.value });
  }

  const current = () => {
    const rows: Environment['variables'] = [];
    for (const [key, entry] of variables) {
      rows.push({ id: entry.id, key, value: entry.value, enabled: true });
    }
    return rows;
  };
  const before = JSON.stringify(current());

  const pm = {
    environment: {
      get: (name: string) => variables.get(name)?.value,
      set: (name: string, value: unknown) => {
        const text = typeof value === 'string' ? value : makeConsole(logs).log(value) ?? String(value);
        variables.set(name, { id: variables.get(name)?.id ?? uid(), value: text });
      },
      unset: (name: string) => variables.delete(name),
      toJSON: () => Object.fromEntries([...variables].map(([k, v]) => [k, v.value])),
    },
    variables: {
      get: (name: string) => variables.get(name)?.value,
      set: (name: string, value: unknown) => pm.environment.set(name, value),
    },
  };

  const sandboxConsole = makeConsole(logs);
  try {
    console.log = sandboxConsole.log;
    // eslint-disable-next-line no-new-func
    const fn = new Function('pm', 'console', `"use strict";\n${code}`);
    fn(pm, sandboxConsole);
  } catch (error) {
    logs.push(`Script error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    console.log = originalLog;
  }

  const after = current();
  return {
    logs,
    envPatch: after,
    changed: after.length > 0 || before !== JSON.stringify(after),
  };
}

interface ExpectChain {
  to: ExpectChain;
  be: ExpectChain;
  been: ExpectChain;
  have: ExpectChain;
  equal: (expected: unknown) => ExpectChain;
  eql: (expected: unknown) => ExpectChain;
  include: (fragment: unknown) => ExpectChain;
  above: (floor: unknown) => ExpectChain;
  below: (ceiling: unknown) => ExpectChain;
  true: () => ExpectChain;
  false: () => ExpectChain;
  an: (type: string) => ExpectChain;
  ok: () => ExpectChain;
  undefined: () => ExpectChain;
  exist: () => ExpectChain;
  property: (name: string) => ExpectChain;
}

function miniExpect(actual: unknown): ExpectChain {
  const norm = (value: unknown) => (typeof value === 'string' && typeof actual === 'string' ? value : value);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const equals = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object' && a && b) {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    }
    return false;
  };

  const chain: ExpectChain = {
    get to() { return chain; },
    get be() { return chain; },
    get been() { return chain; },
    get have() { return chain; },
    equal(expected: unknown) {
      if (!equals(actual, norm(expected))) fail(`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      return chain;
    },
    eql(expected: unknown) {
      if (!equals(actual, norm(expected))) fail(`expected ${JSON.stringify(actual)} to eql ${JSON.stringify(expected)}`);
      return chain;
    },
    include(fragment: unknown) {
      if (typeof actual === 'string') {
        if (typeof fragment !== 'string' || !actual.includes(fragment)) {
          fail(`expected ${JSON.stringify(actual)} to include ${JSON.stringify(fragment)}`);
        }
        return chain;
      }
      if (Array.isArray(actual)) {
        if (!actual.some((item) => equals(item, fragment))) {
          fail('expected array to include the given element');
        }
        return chain;
      }
      fail('expected value to include the given fragment');
      return chain;
    },
    above(floor: unknown) {
      if (typeof actual !== 'number' || typeof floor !== 'number' || !(actual > floor)) {
        fail(`expected ${JSON.stringify(actual)} to be above ${JSON.stringify(floor)}`);
      }
      return chain;
    },
    below(ceiling: unknown) {
      if (typeof actual !== 'number' || typeof ceiling !== 'number' || !(actual < ceiling)) {
        fail(`expected ${JSON.stringify(actual)} to be below ${JSON.stringify(ceiling)}`);
      }
      return chain;
    },
    true() {
      if (actual !== true) fail(`expected ${JSON.stringify(actual)} to be true`);
      return chain;
    },
    false() {
      if (actual !== false) fail(`expected ${JSON.stringify(actual)} to be false`);
      return chain;
    },
    an(type: string) {
      const actualType = Array.isArray(actual) ? 'array' : typeof actual;
      if (actualType !== type) fail(`expected ${actualType} to be an ${type}`);
      return chain;
    },
    ok() {
      if (!actual) fail(`expected ${JSON.stringify(actual)} to be truthy`);
      return chain;
    },
    undefined() {
      if (actual !== undefined) fail('expected value to be undefined');
      return chain;
    },
    exist() {
      if (actual === null || actual === undefined) fail('expected value to exist');
      return chain;
    },
    property(name: string) {
      if (typeof actual !== 'object' || actual === null || !(name in actual)) {
        fail(`expected object to have property "${name}"`);
      }
      return miniExpect((actual as Record<string, unknown>)[name]);
    },
  };
  return chain;
}

export interface PmResponseShim {
  code: number;
  status: string;
  responseTime: number;
  headers: { get(name: string): string | undefined } & Record<string, unknown>;
  json(): unknown;
  text(): string;
}

function responseShim(response: HttpResponse): PmResponseShim {
  const headerMap = new Map(response.headers.map((h) => [h.key.toLowerCase(), h.value]));
  const decoded = response.bodyEncoding === 'base64'
    ? (() => {
        try {
          return atob(response.body);
        } catch {
          return response.body;
        }
      })()
    : response.body;
  return {
    code: response.status,
    status: response.statusText,
    responseTime: response.elapsedMs,
    headers: Object.assign(
      {
        get: (name: string) => headerMap.get(name.toLowerCase()),
      },
      Object.fromEntries([...headerMap]),
    ),
    json() {
      return JSON.parse(decoded);
    },
    text() {
      return decoded;
    },
  };
}

export interface TestOutcome {
  results: TestResult[];
  logs: string[];
}

/** Run the Tests script against a finished response. Supports async test bodies. */
export async function runTests(code: string, response: HttpResponse): Promise<TestOutcome> {
  const outcome: TestOutcome = { results: [], logs: [] };
  const queue: { name: string; fn: () => unknown }[] = [];
  const shim = responseShim(response);

  const pm = {
    response: shim,
    test: (name: string, fn: () => unknown) => {
      queue.push({ name: String(name), fn });
    },
    expect: miniExpect,
    environment: {
      get: () => undefined,
    },
  };

  try {
    // eslint-disable-next-line no-new-func
    const body = new Function(
      'pm',
      'console',
      `"use strict";\nreturn (async () => {\n${code}\n})();`,
    );
    await body(pm, makeConsole(outcome.logs));
  } catch (error) {
    outcome.results.push({
      name: 'Script failed',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return outcome;
  }

  for (const item of queue) {
    try {
      await item.fn();
      outcome.results.push({ name: item.name, passed: true });
    } catch (error) {
      outcome.results.push({
        name: item.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcome;
}
