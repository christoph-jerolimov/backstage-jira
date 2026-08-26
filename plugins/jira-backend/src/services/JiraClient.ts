import { LoggerService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import { JiraConnection } from './JiraConnectionsReader';
import { JiraIssue, MAX_PAGE_SIZE, SortField, SortOrder } from '../types';

/** Escapes a value for interpolation into JQL as a quoted string. */
export function toJqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildJql(options: {
  projectKeys: string[];
  component?: string;
  filterJql?: string;
  search?: string;
  statusCategory?: string;
  /** Jira account identifier to constrain the assignee to, as a literal. */
  assignee?: string;
  sortBy?: SortField;
  order?: SortOrder;
}): string {
  const keys = options.projectKeys;
  const clauses = [
    keys.length === 1
      ? `project = ${toJqlString(keys[0])}`
      : `project IN (${keys.map(toJqlString).join(', ')})`,
  ];
  if (options.component) {
    clauses.push(`component = ${toJqlString(options.component)}`);
  }
  if (options.filterJql) {
    clauses.push(`(${options.filterJql})`);
  }
  if (options.statusCategory) {
    clauses.push(`statusCategory = ${toJqlString(options.statusCategory)}`);
  }
  if (options.assignee) {
    clauses.push(`assignee = ${toJqlString(options.assignee)}`);
  }
  if (options.search) {
    clauses.push(`summary ~ ${toJqlString(options.search)}`);
  }
  const sortBy = options.sortBy ?? 'updated';
  const order = options.order ?? (options.sortBy ? 'asc' : 'desc');
  return `${clauses.join(' AND ')} ORDER BY ${sortBy} ${order.toUpperCase()}`;
}

export class JiraApiError extends Error {
  name = 'JiraApiError';
}

const searchResponseSchema = z.object({
  total: z.number(),
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        summary: z.string().nullish(),
        created: z.string().nullish(),
        updated: z.string().nullish(),
        issuetype: z
          .object({ name: z.string().nullish(), iconUrl: z.string().nullish() })
          .nullish(),
        status: z
          .object({
            name: z.string().nullish(),
            statusCategory: z.object({ name: z.string().nullish() }).nullish(),
          })
          .nullish(),
        priority: z
          .object({ name: z.string().nullish(), iconUrl: z.string().nullish() })
          .nullish(),
        assignee: z.object({ displayName: z.string().nullish() }).nullish(),
      }),
    }),
  ),
});

const userSearchResponseSchema = z.array(
  z.object({
    accountId: z.string().nullish(),
    name: z.string().nullish(),
  }),
);

const REQUESTED_FIELDS = [
  'summary',
  'issuetype',
  'status',
  'priority',
  'assignee',
  'created',
  'updated',
];


/**
 * Minimal Jira REST client for issue search, working against both Jira
 * Cloud and Data Center via the v2 search API.
 */
export class JiraClient {
  constructor(
    private readonly options: {
      logger: LoggerService;
      fetchImpl?: typeof fetch;
    },
  ) {}

  authHeader(connection: JiraConnection): string {
    const auth = connection.auth;
    if (auth.method === 'basic') {
      const encoded = Buffer.from(`${auth.email}:${auth.apiToken}`).toString(
        'base64',
      );
      return `Basic ${encoded}`;
    }
    return `Bearer ${auth.token}`;
  }

  /**
   * Resolves an email address to a Jira account identifier via Jira's user
   * search API, or undefined when no account matches. Tries the Jira Cloud
   * `query` parameter first and falls back to the Data Center `username`
   * parameter.
   */
  async findUser(options: {
    connection: JiraConnection;
    email: string;
  }): Promise<string | undefined> {
    const { connection, email } = options;
    for (const param of ['query', 'username'] as const) {
      const users = await this.#searchUsers(connection, param, email);
      if (users === undefined) {
        continue;
      }
      const account = users.find(
        user => user.accountId ?? user.name,
      );
      if (account) {
        return account.accountId ?? account.name ?? undefined;
      }
      // An empty result on the Cloud parameter may still match on the Data
      // Center parameter; an empty result on the last parameter is a miss.
    }
    return undefined;
  }

  async #searchUsers(
    connection: JiraConnection,
    param: 'query' | 'username',
    email: string,
  ): Promise<Array<{ accountId?: string | null; name?: string | null }> | undefined> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = `${connection.apiBaseUrl}/rest/api/2/user/search?${param}=${encodeURIComponent(email)}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader(connection),
        },
      });
    } catch (e) {
      throw new JiraApiError(
        `Failed to reach Jira at ${connection.host}: ${(e as Error).message}`,
      );
    }
    // Cloud rejects `username`, Data Center rejects `query` — treat a 400/404
    // as "this parameter flavor is unsupported" and let the caller fall back.
    if (response.status === 400 || response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new JiraApiError(
        `Jira at ${connection.host} responded with ${response.status} ${response.statusText}`,
      );
    }
    const parsed = userSearchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new JiraApiError(
        `Unexpected user search response shape from Jira at ${connection.host}`,
      );
    }
    return parsed.data;
  }

  /** Counts the issues matching a JQL query without fetching any of them. */
  async countIssues(options: {
    connection: JiraConnection;
    jql: string;
  }): Promise<number> {
    const result = await this.searchIssues({ ...options, maxResults: 0 });
    return result.total;
  }

  async searchIssues(options: {
    connection: JiraConnection;
    jql: string;
    startAt?: number;
    maxResults?: number;
  }): Promise<{
    issues: JiraIssue[];
    total: number;
    startAt: number;
    pageSize: number;
  }> {
    const { connection, jql } = options;
    const startAt = options.startAt ?? 0;
    const maxResults = Math.min(options.maxResults ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = `${connection.apiBaseUrl}/rest/api/2/search`;
    this.options.logger.debug(`Searching Jira at ${url}`, { jql });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.authHeader(connection),
        },
        body: JSON.stringify({
          jql,
          startAt,
          maxResults,
          fields: REQUESTED_FIELDS,
        }),
      });
    } catch (e) {
      throw new JiraApiError(
        `Failed to reach Jira at ${connection.host}: ${(e as Error).message}`,
      );
    }
    if (!response.ok) {
      // Deliberately not forwarding the response body: Jira error payloads
      // are not useful to end users and must never carry our credentials.
      throw new JiraApiError(
        `Jira at ${connection.host} responded with ${response.status} ${response.statusText}`,
      );
    }

    const parsed = searchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new JiraApiError(
        `Unexpected search response shape from Jira at ${connection.host}`,
      );
    }

    return {
      total: parsed.data.total,
      startAt,
      pageSize: maxResults,
      issues: parsed.data.issues.map(issue => ({
        key: issue.key,
        url: `${connection.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
        summary: issue.fields.summary ?? '',
        type: {
          name: issue.fields.issuetype?.name ?? undefined,
          iconUrl: issue.fields.issuetype?.iconUrl ?? undefined,
        },
        status: {
          name: issue.fields.status?.name ?? undefined,
          category: issue.fields.status?.statusCategory?.name ?? undefined,
        },
        priority: {
          name: issue.fields.priority?.name ?? undefined,
          iconUrl: issue.fields.priority?.iconUrl ?? undefined,
        },
        assignee: issue.fields.assignee?.displayName
          ? { displayName: issue.fields.assignee.displayName }
          : undefined,
        created: issue.fields.created ?? undefined,
        updated: issue.fields.updated ?? undefined,
      })),
    };
  }
}
