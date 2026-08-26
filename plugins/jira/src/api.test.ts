import { JiraClient } from './api';
import { isJiraAvailable } from './annotations';
import { Entity } from '@backstage/catalog-model';

describe('JiraClient', () => {
  const discoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/jira'),
  };

  it('requests issues for an entity ref without a filter', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    });
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await client.getIssues({ entityRef: 'component:default/my-service' });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/jira/v1/issues?entityRef=component%3Adefault%2Fmy-service',
    );
  });

  it('adds the filter parameter when given', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    });
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await client.getIssues({
      entityRef: 'component:default/my-service',
      filter: 'all',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('&filter=all'),
    );
    expect(fetch.mock.calls[0][0]).not.toMatch(/startAt|limit|sortBy|order|search/);
  });

  it('adds paging, sorting, and search parameters only when set', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    });
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await client.getIssues({
      entityRef: 'component:default/my-service',
      startAt: 50,
      limit: 25,
      sortBy: 'priority',
      order: 'asc',
      search: 'flux capacitor',
    });
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain('startAt=50');
    expect(url).toContain('limit=25');
    expect(url).toContain('sortBy=priority');
    expect(url).toContain('order=asc');
    expect(url).toContain('search=flux+capacitor');
  });

  it('omits an empty search string', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    });
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await client.getIssues({
      entityRef: 'component:default/my-service',
      search: '',
    });
    expect(fetch.mock.calls[0][0]).not.toContain('search=');
  });

  it('requests status counts for an entity ref', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ categories: [], total: 0 }),
    });
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await client.getStatusCounts({ entityRef: 'component:default/my-service' });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/jira/v1/status-counts?entityRef=component%3Adefault%2Fmy-service',
    );
  });

  it('throws a ResponseError on failure responses', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new JiraClient({ discoveryApi, fetchApi: { fetch } });
    await expect(
      client.getIssues({ entityRef: 'component:default/ghost' }),
    ).rejects.toThrow(/404/);
  });
});

describe('isJiraAvailable', () => {
  const entity = (annotations?: Record<string, string>): Entity => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'x', annotations },
  });

  it('is true only with a non-empty jira/project-key annotation', () => {
    expect(isJiraAvailable(entity({ 'jira/project-key': 'PROJ' }))).toBe(true);
    expect(isJiraAvailable(entity({ 'jira/project-key': '' }))).toBe(false);
    expect(isJiraAvailable(entity({ other: 'x' }))).toBe(false);
    expect(isJiraAvailable(entity())).toBe(false);
  });
});
