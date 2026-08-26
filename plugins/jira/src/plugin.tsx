import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { JiraClient, jiraApiRef } from './api';
import { isJiraAvailable } from './annotations';

const jiraApi = ApiBlueprint.make({
  params: define =>
    define({
      api: jiraApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new JiraClient({ discoveryApi, fetchApi }),
    }),
});

export const entityJiraContent = EntityContentBlueprint.make({
  name: 'entity',
  params: {
    path: 'jira',
    title: 'Jira',
    filter: isJiraAvailable,
    loader: () =>
      import('./components/JiraContent').then(m => <m.JiraContent />),
  },
});

export const entityJiraOverviewCard = EntityCardBlueprint.make({
  name: 'overview-card',
  params: {
    filter: isJiraAvailable,
    type: 'info',
    loader: () =>
      import('./components/JiraOverviewCard').then(m => <m.JiraOverviewCard />),
  },
});

export const jiraPlugin = createFrontendPlugin({
  pluginId: 'jira',
  extensions: [jiraApi, entityJiraContent, entityJiraOverviewCard],
});
