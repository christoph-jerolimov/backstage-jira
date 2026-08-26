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
      entities: [annotatedEntity, componentEntity, bareEntity],
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
      project: {
        key: 'PROJ',
        url: 'https://example.atlassian.net/browse/PROJ',
      },
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
