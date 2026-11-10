import { describe, expect, test } from 'vitest';
import { runPreRequest, runTests } from './scripts';
import type { Environment, HttpResponse } from '../types';

const env: Environment = {
  id: 'env1',
  name: 'Test env',
  variables: [
    { id: 'v1', key: 'host', value: 'api.example.com', enabled: true },
    { id: 'v2', key: 'old', value: 'x', enabled: true },
  ],
};

const response: HttpResponse = {
  requestId: 'r1',
  status: 200,
  statusText: 'OK',
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: JSON.stringify({ ok: true, items: [1, 2] }),
  bodyEncoding: 'text',
  sizeBytes: 100,
  elapsedMs: 42,
  contentType: 'application/json',
  finalUrl: 'https://api.example.com',
  httpVersion: 'HTTP/1.1',
  truncated: false,
};

describe('runPreRequest', () => {
  test('sets and unsets environment variables', () => {
    const outcome = runPreRequest(
      `pm.environment.set('token', 'abc123');
       pm.environment.set('host', 'other.example.com');
       pm.environment.unset('old');
       console.log('hello', 1);`,
      env,
    );
    const map = new Map(outcome.envPatch.map((v) => [v.key, v.value]));
    expect(map.get('token')).toBe('abc123');
    expect(map.get('host')).toBe('other.example.com');
    expect(map.has('old')).toBe(false);
    expect(outcome.logs).toContain('hello 1');
  });

  test('captures script errors as logs', () => {
    const outcome = runPreRequest('throw new Error("boom")', env);
    expect(outcome.logs.some((l) => l.includes('boom'))).toBe(true);
  });
});

describe('runTests', () => {
  test('runs passing and failing assertions', async () => {
    const outcome = await runTests(
      `pm.test('status is 200', () => {
         pm.expect(pm.response.code).to.equal(200);
       });
       pm.test('body has items', () => {
         pm.expect(pm.response.json().items.length).to.above(1);
       });
       pm.test('expect fails', () => {
         pm.expect(pm.response.code).to.equal(500);
       });`,
      response,
    );
    expect(outcome.results).toHaveLength(3);
    expect(outcome.results[0]?.passed).toBe(true);
    expect(outcome.results[1]?.passed).toBe(true);
    expect(outcome.results[2]?.passed).toBe(false);
    expect(outcome.results[2]?.error).toContain('500');
  });

  test('supports async test bodies', async () => {
    const outcome = await runTests(
      `pm.test('async works', async () => {
         await new Promise((r) => setTimeout(r, 5));
         pm.expect(pm.response.text()).to.include('ok');
       });`,
      response,
    );
    expect(outcome.results[0]?.passed).toBe(true);
  });

  test('script setup errors surface as a failed result', async () => {
    const outcome = await runTests('nope.throws()', response);
    expect(outcome.results[0]?.passed).toBe(false);
  });
});
