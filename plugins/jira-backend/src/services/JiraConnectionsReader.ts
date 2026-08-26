import { RootConfigService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { z } from 'zod/v3';

/**
 * A resolved Jira connection with a single selected auth entry, modeled on
 * the `Connection` shape of the `@backstage/connections` framework.
 */
export interface JiraConnection {
  type: 'jira';
  title: string;
  host: string;
  /** Base URL of the Jira instance, e.g. `https://example.atlassian.net`. */
  baseUrl: string;
  /** Base URL for REST calls; defaults to `baseUrl`. */
  apiBaseUrl: string;
  auth:
    | { method: 'basic'; email: string; apiToken: string }
    | { method: 'token'; token: string };
}

const authSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('basic'),
      title: z.string().optional(),
      email: z.string().min(1),
      apiToken: z.string().min(1),
    })
    .strict(),
  z
    .object({
      method: z.literal('token'),
      title: z.string().optional(),
      token: z.string().min(1),
    })
    .strict(),
]);

const jiraConnectionSchema = z
  .object({
    type: z.literal('jira'),
    title: z.string().optional(),
    host: z
      .string()
      .min(1)
      .refine(v => !v.includes('/') && !v.includes(':'), {
        message: 'host must be a plain hostname, not a URL',
      }),
    apiBaseUrl: z.string().url().optional(),
    auth: z.array(authSchema).nonempty({
      message: 'must configure at least one auth method',
    }),
  })
  .strict();

/**
 * Reads Jira connections from the top-level `connections` configuration,
 * following the shapes of the BEP-0014 connections framework.
 *
 * The framework's own connection type registry is closed and does not yet
 * include a `jira` type, so this reader parses the `type: jira` entries
 * itself. Once upstream ships a `jira` connection type and a public
 * connections service, this reader can be replaced by that service without
 * any app-config changes.
 */
export class JiraConnectionsReader {
  private constructor(private readonly connections: JiraConnection[]) {}

  static fromConfig(config: RootConfigService): JiraConnectionsReader {
    const raw = config.getOptional('connections');
    if (raw === undefined) {
      return new JiraConnectionsReader([]);
    }
    if (!Array.isArray(raw)) {
      throw new InputError(
        'Expected "connections" config to be an array of connection objects',
      );
    }

    const connections: JiraConnection[] = [];
    const seenHosts = new Set<string>();
    for (const entry of raw) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        (entry as { type?: unknown }).type !== 'jira'
      ) {
        continue;
      }
      const parsed = jiraConnectionSchema.safeParse(entry);
      if (!parsed.success) {
        const host =
          typeof (entry as { host?: unknown }).host === 'string'
            ? (entry as { host: string }).host
            : 'unknown host';
        // Zod issues name paths and expectations but never echo received
        // secret values for the string checks used above.
        const problems = parsed.error.issues
          .map(i => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ');
        throw new InputError(
          `Invalid connection of type "jira" (${host}) in connections config: ${problems}`,
        );
      }
      const { host, title, apiBaseUrl, auth } = parsed.data;
      if (seenHosts.has(host)) {
        throw new InputError(
          `Duplicate connection of type "jira" for host "${host}" in connections config`,
        );
      }
      seenHosts.add(host);
      const baseUrl = `https://${host}`;
      connections.push({
        type: 'jira',
        title: title ?? `Jira (${host})`,
        host,
        baseUrl,
        apiBaseUrl: apiBaseUrl ?? baseUrl,
        // The first configured auth entry wins, matching the framework's
        // default auth selection.
        auth: stripTitle(auth[0]),
      });
    }
    return new JiraConnectionsReader(connections);
  }

  /** Hosts of all configured Jira connections, in configuration order. */
  hosts(): string[] {
    return this.connections.map(c => c.host);
  }

  /**
   * Finds the Jira connection to use, mirroring `ConnectionsService.find`
   * semantics: by host when given, otherwise the sole configured connection.
   */
  find(query: { host?: string } = {}): JiraConnection {
    if (this.connections.length === 0) {
      throw new NotFoundError(
        'No connection of type "jira" is configured. Add an entry with ' +
          '`type: jira` to the top-level `connections` array in app-config.',
      );
    }
    if (query.host !== undefined) {
      const connection = this.connections.find(c => c.host === query.host);
      if (!connection) {
        throw new NotFoundError(
          `No connection of type "jira" is configured for host "${query.host}". ` +
            `Configured hosts: ${this.hosts().join(', ')}`,
        );
      }
      return connection;
    }
    if (this.connections.length > 1) {
      throw new InputError(
        'Multiple connections of type "jira" are configured; select one by ' +
          `adding a "jira/instance" annotation with one of: ${this.hosts().join(', ')}`,
      );
    }
    return this.connections[0];
  }
}

function stripTitle(
  auth: z.infer<typeof authSchema>,
): JiraConnection['auth'] {
  if (auth.method === 'basic') {
    return { method: 'basic', email: auth.email, apiToken: auth.apiToken };
  }
  return { method: 'token', token: auth.token };
}
