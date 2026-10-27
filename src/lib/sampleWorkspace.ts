import {
  DEFAULT_SETTINGS,
  type Collection,
  type Environment,
  type KeyValue,
  type RequestSpec,
  type WorkspaceFile,
} from '../types';
import { uid } from './utils';

function row(key: string, value: string, enabled = true, secret = false): KeyValue {
  return { id: uid(), key, value, enabled, secret };
}

function request(overrides: Partial<RequestSpec> & Pick<RequestSpec, 'url'>): RequestSpec {
  return {
    method: 'GET',
    params: [],
    headers: [],
    bodyMode: 'none',
    body: '',
    formFields: [],
    auth: {
      type: 'none',
      token: '',
      username: '',
      password: '',
      key: '',
      value: '',
      addTo: 'header',
    },
    ...overrides,
  };
}

export function createSampleWorkspace(): WorkspaceFile {
  const now = Date.now();

  const collections: Collection[] = [
    {
      id: uid(),
      name: 'Courier Starter',
      description: 'A few ready-to-send requests to try Courier out.',
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: uid(),
          type: 'folder',
          name: 'Playground',
          children: [
            {
              id: uid(),
              type: 'request',
              name: 'List users',
              request: request({
                url: 'https://jsonplaceholder.typicode.com/users',
                params: [row('_limit', '5')],
                headers: [row('Accept', 'application/json')],
              }),
            },
            {
              id: uid(),
              type: 'request',
              name: 'Create post',
              request: request({
                method: 'POST',
                url: 'https://jsonplaceholder.typicode.com/posts',
                headers: [row('Accept', 'application/json')],
                bodyMode: 'json',
                body: JSON.stringify(
                  {
                    title: 'Hello from Courier',
                    body: 'A lightweight API client built with Rust and React.',
                    userId: 1,
                  },
                  null,
                  2,
                ),
              }),
            },
            {
              id: uid(),
              type: 'request',
              name: 'Echo request',
              request: request({
                method: 'POST',
                url: 'https://httpbin.org/anything',
                params: [row('source', 'courier')],
                headers: [row('X-Client', 'Courier')],
                bodyMode: 'json',
                body: JSON.stringify({ message: 'ping', count: 3 }, null, 2),
                auth: {
                  type: 'bearer',
                  token: '{{token}}',
                  username: '',
                  password: '',
                  key: '',
                  value: '',
                  addTo: 'header',
                },
              }),
            },
          ],
        },
        {
          id: uid(),
          type: 'request',
          name: 'GitHub · Tauri repo',
          request: request({
            url: 'https://api.github.com/repos/tauri-apps/tauri',
            params: [],
            headers: [
              row('Accept', 'application/vnd.github+json'),
              row('X-GitHub-Api-Version', '2022-11-28'),
            ],
          }),
        },
      ],
    },
    {
      id: uid(),
      name: 'Local development',
      description: 'Scaffolding for your own services — edit the base URL in the environment.',
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: uid(),
          type: 'request',
          name: 'Health check',
          request: request({
            url: '{{baseUrl}}/health',
            params: [],
            headers: [row('Accept', 'application/json')],
          }),
        },
        {
          id: uid(),
          type: 'request',
          name: 'Login',
          request: request({
            method: 'POST',
            url: '{{baseUrl}}/auth/login',
            bodyMode: 'json',
            body: JSON.stringify({ email: '{{userEmail}}', password: '{{password}}' }, null, 2),
          }),
        },
      ],
    },
  ];

  const environments: Environment[] = [
    {
      id: uid(),
      name: 'Local',
      variables: [
        row('baseUrl', 'http://localhost:3000'),
        row('token', 'dev-token-123', true, true),
        row('userEmail', 'admin@example.com'),
        row('password', 'password', true, true),
      ],
    },
    {
      id: uid(),
      name: 'Staging',
      variables: [
        row('baseUrl', 'https://staging.example.com'),
        row('token', '', true, true),
      ],
    },
  ];

  const firstTabId = uid();

  return {
    version: 1,
    collections,
    environments,
    activeEnvironmentId: environments[0].id,
    history: [],
    settings: DEFAULT_SETTINGS,
    session: {
      tabs: [
        {
          id: firstTabId,
          name: 'List users',
          savedRef: null,
          dirty: false,
          draft: request({
            url: 'https://jsonplaceholder.typicode.com/users',
            params: [row('_limit', '5')],
            headers: [row('Accept', 'application/json')],
          }),
        },
      ],
      activeTabId: firstTabId,
    },
  };
}
