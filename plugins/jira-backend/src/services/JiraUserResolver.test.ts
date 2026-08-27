import { mockCredentials } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { JiraClient } from './JiraClient';
import { JiraConnection } from './JiraConnectionsReader';
import { JiraUserResolver } from './JiraUserResolver';

const connection: JiraConnection = {
  type: 'jira',
  title: 'Jira (example.atlassian.net)',
  host: 'example.atlassian.net',
  baseUrl: 'https://example.atlassian.net',
  apiBaseUrl: 'https://example.atlassian.net',
  auth: { method: 'token', token: 'secret' },
};

const userEntity = (options?: {
  email?: string;
  annotations?: Record<string, string>;
}) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'User',
  metadata: {
    name: 'mock',
    namespace: 'default',
    annotations: options?.annotations,
  },
  spec: options?.email ? { profile: { email: options.email } } : {},
});

function resolverWith(options: {
  entities?: object[];
  findUser?: jest.Mock;
  cacheTtlMs?: number;
}) {
  const findUser = options.findUser ?? jest.fn().mockResolvedValue('abc-123');
  const jiraClient = { findUser } as unknown as JiraClient;
  const resolver = new JiraUserResolver({
    catalog: catalogServiceMock({ entities: (options.entities ?? []) as any }),
    jiraClient,
    cacheTtlMs: options.cacheTtlMs,
  });
  return { resolver, findUser };
}

const credentials = mockCredentials.user('user:default/mock');

describe('JiraUserResolver', () => {
  it('resolves via the profile email', async () => {
    const { resolver, findUser } = resolverWith({
      entities: [userEntity({ email: 'dana@example.com' })],
    });
    await expect(
      resolver.resolveAssignee({ credentials, connection }),
    ).resolves.toBe('abc-123');
    expect(findUser).toHaveBeenCalledWith({
      connection,
      email: 'dana@example.com',
    });
  });

  it('prefers the jira/user-email annotation over the profile email', async () => {
    const { resolver, findUser } = resolverWith({
      entities: [
        userEntity({
          email: 'dana@example.com',
          annotations: { 'jira/user-email': 'dana.b@corp.example.com' },
        }),
      ],
    });
    await resolver.resolveAssignee({ credentials, connection });
    expect(findUser).toHaveBeenCalledWith({
      connection,
      email: 'dana.b@corp.example.com',
    });
  });

  it('rejects non-user principals', async () => {
    const { resolver } = resolverWith({});
    await expect(
      resolver.resolveAssignee({
        credentials: mockCredentials.service(),
        connection,
      }),
    ).rejects.toThrow(/requires a signed-in user/);
  });

  it('rejects a caller without a User entity', async () => {
    const { resolver } = resolverWith({ entities: [] });
    await expect(
      resolver.resolveAssignee({ credentials, connection }),
    ).rejects.toThrow(/No catalog User entity/);
  });

  it('rejects a User entity without an email', async () => {
    const { resolver } = resolverWith({ entities: [userEntity()] });
    await expect(
      resolver.resolveAssignee({ credentials, connection }),
    ).rejects.toThrow(/no profile email/);
  });

  it('rejects an email unknown to Jira without caching it', async () => {
    const findUser = jest.fn().mockResolvedValue(undefined);
    const { resolver } = resolverWith({
      entities: [userEntity({ email: 'ghost@example.com' })],
      findUser,
    });
    await expect(
      resolver.resolveAssignee({ credentials, connection }),
    ).rejects.toThrow(/no account matching/);
    await expect(
      resolver.resolveAssignee({ credentials, connection }),
    ).rejects.toThrow(/no account matching/);
    expect(findUser).toHaveBeenCalledTimes(2);
  });

  it('caches successful resolutions per host and email', async () => {
    const { resolver, findUser } = resolverWith({
      entities: [userEntity({ email: 'dana@example.com' })],
    });
    await resolver.resolveAssignee({ credentials, connection });
    await resolver.resolveAssignee({ credentials, connection });
    expect(findUser).toHaveBeenCalledTimes(1);

    const otherHost = {
      ...connection,
      host: 'other.example.com',
    };
    await resolver.resolveAssignee({ credentials, connection: otherHost });
    expect(findUser).toHaveBeenCalledTimes(2);
  });

  it('re-resolves after the cache TTL expires', async () => {
    const { resolver, findUser } = resolverWith({
      entities: [userEntity({ email: 'dana@example.com' })],
      cacheTtlMs: -1,
    });
    await resolver.resolveAssignee({ credentials, connection });
    await resolver.resolveAssignee({ credentials, connection });
    expect(findUser).toHaveBeenCalledTimes(2);
  });
});
