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
    expect(buildJql({ projectKeys: ['PROJ'] })).toBe(
      'project = "PROJ" ORDER BY updated DESC',
    );
  });

  it('uses project IN for multiple projects with per-key escaping', () => {
    expect(buildJql({ projectKeys: ['PROJ1', 'PR"J2'] })).toBe(
      'project IN ("PROJ1", "PR\\"J2") ORDER BY updated DESC',
    );
  });

  it('adds component and filter constraints', () => {
    expect(
      buildJql({
        projectKeys: ['PROJ'],
        component: 'backend',
        filterJql: 'resolution = Unresolved',
      }),
    ).toBe(
      'project = "PROJ" AND component = "backend" AND (resolution = Unresolved) ORDER BY updated DESC',
    );
  });

  it('escapes hostile annotation values instead of letting them extend the query', () => {
    expect(
      buildJql({ projectKeys: ['X" OR project != "'] }),
    ).toBe('project = "X\\" OR project != \\"" ORDER BY updated DESC');
  });

  it.each([
    ['updated', 'desc', 'ORDER BY updated DESC'],
    ['created', 'asc', 'ORDER BY created ASC'],
    ['key', 'asc', 'ORDER BY key ASC'],
    ['priority', 'desc', 'ORDER BY priority DESC'],
    ['status', 'asc', 'ORDER BY status ASC'],
    ['summary', 'desc', 'ORDER BY summary DESC'],
  ] as const)('sorts by %s %s', (sortBy, order, suffix) => {
    expect(buildJql({ projectKeys: ['PROJ'], sortBy, order })).toBe(
      `project = "PROJ" ${suffix}`,
    );
  });

  it('adds a status category clause', () => {
    expect(
      buildJql({ projectKeys: ['PROJ'], statusCategory: 'In Progress' }),
    ).toBe(
      'project = "PROJ" AND statusCategory = "In Progress" ORDER BY updated DESC',
    );
  });

  it('adds a summary search clause with escaping', () => {
    expect(
      buildJql({ projectKeys: ['PROJ'], search: 'flux "capacitor" \\ x' }),
    ).toBe(
      'project = "PROJ" AND summary ~ "flux \\"capacitor\\" \\\\ x" ORDER BY updated DESC',
    );
  });

  it('search metacharacters cannot extend the query', () => {
    expect(
      buildJql({ projectKeys: ['PROJ'], search: '" OR project != "' }),
    ).toBe(
      'project = "PROJ" AND summary ~ "\\" OR project != \\"" ORDER BY updated DESC',
    );
  });

  it('combines search, filter, sort, and multiple projects', () => {
    expect(
      buildJql({
        projectKeys: ['A', 'B'],
        filterJql: 'resolution = Unresolved',
        search: 'x',
        sortBy: 'priority',
        order: 'asc',
      }),
    ).toBe(
      'project IN ("A", "B") AND (resolution = Unresolved) AND summary ~ "x" ORDER BY priority ASC',
    );
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
      expect.objectContaining({ jql: 'project = "PROJ"', startAt: 0, maxResults: 50 }),
    );
  });

  describe('findUser', () => {
    it('resolves a Cloud account via the query parameter', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse([{ accountId: 'abc-123', displayName: 'Dana' }]),
      );
      const account = await clientWith(fetchMock).findUser({
        connection: basicConnection,
        email: 'dana@example.com',
      });
      expect(account).toBe('abc-123');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://example.atlassian.net/rest/api/2/user/search?query=dana%40example.com',
      );
      expect(init.headers.Authorization).toMatch(/^Basic /);
    });

    it('falls back to the username parameter for Data Center', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('nope', { status: 400 }))
        .mockResolvedValueOnce(jsonResponse([{ name: 'dana' }]));
      const account = await clientWith(fetchMock).findUser({
        connection: tokenConnection,
        email: 'dana@example.com',
      });
      expect(account).toBe('dana');
      expect(fetchMock.mock.calls[0][0]).toContain('?query=');
      expect(fetchMock.mock.calls[1][0]).toContain('?username=');
    });

    it('falls back when the query parameter matches nothing', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([{ name: 'dana' }]));
      const account = await clientWith(fetchMock).findUser({
        connection: basicConnection,
        email: 'dana@example.com',
      });
      expect(account).toBe('dana');
    });

    it('returns undefined when no account matches either parameter', async () => {
      const fetchMock = jest
        .fn()
        .mockImplementation(async () => jsonResponse([]));
      const account = await clientWith(fetchMock).findUser({
        connection: basicConnection,
        email: 'ghost@example.com',
      });
      expect(account).toBeUndefined();
    });

    it('maps server errors and network failures to JiraApiError', async () => {
      const errorFetch = jest
        .fn()
        .mockResolvedValue(new Response('boom', { status: 500, statusText: 'Oops' }));
      await expect(
        clientWith(errorFetch).findUser({
          connection: basicConnection,
          email: 'dana@example.com',
        }),
      ).rejects.toThrow(/responded with 500/);

      const networkFetch = jest.fn().mockRejectedValue(new Error('socket hang up'));
      await expect(
        clientWith(networkFetch).findUser({
          connection: basicConnection,
          email: 'dana@example.com',
        }),
      ).rejects.toThrow(/Failed to reach Jira/);
    });
  });

  it('counts issues with maxResults 0 without fetching any', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ total: 137, issues: [] }),
    );
    const count = await clientWith(fetchMock).countIssues({
      connection: basicConnection,
      jql: 'project = "PROJ" AND statusCategory = "Done"',
    });
    expect(count).toBe(137);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.maxResults).toBe(0);
    expect(body.jql).toBe('project = "PROJ" AND statusCategory = "Done"');
  });

  it('passes paging options through and reports them back, capping the page size', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ total: 120, issues: [] }),
    );
    const result = await clientWith(fetchMock).searchIssues({
      connection: basicConnection,
      jql: 'project = "PROJ"',
      startAt: 100,
      maxResults: 200,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.startAt).toBe(100);
    expect(body.maxResults).toBe(50);
    expect(result).toEqual(
      expect.objectContaining({ total: 120, startAt: 100, pageSize: 50 }),
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
