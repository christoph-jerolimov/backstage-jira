import { mockServices } from '@backstage/backend-test-utils';
import { buildJql, toJqlString, JiraClient } from './JiraClient';
import { JiraConnection } from './JiraConnectionsReader';

const basicConnection: JiraConnection = {
  type: 'jira',
  title: 'Jira (example.atlassian.net)',
  host: 'example.atlassian.net',
  baseUrl: 'https://example.atlassian.net',
  apiBaseUrl: 'https://example.atlassian.net',
  auth: { method: 'basic', email: 'bot@example.com', apiToken: 's3cret' },
};

const tokenConnection: JiraConnection = {
  ...basicConnection,
  host: 'jira.example.com',
  baseUrl: 'https://jira.example.com',
  apiBaseUrl: 'https://jira.example.com/jira',
  auth: { method: 'token', token: 'pat-token' },
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const emptyResult = { total: 0, issues: [] };

describe('toJqlString', () => {
  it('quotes and escapes values', () => {
    expect(toJqlString('PROJ')).toBe('"PROJ"');
    expect(toJqlString('we "quote" \\ things')).toBe(
      '"we \\"quote\\" \\\\ things"',
    );
  });
});

describe('buildJql', () => {
  it('builds project-only JQL', () => {
    expect(buildJql({ projectKey: 'PROJ' })).toBe(
      'project = "PROJ" ORDER BY updated DESC',
    );
  });

  it('adds component and filter constraints', () => {
    expect(
      buildJql({
        projectKey: 'PROJ',
        component: 'backend',
        filterJql: 'resolution = Unresolved',
      }),
    ).toBe(
      'project = "PROJ" AND component = "backend" AND (resolution = Unresolved) ORDER BY updated DESC',
    );
  });

  it('escapes hostile annotation values instead of letting them extend the query', () => {
    expect(
      buildJql({ projectKey: 'X" OR project != "' }),
    ).toBe('project = "X\\" OR project != \\"" ORDER BY updated DESC');
  });
});

describe('JiraClient', () => {
  function clientWith(fetchImpl: jest.Mock) {
    return new JiraClient({
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  it('sends basic auth derived from email and apiToken', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(emptyResult));
    await clientWith(fetchMock).searchIssues({
      connection: basicConnection,
      jql: 'project = "PROJ"',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.atlassian.net/rest/api/2/search');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('bot@example.com:s3cret').toString('base64')}`,
    );
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({ jql: 'project = "PROJ"', maxResults: 50 }),
    );
  });

  it('sends bearer auth and uses the configured apiBaseUrl', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(emptyResult));
    await clientWith(fetchMock).searchIssues({
      connection: tokenConnection,
      jql: 'project = "PROJ"',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://jira.example.com/jira/rest/api/2/search');
    expect(init.headers.Authorization).toBe('Bearer pat-token');
  });

  it('maps issues to the API shape with browse URLs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        total: 1,
        issues: [
          {
            key: 'PROJ-7',
            fields: {
              summary: 'Fix the flux capacitor',
              created: '2026-08-01T10:00:00.000+0000',
              updated: '2026-08-20T10:00:00.000+0000',
              issuetype: { name: 'Bug', iconUrl: 'https://x/bug.svg' },
              status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
              priority: { name: 'High', iconUrl: 'https://x/high.svg' },
              assignee: { displayName: 'Dana' },
            },
          },
        ],
      }),
    );
    const result = await clientWith(fetchMock).searchIssues({
      connection: basicConnection,
      jql: 'project = "PROJ"',
    });
    expect(result.total).toBe(1);
    expect(result.issues[0]).toEqual({
      key: 'PROJ-7',
      url: 'https://example.atlassian.net/browse/PROJ-7',
      summary: 'Fix the flux capacitor',
      type: { name: 'Bug', iconUrl: 'https://x/bug.svg' },
      status: { name: 'In Progress', category: 'In Progress' },
      priority: { name: 'High', iconUrl: 'https://x/high.svg' },
      assignee: { displayName: 'Dana' },
      created: '2026-08-01T10:00:00.000+0000',
      updated: '2026-08-20T10:00:00.000+0000',
    });
  });

  it('tolerates unassigned issues and missing fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        total: 1,
        issues: [{ key: 'PROJ-8', fields: { summary: 'Orphan', assignee: null } }],
      }),
    );
    const result = await clientWith(fetchMock).searchIssues({
      connection: basicConnection,
      jql: 'project = "PROJ"',
    });
    expect(result.issues[0].assignee).toBeUndefined();
    expect(result.issues[0].status).toEqual({ name: undefined, category: undefined });
  });

  it('maps non-2xx responses to JiraApiError without credentials', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('nope', { status: 401, statusText: 'Unauthorized' }));
    await expect(
      clientWith(fetchMock).searchIssues({
        connection: basicConnection,
        jql: 'project = "PROJ"',
      }),
    ).rejects.toThrow(/example\.atlassian\.net responded with 401/);
  });

  it('maps network failures to JiraApiError', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(
      clientWith(fetchMock).searchIssues({
        connection: basicConnection,
        jql: 'project = "PROJ"',
      }),
    ).rejects.toThrow(/Failed to reach Jira at example\.atlassian\.net/);
  });
});
