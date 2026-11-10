import { describe, expect, test } from 'vitest';
import { parseCurl } from './curl';

describe('parseCurl', () => {
  test('Parses a basic GET', () => {
    const r = parseCurl('curl https://api.example.com/v1/models');
    expect(r?.method).toBe('GET');
    expect(r?.url).toBe('https://api.example.com/v1/models');
    expect(r?.bodyMode).toBe('none');
  });

  test('Parses method, headers, JSON body, and query params', () => {
    const r = parseCurl(
      `curl -X POST 'https://api.example.com/items?lang=vi&page=2' -H 'Authorization: Bearer abc' -H 'Content-Type: application/json' --data-raw '{"name":"Áo"}'`,
    );
    expect(r?.method).toBe('POST');
    expect(r?.url).toBe('https://api.example.com/items');
    expect(r?.params.map((p) => [p.key, p.value])).toEqual([
      ['lang', 'vi'],
      ['page', '2'],
    ]);
    expect(r?.headers.some((h) => h.key === 'Authorization' && h.value === 'Bearer abc')).toBe(true);
    expect(r?.bodyMode).toBe('json');
    expect(r?.body).toBe('{"name":"Áo"}');
  });

  test('POST is inferred when a body is present', () => {
    const r = parseCurl('curl -d name=x https://api.example.com/login');
    expect(r?.method).toBe('POST');
    expect(r?.bodyMode).toBe('text');
    expect(r?.body).toBe('name=x');
  });

  test('Basic auth via -u', () => {
    const r = parseCurl('curl -u alice:secret https://api.example.com/me');
    expect(r?.auth.type).toBe('basic');
    expect(r?.auth.username).toBe('alice');
    expect(r?.auth.password).toBe('secret');
  });

  test('Form data via -F', () => {
    const r = parseCurl('curl -F file=@a.png -F name=hello https://api.example.com/upload');
    expect(r?.bodyMode).toBe('formdata');
    expect(r?.formFields.map((f) => f.key)).toEqual(['file', 'name']);
  });

  test('Returns null for non-curl input', () => {
    expect(parseCurl('https://api.example.com')).toBeNull();
    expect(parseCurl('wget -O - https://api.example.com')).toBeNull();
  });
});
