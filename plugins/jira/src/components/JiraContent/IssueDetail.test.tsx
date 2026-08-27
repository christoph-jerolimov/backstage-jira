import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { JiraContent } from './JiraContent';
import { JiraApi, jiraApiRef } from '../../api';
import { JiraIssueDetail, JiraIssuesResponse } from '../../types';

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
  total: 1,
  startAt: 0,
  pageSize: 50,
  filters: [{ id: 'unresolved', name: 'Unresolved', default: true }],
  appliedFilter: 'unresolved',
  project: { key: 'PROJ', url: 'https://example.atlassian.net/browse/PROJ' },
  projects: [{ key: 'PROJ', url: 'https://example.atlassian.net/browse/PROJ' }],
};

const detail: JiraIssueDetail = {
  ...issue,
  description: 'It <b>broke</b> badly',
  labels: ['hardware'],
  reporter: { displayName: 'Rae' },
  comments: [
    { author: 'Rae', created: '2026-08-19T10:00:00.000Z', body: 'Any <i>news</i>?' },
  ],
  commentTotal: 9,
};

async function renderContent(jiraApi: Partial<JiraApi>, annotations?: Record<string, string>) {
  return renderInTestApp(
    <TestApiProvider apis={[[jiraApiRef, jiraApi]]}>
      <EntityProvider
        entity={entity(annotations ?? { 'jira/project-key': 'PROJ' })}
      >
        <JiraContent />
      </EntityProvider>
    </TestApiProvider>,
  );
}

describe('issue detail dialog', () => {
  it('opens on row click, renders markup-like text literally, and dismisses', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getIssueDetail: jest.fn().mockResolvedValue(detail),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText('Something is broken'));
    await waitFor(() =>
      expect(screen.getByText('It <b>broke</b> badly')).toBeInTheDocument(),
    );
    expect(jiraApi.getIssueDetail).toHaveBeenCalledWith({
      entityRef: 'component:default/my-service',
      issueKey: 'PROJ-1',
    });
    expect(screen.getByText('Any <i>news</i>?')).toBeInTheDocument();
    expect(screen.getByText('hardware')).toBeInTheDocument();
    expect(screen.getByText('Comments (1 of 9)')).toBeInTheDocument();
    const jiraLink = screen.getByRole('link', { name: 'Open in Jira' });
    expect(jiraLink).toHaveAttribute('href', issue.url);
    expect(jiraLink).toHaveAttribute('target', '_blank');

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('It <b>broke</b> badly')).not.toBeInTheDocument(),
    );
  });

  it('keeps the key link pointing at Jira', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getIssueDetail: jest.fn().mockResolvedValue(detail),
    };
    await renderContent(jiraApi);
    const link = await screen.findByRole('link', { name: 'PROJ-1' });
    expect(link).toHaveAttribute('href', issue.url);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows an error inside the dialog without breaking the table', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getIssueDetail: jest.fn().mockRejectedValue(new Error('detail exploded')),
    };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText('Something is broken'));
    await waitFor(() =>
      expect(screen.getByText(/detail exploded/)).toBeInTheDocument(),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('Something is broken')).toBeInTheDocument();
  });
});

describe('sprint view', () => {
  const sprintResponse = {
    sprint: {
      id: 42,
      name: 'Sprint 12',
      state: 'active',
      startDate: '2026-08-20T00:00:00.000Z',
      endDate: '2026-09-03T00:00:00.000Z',
      goal: 'Ship it',
    },
    issues: [{ ...issue, key: 'PROJ-8', summary: 'Sprint task' }],
    total: 1,
  };

  it('shows no toggle without a board annotation', async () => {
    const jiraApi = { getIssues: jest.fn().mockResolvedValue(issuesResponse) };
    await renderContent(jiraApi);
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('radio', { name: 'Sprint' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sprint 12')).not.toBeInTheDocument();
  });

  it('toggles to the active sprint and preserves the issues view', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getSprint: jest.fn().mockResolvedValue(sprintResponse),
    };
    await renderContent(jiraApi, {
      'jira/project-key': 'PROJ',
      'jira/board-id': '7',
    });
    await waitFor(() =>
      expect(screen.getByText('Something is broken')).toBeInTheDocument(),
    );
    const issuesCalls = jiraApi.getIssues.mock.calls.length;

    await userEvent.click(screen.getByRole('radio', { name: 'Sprint' }));
    await waitFor(() => expect(screen.getByText('Sprint 12')).toBeInTheDocument());
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('Sprint task')).toBeInTheDocument();
    expect(jiraApi.getSprint).toHaveBeenCalledWith({
      entityRef: 'component:default/my-service',
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Issues' }));
    expect(screen.getByText('Something is broken')).toBeInTheDocument();
    // Switching back re-uses the existing state instead of re-fetching.
    expect(jiraApi.getIssues.mock.calls.length).toBe(issuesCalls);
  });

  it('shows an empty state when there is no active sprint', async () => {
    const jiraApi = {
      getIssues: jest.fn().mockResolvedValue(issuesResponse),
      getSprint: jest
        .fn()
        .mockResolvedValue({ sprint: null, issues: [], total: 0 }),
    };
    await renderContent(jiraApi, {
      'jira/project-key': 'PROJ',
      'jira/board-id': '7',
    });
    await userEvent.click(await screen.findByRole('radio', { name: 'Sprint' }));
    await waitFor(() =>
      expect(
        screen.getByText('The board has no active sprint.'),
      ).toBeInTheDocument(),
    );
  });
});
