import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/frontend-plugin-api';
import { ResponseError } from '@backstage/errors';
import {
  JiraIssuesResponse,
  JiraStatusCountsResponse,
  SortField,
  SortOrder,
} from './types';

/** Query options for the issues API. */
export interface GetIssuesOptions {
  entityRef: string;
  filter?: string;
  startAt?: number;
  limit?: number;
  sortBy?: SortField;
  order?: SortOrder;
  search?: string;
}

/** Client for the jira-backend issues API. */
export interface JiraApi {
  getIssues(options: GetIssuesOptions): Promise<JiraIssuesResponse>;
  getStatusCounts(options: {
    entityRef: string;
  }): Promise<JiraStatusCountsResponse>;
}

export const jiraApiRef = createApiRef<JiraApi>({ id: 'plugin.jira.api' });

export class JiraClient implements JiraApi {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  async getIssues(options: GetIssuesOptions): Promise<JiraIssuesResponse> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('jira');
    const params = new URLSearchParams({ entityRef: options.entityRef });
    if (options.filter !== undefined) {
      params.set('filter', options.filter);
    }
    if (options.startAt !== undefined) {
      params.set('startAt', String(options.startAt));
    }
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.sortBy !== undefined) {
      params.set('sortBy', options.sortBy);
    }
    if (options.order !== undefined) {
      params.set('order', options.order);
    }
    if (options.search) {
      params.set('search', options.search);
    }
    const response = await this.options.fetchApi.fetch(
      `${baseUrl}/v1/issues?${params}`,
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }

  async getStatusCounts(options: {
    entityRef: string;
  }): Promise<JiraStatusCountsResponse> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('jira');
    const params = new URLSearchParams({ entityRef: options.entityRef });
    const response = await this.options.fetchApi.fetch(
      `${baseUrl}/v1/status-counts?${params}`,
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }
}
