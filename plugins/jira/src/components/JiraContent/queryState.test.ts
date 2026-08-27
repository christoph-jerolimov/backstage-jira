import { parseQueryState, queryStateToParams } from './queryState';

const parse = (qs: string, hasBoard = true) =>
  parseQueryState(new URLSearchParams(qs), { hasBoard });

describe('parseQueryState', () => {
  it('returns defaults for empty params', () => {
    expect(parse('')).toEqual({
      query: {
        filterId: undefined,
        sortBy: undefined,
        order: undefined,
        search: undefined,
        startAt: 0,
      },
      view: 'issues',
    });
  });

  it('reads a full state', () => {
    expect(
      parse(
        'filter=all&sortBy=priority&order=asc&search=flux&startAt=50&view=sprint',
      ),
    ).toEqual({
      query: {
        filterId: 'all',
        sortBy: 'priority',
        order: 'asc',
        search: 'flux',
        startAt: 50,
      },
      view: 'sprint',
    });
  });

  it('drops a non-whitelisted sort field and its order', () => {
    const { query } = parse('sortBy=bogus&order=asc');
    expect(query.sortBy).toBeUndefined();
    expect(query.order).toBeUndefined();
  });

  it('drops an invalid order but keeps the sort field', () => {
    const { query } = parse('sortBy=key&order=sideways');
    expect(query.sortBy).toBe('key');
    expect(query.order).toBeUndefined();
  });

  it.each(['-5', 'abc', '1.5'])('drops invalid startAt %s', value => {
    expect(parse(`startAt=${value}`).query.startAt).toBe(0);
  });

  it('ignores the sprint view without a board', () => {
    expect(parse('view=sprint', false).view).toBe('issues');
  });

  it('ignores an unknown view value', () => {
    expect(parse('view=backlog').view).toBe('issues');
  });
});

describe('queryStateToParams', () => {
  it('serializes the default state to an empty string', () => {
    expect(queryStateToParams({ startAt: 0 }, 'issues').toString()).toBe('');
  });

  it('omits order without a sort field', () => {
    expect(
      queryStateToParams({ startAt: 0, order: 'asc' }, 'issues').toString(),
    ).toBe('');
  });

  it('round-trips a full state', () => {
    const state = {
      filterId: 'all',
      sortBy: 'priority' as const,
      order: 'asc' as const,
      search: 'flux capacitor',
      startAt: 100,
    };
    const params = queryStateToParams(state, 'sprint');
    expect(parseQueryState(params, { hasBoard: true })).toEqual({
      query: state,
      view: 'sprint',
    });
  });
});
