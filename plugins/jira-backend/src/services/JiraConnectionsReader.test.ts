import { mockServices } from '@backstage/backend-test-utils';
import { JiraConnectionsReader } from './JiraConnectionsReader';

function readerFor(connections?: unknown) {
  return JiraConnectionsReader.fromConfig(
    mockServices.rootConfig({
      data: connections === undefined ? {} : { connections },
    }),
  );
}

describe('JiraConnectionsReader', () => {
  it('parses a valid basic auth entry', () => {
    const reader = readerFor([
      {
        type: 'jira',
        host: 'example.atlassian.net',
        auth: [{ method: 'basic', email: 'bot@example.com', apiToken: 's3cret' }],
      },
    ]);
    expect(reader.find()).toEqual({
      type: 'jira',
      title: 'Jira (example.atlassian.net)',
      host: 'example.atlassian.net',
      baseUrl: 'https://example.atlassian.net',
      apiBaseUrl: 'https://example.atlassian.net',
      auth: { method: 'basic', email: 'bot@example.com', apiToken: 's3cret' },
    });
  });

  it('parses a token auth entry with custom title and apiBaseUrl', () => {
    const reader = readerFor([
      {
        type: 'jira',
        title: 'Corp Jira',
        host: 'jira.example.com',
        apiBaseUrl: 'https://jira.example.com/jira',
        auth: [{ method: 'token', token: 'pat' }],
      },
    ]);
    expect(reader.find()).toEqual(
      expect.objectContaining({
        title: 'Corp Jira',
        apiBaseUrl: 'https://jira.example.com/jira',
        auth: { method: 'token', token: 'pat' },
      }),
    );
  });

  it('ignores entries of other connection types', () => {
    const reader = readerFor([
      { type: 'github', host: 'github.com', auth: [{ method: 'none' }] },
    ]);
    expect(reader.hosts()).toEqual([]);
  });

  it('throws NotFoundError when no jira connection is configured', () => {
    expect(() => readerFor().find()).toThrow(
      /No connection of type "jira" is configured/,
    );
    expect(() => readerFor([]).find()).toThrow(
      /No connection of type "jira" is configured/,
    );
  });

  it('rejects an empty auth array', () => {
    expect(() =>
      readerFor([{ type: 'jira', host: 'a.example.com', auth: [] }]),
    ).toThrow(/at least one auth method/);
  });

  it('rejects an unknown auth method without echoing secrets', () => {
    let error: Error | undefined;
    try {
      readerFor([
        {
          type: 'jira',
          host: 'a.example.com',
          auth: [{ method: 'oauth', secretValue: 'super-secret' }],
        },
      ]);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/Invalid connection of type "jira"/);
    expect(error?.message).toMatch(/a\.example\.com/);
    expect(error?.message).not.toContain('super-secret');
  });

  it('rejects a basic auth entry missing apiToken', () => {
    expect(() =>
      readerFor([
        {
          type: 'jira',
          host: 'a.example.com',
          auth: [{ method: 'basic', email: 'bot@example.com' }],
        },
      ]),
    ).toThrow(/apiToken/);
  });

  it('rejects a host that looks like a URL', () => {
    expect(() =>
      readerFor([
        {
          type: 'jira',
          host: 'https://a.example.com',
          auth: [{ method: 'token', token: 't' }],
        },
      ]),
    ).toThrow(/plain hostname/);
  });

  it('rejects duplicate hosts', () => {
    expect(() =>
      readerFor([
        { type: 'jira', host: 'a.example.com', auth: [{ method: 'token', token: 't' }] },
        { type: 'jira', host: 'a.example.com', auth: [{ method: 'token', token: 't' }] },
      ]),
    ).toThrow(/Duplicate connection/);
  });

  describe('multi-host resolution', () => {
    const two = [
      { type: 'jira', host: 'a.example.com', auth: [{ method: 'token', token: 'ta' }] },
      { type: 'jira', host: 'b.example.com', auth: [{ method: 'token', token: 'tb' }] },
    ];

    it('selects by host', () => {
      expect(readerFor(two).find({ host: 'b.example.com' }).auth).toEqual({
        method: 'token',
        token: 'tb',
      });
    });

    it('requires disambiguation without a host', () => {
      expect(() => readerFor(two).find()).toThrow(/jira\/instance/);
    });

    it('reports the configured hosts for an unknown host', () => {
      expect(() => readerFor(two).find({ host: 'c.example.com' })).toThrow(
        /a\.example\.com, b\.example\.com/,
      );
    });
  });

  it('uses the first auth entry when several are configured', () => {
    const reader = readerFor([
      {
        type: 'jira',
        host: 'a.example.com',
        auth: [
          { method: 'token', token: 'first' },
          { method: 'basic', email: 'x@example.com', apiToken: 'second' },
        ],
      },
    ]);
    expect(reader.find().auth).toEqual({ method: 'token', token: 'first' });
  });
});
