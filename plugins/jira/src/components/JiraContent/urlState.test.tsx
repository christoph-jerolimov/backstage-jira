import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { JiraContent } from './JiraContent';
import { JiraApi, jiraApiRef } from '../../api';
import { JiraIssuesResponse } from '../../types';

const entity = (annotations: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'my-service', namespace: 'default', annotations },
  spec: { type: 'service' },
});

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

const issuesResponse: JiraIssuesResponse = {
  issues: [issue],
  total: 120,
  startAt: 0,
  pageSize: 50,
  filters: [
    { id: 'unresolved', name: 'Unresolved', default: true },
    { id: 'all', name: 'All issues', default: false },
  ],
  appliedFilter: 'unresolved',
  project: { key: 'PROJ', url: 'https://example.atlassian.net/browse/PROJ' },
  projects: [
    { key: 'PROJ1', url: 'https://example.atlassian.net/browse/PROJ1' },
    { key: 'PROJ2', url: 'https://example.atlassian.net/browse/PROJ2' },
  ],
};

// Exposes the router's current search string so tests can assert URL writes
// (the test app runs in a MemoryRouter, not on window.location).
const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

const currentSearch = () =>
  screen.getByTestId('location-search').textContent ?? '';

async function renderContent(
  jiraApi: Partial<JiraApi>,
  options?: { annotations?: Record<string, string>; url?: string },
) {
  return renderInTestApp(
    <TestApiProvider apis={[[jiraApiRef, jiraApi]]}>
      <EntityProvider
        entity={entity(options?.annotations ?? { 'jira/project-key': 'PROJ' })}
      >
        <JiraContent />
        <LocationProbe />
      </EntityProvider>
    </TestApiProvider>,
    { initialRouteEntries: [options?.url ?? '/'] },
  );
}

describe('URL query state', () => {
  it('applies the initial URL state to the fetch', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi, {
      url: '/?filter=all&sortBy=priority&order=asc&search=flux&startAt=50',
    });
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenCalledWith({
        entityRef: 'component:default/my-service',
        filter: 'all',
        sortBy: 'priority',
        order: 'asc',
        search: 'flux',
        startAt: 50,
      }),
    );
    // The search input is prefilled from the URL.
    expect(screen.getByRole('searchbox')).toHaveValue('flux');
  });

  it('falls back to defaults for invalid URL values', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi, { url: '/?sortBy=bogus&startAt=-5' });
    await waitFor(() =>
      expect(jiraApi.getIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: undefined,
          order: undefined,
          startAt: 0,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
  });

  it('writes interactions to the URL and keeps defaults clean', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    expect(currentSearch()).toBe('');

    const select = screen.getByRole('button', { name: /filter/i });
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'All issues' }));
    await waitFor(() => expect(currentSearch()).toBe('?filter=all'));

    await userEvent.click(screen.getByRole('columnheader', { name: /Priority/ }));
    await waitFor(() =>
      expect(currentSearch()).toBe('?filter=all&sortBy=priority&order=asc'),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Next table page' }),
    );
    await waitFor(() => expect(currentSearch()).toContain('startAt=50'));
  });

  it('opens the sprint view from a view=sprint URL', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getSprint: jest.fn().mockResolvedValue({
        sprint: { id: 42, name: 'Sprint 12', state: 'active' },
        issues: [],
        total: 0,
      }),
    };
    await renderContent(jiraApi, {
      annotations: { 'jira/project-key': 'PROJ', 'jira/board-id': '7' },
      url: '/?view=sprint',
    });
    await waitFor(() => expect(screen.getByText('Sprint 12')).toBeInTheDocument());
  });

  it('ignores view=sprint without a board annotation', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi, { url: '/?view=sprint' });
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Sprint 12')).not.toBeInTheDocument();
  });

  it('shows the projects as Jira links', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi);
    const link = await screen.findByRole('link', { name: 'PROJ2' });
    expect(link).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/PROJ2',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Projects:')).toBeInTheDocument();
  });
});
