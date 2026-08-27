import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { JiraOverviewCard } from './JiraOverviewCard';
import { JiraApi, jiraApiRef } from '../../api';

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

const counts = {
  categories: [
    { id: 'todo' as const, name: 'To Do', count: 12 },
    { id: 'inprogress' as const, name: 'In Progress', count: 5 },
    { id: 'done' as const, name: 'Done', count: 130 },
  ],
  total: 147,
};

async function renderCard(jiraApi: Partial<JiraApi>) {
  return renderInTestApp(
    <TestApiProvider apis={[[jiraApiRef, jiraApi]]}>
      <EntityProvider entity={entity}>
        <JiraOverviewCard />
      </EntityProvider>
    </TestApiProvider>,
  );
}

describe('JiraOverviewCard', () => {
  it('shows the three category counts', async () => {
    const jiraApi = { getStatusCounts: jest.fn().mockResolvedValue(counts) };
    await renderCard(jiraApi);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('130')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('147')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(jiraApi.getStatusCounts).toHaveBeenCalledWith({
      entityRef: 'component:default/my-service',
    });
  });

  it('links to the entity Jira tab as an in-app relative route', async () => {
    const jiraApi = { getStatusCounts: jest.fn().mockResolvedValue(counts) };
    await renderCard(jiraApi);
    const link = await screen.findByRole('link', { name: 'View issues' });
    expect(link.getAttribute('href')).toMatch(/\/jira$/);
  });

  it('shows a loading indicator while fetching', async () => {
    const jiraApi = {
      getStatusCounts: jest.fn().mockReturnValue(new Promise(() => {})),
    };
    await renderCard(jiraApi);
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.queryByText('To Do')).not.toBeInTheDocument();
  });

  it('shows a compact error message on failure', async () => {
    const jiraApi = {
      getStatusCounts: jest.fn().mockRejectedValue(new Error('boom')),
    };
    await renderCard(jiraApi);
    await waitFor(() =>
      expect(
        screen.getByText('Failed to load Jira issue counts.'),
      ).toBeInTheDocument(),
    );
  });
});
