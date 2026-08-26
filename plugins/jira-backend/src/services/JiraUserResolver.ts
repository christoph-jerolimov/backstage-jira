import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { JIRA_USER_EMAIL_ANNOTATION } from '../annotations';
import { JiraClient } from './JiraClient';
import { JiraConnection } from './JiraConnectionsReader';

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Resolves the authenticated Backstage user to a Jira account identifier:
 * User entity (on behalf of the caller) -> email -> Jira user search.
 * Successful resolutions are cached per host and email.
 */
export class JiraUserResolver {
  readonly #catalog: CatalogService;
  readonly #jiraClient: JiraClient;
  readonly #cacheTtlMs: number;
  readonly #cache = new Map<string, { account: string; expires: number }>();

  constructor(options: {
    catalog: CatalogService;
    jiraClient: JiraClient;
    cacheTtlMs?: number;
  }) {
    this.#catalog = options.catalog;
    this.#jiraClient = options.jiraClient;
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async resolveAssignee(options: {
    credentials: BackstageCredentials;
    connection: JiraConnection;
  }): Promise<string> {
    const { credentials, connection } = options;
    const principal = credentials.principal as {
      type?: string;
      userEntityRef?: string;
    };
    if (principal?.type !== 'user' || !principal.userEntityRef) {
      throw new InputError(
        'The "assigned-to-me" filter requires a signed-in user',
      );
    }
    const userEntityRef = principal.userEntityRef;

    const userEntity = await this.#catalog.getEntityByRef(userEntityRef, {
      credentials,
    });
    if (!userEntity) {
      throw new NotFoundError(
        `No catalog User entity found for "${userEntityRef}"; the ` +
          '"assigned-to-me" filter needs one to determine your email',
      );
    }
    const profile = (userEntity.spec as { profile?: { email?: string } })
      ?.profile;
    const email =
      userEntity.metadata.annotations?.[JIRA_USER_EMAIL_ANNOTATION] ??
      profile?.email;
    if (!email) {
      throw new NotFoundError(
        `User entity "${userEntityRef}" has no profile email; set one or ` +
          `add a "${JIRA_USER_EMAIL_ANNOTATION}" annotation to use the ` +
          '"assigned-to-me" filter',
      );
    }

    const cacheKey = `${connection.host}:${email}`;
    const cached = this.#cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.account;
    }

    const account = await this.#jiraClient.findUser({ connection, email });
    if (!account) {
      throw new NotFoundError(
        `Jira at ${connection.host} has no account matching the email of ` +
          `"${userEntityRef}"; set the "${JIRA_USER_EMAIL_ANNOTATION}" ` +
          'annotation to the email known to Jira',
      );
    }
    this.#cache.set(cacheKey, {
      account,
      expires: Date.now() + this.#cacheTtlMs,
    });
    return account;
  }
}
