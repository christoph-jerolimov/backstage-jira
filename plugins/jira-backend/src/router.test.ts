import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { JiraClient } from './services/JiraClient';
import { JiraConnectionsReader } from './services/JiraConnectionsReader';
import { readFilterConfig } from './services/filterConfig';

const SECRET = 'super-secret-token';

const annotatedEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'annotated',
    namespace: 'default',
    annotations: {
      'jira/project-key': 'PROJ',
    },
  },
  spec: { type: 'service' },
};

const componentEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'with-component',
    namespace: 'default',
    annotations: {
      'jira/project-key': 'PROJ',
      'jira/component': 'backend',
    },
  },
  spec: { type: 'service' },
};

const multiProjectEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'multi',
    namespace: 'default',
    annotations: {
      'jira/project-key': 'PROJ1, PROJ2',
    },
  },
  spec: { type: 'service' },
};

const bareEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'bare', namespace: 'default' },
  spec: { type: 'service' },
};

const searchResponse = {
  total: 1,
  issues: [
    {
      key: 'PROJ-1',
      fields: {
        summary: 'An issue',
        issuetype: { name: 'Bug' },
        status: { name: 'Open', statusCategory: { name: 'To Do' } },
        priority: { name: 'High' },
        assignee: { displayName: 'Dana' },
        created: '2026-08-01T10:00:00.000+0000',
        updated: '2026-08-20T10:00:00.000+0000',
      },
    },
  ],
};

async function setupApp(options?: {
  connections?: unknown;
  jira?: unknown;
  fetchImpl?: jest.Mock;
}) {
  const fetchMock =
    options?.fetchImpl ??
    jest.fn().mockResolvedValue(
      new Response(JSON.stringify(searchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  const config = mockServices.rootConfig({
    data: {
      connections: options?.connections ?? [
        {
          type: 'jira',
          host: 'example.atlassian.net',
          auth: [{ method: 'token', token: SECRET }],
        },
      ],
      ...(options?.jira ? { jira: options.jira } : {}),
    },
  });
  const logger = mockServices.logger.mock();
  const router = await createRouter({
    logger,
    httpAuth: mockServices.httpAuth(),
    catalog: catalogServiceMock({
      entities: [annotatedEntity, componentEntity, multiProjectEntity, bareEntity],
    }),
    connections: JiraConnectionsReader.fromConfig(config),
    filterConfig: readFilterConfig(config),
    jiraClient: new JiraClient({
      logger,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }),
  });
  const app = express();
  app.use(router);
  app.use(mockErrorHandler());
  return { app, fetchMock, logger };
}

describe('createRouter', () => {
  it('returns issues, filters, and project info for an annotated entity', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      issues: [
        expect.objectContaining({
          key: 'PROJ-1',
          url: 'https://example.atlassian.net/browse/PROJ-1',
          summary: 'An issue',
          assignee: { displayName: 'Dana' },
        }),
      ],
      total: 1,
      filters: [
        { id: 'unresolved', name: 'Unresolved', default: true },
        { id: 'all', name: 'All issues', default: false },
      ],
      appliedFilter: 'unresolved',
      startAt: 0,
      pageSize: 50,
      project: {
        key: 'PROJ',
        url: 'https://example.atlassian.net/browse/PROJ',
      },
      projects: [
        {
          key: 'PROJ',
          url: 'https://example.atlassian.net/browse/PROJ',
        },
      ],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toBe(
      'project = "PROJ" AND (resolution = Unresolved) ORDER BY updated DESC',
    );
  });

  it('applies the component annotation and a selected filter', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/with-component&filter=all',
    );
    expect(response.status).toBe(200);
    expect(response.body.appliedFilter).toBe('all');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toBe(
      'project = "PROJ" AND component = "backend" ORDER BY updated DESC',
    );
  });

  it('queries multiple projects with project IN', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/multi&filter=all',
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toBe(
      'project IN ("PROJ1", "PROJ2") ORDER BY updated DESC',
    );
    expect(response.body.projects).toEqual([
      { key: 'PROJ1', url: 'https://example.atlassian.net/browse/PROJ1' },
      { key: 'PROJ2', url: 'https://example.atlassian.net/browse/PROJ2' },
    ]);
    expect(response.body.project.key).toBe('PROJ1');
  });

  it('passes pagination through and caps the limit', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&startAt=100&limit=200',
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.startAt).toBe(100);
    expect(body.maxResults).toBe(50);
    expect(response.body.startAt).toBe(100);
    expect(response.body.pageSize).toBe(50);
  });

  it('applies whitelisted sorting and search', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&filter=all&sortBy=priority&order=asc&search=flux',
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toBe(
      'project = "PROJ" AND summary ~ "flux" ORDER BY priority ASC',
    );
  });

  it('defaults order to asc when only sortBy is given', async () => {
    const { app, fetchMock } = await setupApp();
    await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&filter=all&sortBy=key',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toContain('ORDER BY key ASC');
  });

  it('rejects a non-whitelisted sort field without calling Jira', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&sortBy=duedate',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(
      /updated, created, key, priority, status, summary/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid order value', async () => {
    const { app } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&order=sideways',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/asc, desc/);
  });

  it.each(['startAt=-1', 'startAt=abc', 'limit=-5', 'limit=1.5'])(
    'rejects invalid pagination %s',
    async param => {
      const { app } = await setupApp();
      const response = await request(app).get(
        `/v1/issues?entityRef=component:default/annotated&${param}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/non-negative integer/);
    },
  );

  it('treats a whitespace-only search as absent', async () => {
    const { app, fetchMock } = await setupApp();
    await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&filter=all&search=%20%20',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toBe('project = "PROJ" ORDER BY updated DESC');
  });

  it('rejects a missing entityRef', async () => {
    const { app } = await setupApp();
    const response = await request(app).get('/v1/issues');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/entityRef/);
  });

  it('rejects a malformed entityRef', async () => {
    const { app } = await setupApp();
    const response = await request(app).get('/v1/issues?entityRef=%20');
    expect(response.status).toBe(400);
  });

  it('rejects an unknown filter without calling Jira', async () => {
    const { app, fetchMock } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated&filter=project%20%3D%20X',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Unknown filter/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an entity that does not exist', async () => {
    const { app } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/ghost',
    );
    expect(response.status).toBe(404);
  });

  it('returns 404 for an entity without the project-key annotation', async () => {
    const { app } = await setupApp();
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/bare',
    );
    expect(response.status).toBe(404);
    expect(response.body.error.message).toMatch(/jira\/project-key/);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { app } = await setupApp();
    const response = await request(app)
      .get('/v1/issues?entityRef=component:default/annotated')
      .set('Authorization', 'Bearer mock-none-token');
    expect(response.status).toBe(401);
  });

  it('returns 500 with config guidance when no jira connection exists', async () => {
    const { app } = await setupApp({ connections: [] });
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated',
    );
    expect(response.status).toBe(500);
    expect(response.body.error.message).toMatch(/connections/);
  });

  it('returns 502 when Jira is unreachable', async () => {
    const { app } = await setupApp({
      fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    });
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated',
    );
    expect(response.status).toBe(502);
    expect(response.body.error.message).toMatch(/Failed to reach Jira/);
  });

  it('returns 502 when Jira rejects the request, without leaking secrets', async () => {
    const { app, logger } = await setupApp({
      fetchImpl: jest
        .fn()
        .mockResolvedValue(
          new Response(`denied for ${SECRET}`, { status: 403, statusText: 'Forbidden' }),
        ),
    });
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated',
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    const loggedLines = (logger.warn as jest.Mock).mock.calls.flat().map(String);
    expect(loggedLines.length).toBeGreaterThan(0);
    expect(loggedLines.join('\n')).not.toContain(SECRET);
  });

  it('honors a configured default filter in requests without a filter', async () => {
    const { app, fetchMock } = await setupApp({
      jira: {
        defaultFilter: 'recent',
        filters: [
          { id: 'unresolved', name: 'Unresolved', jql: 'resolution = Unresolved' },
          { id: 'recent', name: 'Recent', jql: 'updated >= -7d' },
        ],
      },
    });
    const response = await request(app).get(
      '/v1/issues?entityRef=component:default/annotated',
    );
    expect(response.status).toBe(200);
    expect(response.body.appliedFilter).toBe('recent');
    expect(response.body.filters).toEqual([
      { id: 'unresolved', name: 'Unresolved', default: false },
      { id: 'recent', name: 'Recent', default: true },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.jql).toContain('(updated >= -7d)');
  });
});
