import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/frontend-plugin-api';
import { ResponseError } from '@backstage/errors';
import { JiraIssuesResponse } from './types';

/** Client for the jira-backend issues API. */
export interface JiraApi {
  getIssues(options: {
    entityRef: string;
    filter?: string;
  }): Promise<JiraIssuesResponse>;
}

export const jiraApiRef = createApiRef<JiraApi>({ id: 'plugin.jira.api' });

export class JiraClient implements JiraApi {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  async getIssues(options: {
    entityRef: string;
    filter?: string;
  }): Promise<JiraIssuesResponse> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('jira');
    const params = new URLSearchParams({ entityRef: options.entityRef });
    if (options.filter !== undefined) {
      params.set('filter', options.filter);
    }
    const response = await this.options.fetchApi.fetch(
      `${baseUrl}/v1/issues?${params}`,
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }
}
