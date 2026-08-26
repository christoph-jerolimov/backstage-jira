import { LoggerService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import { JiraConnection } from './JiraConnectionsReader';
import { JiraIssue } from '../types';

/** Escapes a value for interpolation into JQL as a quoted string. */
export function toJqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildJql(options: {
  projectKey: string;
  component?: string;
  filterJql?: string;
}): string {
  const clauses = [`project = ${toJqlString(options.projectKey)}`];
  if (options.component) {
    clauses.push(`component = ${toJqlString(options.component)}`);
  }
  if (options.filterJql) {
    clauses.push(`(${options.filterJql})`);
  }
  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
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

const REQUESTED_FIELDS = [
  'summary',
  'issuetype',
  'status',
  'priority',
  'assignee',
  'created',
  'updated',
];

const PAGE_SIZE = 50;

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

  async searchIssues(options: {
    connection: JiraConnection;
    jql: string;
  }): Promise<{ issues: JiraIssue[]; total: number }> {
    const { connection, jql } = options;
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
          maxResults: PAGE_SIZE,
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
