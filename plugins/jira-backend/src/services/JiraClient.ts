import { LoggerService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import { JiraConnection } from './JiraConnectionsReader';
import {
  JiraIssue,
  JiraIssueDetail,
  JiraSprint,
  MAX_COMMENTS,
  MAX_PAGE_SIZE,
  SortField,
  SortOrder,
} from '../types';

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

const issueFieldsSchema = z.object({
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
});

const issueSchema = z.object({
  key: z.string(),
  fields: issueFieldsSchema,
});

const searchResponseSchema = z.object({
  total: z.number(),
  issues: z.array(issueSchema),
});

const issueDetailSchema = z.object({
  key: z.string(),
  fields: issueFieldsSchema.extend({
    description: z.string().nullish(),
    labels: z.array(z.string()).nullish(),
    reporter: z.object({ displayName: z.string().nullish() }).nullish(),
    comment: z
      .object({
        total: z.number().nullish(),
        comments: z
          .array(
            z.object({
              author: z.object({ displayName: z.string().nullish() }).nullish(),
              created: z.string().nullish(),
              body: z.string().nullish(),
            }),
          )
          .nullish(),
      })
      .nullish(),
  }),
});

const sprintListSchema = z.object({
  values: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      state: z.string(),
      startDate: z.string().nullish(),
      endDate: z.string().nullish(),
      goal: z.string().nullish(),
    }),
  ),
});

function mapIssue(
  issue: z.infer<typeof issueSchema>,
  connection: JiraConnection,
): JiraIssue {
  return {
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
  };
}

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
      issues: parsed.data.issues.map(issue => mapIssue(issue, connection)),
    };
  }

  /**
   * Fetches the full detail of one issue, or undefined when Jira does not
   * know the key.
   */
  async getIssue(options: {
    connection: JiraConnection;
    issueKey: string;
  }): Promise<JiraIssueDetail | undefined> {
    const { connection, issueKey } = options;
    const fields = [...REQUESTED_FIELDS, 'description', 'labels', 'reporter', 'comment'];
    const url =
      `${connection.apiBaseUrl}/rest/api/2/issue/` +
      `${encodeURIComponent(issueKey)}?fields=${fields.join(',')}`;
    const body = await this.#getJson(connection, url, { allow404: true });
    if (body === undefined) {
      return undefined;
    }
    const parsed = issueDetailSchema.safeParse(body);
    if (!parsed.success) {
      throw new JiraApiError(
        `Unexpected issue response shape from Jira at ${connection.host}`,
      );
    }
    const detail = parsed.data;
    const allComments = detail.fields.comment?.comments ?? [];
    return {
      ...mapIssue(detail, connection),
      description: detail.fields.description ?? '',
      labels: detail.fields.labels ?? [],
      reporter: detail.fields.reporter?.displayName
        ? { displayName: detail.fields.reporter.displayName }
        : undefined,
      // Jira returns comments oldest-first; keep the newest MAX_COMMENTS,
      // newest first.
      comments: allComments
        .slice(-MAX_COMMENTS)
        .reverse()
        .map(comment => ({
          author: comment.author?.displayName ?? undefined,
          created: comment.created ?? undefined,
          body: comment.body ?? '',
        })),
      commentTotal: detail.fields.comment?.total ?? allComments.length,
    };
  }

  /** Returns the first active sprint of a board, or undefined. */
  async getActiveSprint(options: {
    connection: JiraConnection;
    boardId: number;
  }): Promise<JiraSprint | undefined> {
    const { connection, boardId } = options;
    const url = `${connection.apiBaseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`;
    const body = await this.#getJson(connection, url);
    const parsed = sprintListSchema.safeParse(body);
    if (!parsed.success) {
      throw new JiraApiError(
        `Unexpected sprint response shape from Jira at ${connection.host}`,
      );
    }
    const sprint = parsed.data.values[0];
    if (!sprint) {
      return undefined;
    }
    return {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate ?? undefined,
      endDate: sprint.endDate ?? undefined,
      goal: sprint.goal ?? undefined,
    };
  }

  /** Fetches the issues of a sprint, capped at the standard page size. */
  async getSprintIssues(options: {
    connection: JiraConnection;
    sprintId: number;
  }): Promise<{ issues: JiraIssue[]; total: number }> {
    const { connection, sprintId } = options;
    const url =
      `${connection.apiBaseUrl}/rest/agile/1.0/sprint/${sprintId}/issue` +
      `?maxResults=${MAX_PAGE_SIZE}&fields=${REQUESTED_FIELDS.join(',')}`;
    const body = await this.#getJson(connection, url);
    const parsed = searchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new JiraApiError(
        `Unexpected sprint issues response shape from Jira at ${connection.host}`,
      );
    }
    return {
      total: parsed.data.total,
      issues: parsed.data.issues.map(issue => mapIssue(issue, connection)),
    };
  }

  /**
   * Authenticated GET returning the parsed JSON body, undefined on a 404
   * when `allow404` is set, and a JiraApiError otherwise.
   */
  async #getJson(
    connection: JiraConnection,
    url: string,
    options?: { allow404?: boolean },
  ): Promise<unknown | undefined> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
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
    if (options?.allow404 && response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new JiraApiError(
        `Jira at ${connection.host} responded with ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }
}
