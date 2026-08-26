import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { JiraContent } from './JiraContent';
import { JiraApi, jiraApiRef } from '../../api';
import { JiraIssuesResponse } from '../../types';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-service',
    namespace: 'default',
    annotations: { 'jira/project-key': 'PROJ' },
  },
  spec: { type: 'service' },
};

const filters = [
  { id: 'unresolved', name: 'Unresolved', default: true },
  { id: 'all', name: 'All issues', default: false },
];

const issue = {
  key: 'PROJ-1',
  url: 'https://example.atlassian.net/browse/PROJ-1',
  summary: 'Something is broken',
  type: { name: 'Bug' },
  status: { name: 'Open' },
  priority: { name: 'High' },
  assignee: { displayName: 'Dana' },
  updated: '2026-08-20T10:00:00.000Z',
};

function respondWith(overrides: Partial<JiraIssuesResponse>): JiraIssuesResponse {
  return {
    issues: [issue],
    total: 1,
    startAt: 0,
    pageSize: 50,
    filters,
    appliedFilter: 'unresolved',
    project: { key: 'PROJ', url: 'https://example.atlassian.net/browse/PROJ' },
    projects: [
      { key: 'PROJ', url: 'https://example.atlassian.net/browse/PROJ' },
    ],
    ...overrides,
  };
}

async function renderContent(jiraApi: Partial<JiraApi>) {
  return renderInTestApp(
    <TestApiProvider apis={[[jiraApiRef, jiraApi]]}>
      <EntityProvider entity={entity}>
        <JiraContent />
      </EntityProvider>
    </TestApiProvider>,
  );
}

describe('JiraContent', () => {
  it('shows issues in a table with a link to Jira', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(respondWith({})) };
    await renderContent(jiraApi);

    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    expect(jiraApi.getIssues).toHaveBeenCalledWith({
      entityRef: 'component:default/my-service',
      filter: undefined,
      sortBy: undefined,
      order: undefined,
      search: undefined,
      startAt: 0,
    });
    const link = screen.getByRole('link', { name: 'PROJ-1' });
    expect(link).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/PROJ-1',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Dana')).toBeInTheDocument();
  });

  it('shows Unassigned for issues without assignee', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(
        respondWith({
          issues: [{ ...issue, assignee: undefined }],
        }),
      ),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Unassigned')).toBeInTheDocument(),
    );
  });

  it('pre-selects the default filter and re-fetches on change', async () => {
    const jiraApi = {
      getIssues: jest
        .fn()
        .mockResolvedValueOnce(respondWith({}))
        .mockResolvedValueOnce(
          respondWith({ appliedFilter: 'all', issues: [] }),
        ),
    };
    await renderContent(jiraApi);

    const select = await screen.findByRole('button', { name: /filter/i });
    expect(select).toHaveTextContent('Unresolved');

    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'All issues' }));

    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'all', startAt: 0 }),
      ),
    );
  });

  it('re-fetches with sort parameters when a column sort is activated', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(respondWith({})) };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('columnheader', { name: /Priority/ }));
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'priority', order: 'asc', startAt: 0 }),
      ),
    );

    await userEvent.click(screen.getByRole('columnheader', { name: /Priority/ }));
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'priority', order: 'desc' }),
      ),
    );
  });

  it('paginates through results and resets to the first page on filter change', async () => {
    const jiraApi = {
      getIssues: jest
        .fn()
        .mockResolvedValue(respondWith({ total: 120, startAt: 0, pageSize: 50 })),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );

    jiraApi.getIssues.mockResolvedValue(
      respondWith({ total: 120, startAt: 50, pageSize: 50 }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Next table page' }),
    );
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ startAt: 50 }),
      ),
    );

    const select = screen.getByRole('button', { name: /filter/i });
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'All issues' }));
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'all', startAt: 0 }),
      ),
    );
  });

  it('debounces the summary search and clears it', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(respondWith({})) };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    const callsAfterLoad = jiraApi.getIssues.mock.calls.length;

    const searchInput = screen.getByRole('searchbox');
    await userEvent.type(searchInput, 'capacitor');
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'capacitor', startAt: 0 }),
      ),
    );
    // Debounced: one extra request for the whole word, not one per keystroke.
    expect(jiraApi.getIssues.mock.calls.length).toBe(callsAfterLoad + 1);

    await userEvent.clear(searchInput);
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: undefined }),
      ),
    );
  });

  it('mentions the search in the empty state when one is active', async () => {
    const jiraApi = {
      getIssues: jest
        .fn()
        .mockResolvedValueOnce(respondWith({}))
        .mockResolvedValue(respondWith({ issues: [], total: 0 })),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    await userEvent.type(screen.getByRole('searchbox'), 'nothing-matches');
    await waitFor(() =>
      expect(
        screen.getByText('No issues match the current filter and search.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an empty state when no issues match', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(respondWith({ issues: [], total: 0 })),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(
        screen.getByText('No issues match the current filter.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an error state with retry on failure', async () => {
    const jiraApi = {
      getIssues: jest
        .fn()
        .mockRejectedValueOnce(new Error('backend exploded'))
        .mockResolvedValueOnce(respondWith({})),
    };
    await renderContent(jiraApi);

    await waitFor(() =>
      expect(screen.getByText(/backend exploded/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
  });
});
