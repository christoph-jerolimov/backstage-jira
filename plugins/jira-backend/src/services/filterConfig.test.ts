import { mockServices } from '@backstage/backend-test-utils';
import { readFilterConfig } from './filterConfig';

function configFor(jira?: unknown) {
  return mockServices.rootConfig({
    data: jira === undefined ? {} : { jira },
  });
}

describe('readFilterConfig', () => {
  it('falls back to built-in unresolved/all with unresolved as default', () => {
    expect(readFilterConfig(configFor())).toEqual({
      filters: [
        { id: 'unresolved', name: 'Unresolved', jql: 'resolution = Unresolved' },
        { id: 'all', name: 'All issues', jql: '' },
      ],
      defaultFilterId: 'unresolved',
    });
  });

  it('allows selecting a built-in default without configured filters', () => {
    expect(readFilterConfig(configFor({ defaultFilter: 'all' })).defaultFilterId).toBe(
      'all',
    );
  });

  it('rejects an unknown default without configured filters', () => {
    expect(() => readFilterConfig(configFor({ defaultFilter: 'nope' }))).toThrow(
      /"nope".*unresolved, all/s,
    );
  });

  it('uses configured filters in order', () => {
    const result = readFilterConfig(
      configFor({
        filters: [
          { id: 'mine', name: 'Mine', jql: 'assignee = currentUser()' },
          { id: 'unresolved', name: 'Unresolved', jql: 'resolution = Unresolved' },
        ],
      }),
    );
    expect(result.filters.map(f => f.id)).toEqual(['mine', 'unresolved']);
    expect(result.defaultFilterId).toBe('mine');
  });

  it('honors an explicit default among configured filters', () => {
    const result = readFilterConfig(
      configFor({
        defaultFilter: 'unresolved',
        filters: [
          { id: 'mine', name: 'Mine', jql: 'assignee = currentUser()' },
          { id: 'unresolved', name: 'Unresolved', jql: 'resolution = Unresolved' },
        ],
      }),
    );
    expect(result.defaultFilterId).toBe('unresolved');
  });

  it('treats an omitted jql as an unconstrained filter', () => {
    const result = readFilterConfig(
      configFor({ filters: [{ id: 'everything', name: 'Everything' }] }),
    );
    expect(result.filters[0].jql).toBe('');
  });

  it('rejects duplicate filter ids', () => {
    expect(() =>
      readFilterConfig(
        configFor({
          filters: [
            { id: 'a', name: 'A', jql: 'x = 1' },
            { id: 'a', name: 'A again', jql: 'x = 2' },
          ],
        }),
      ),
    ).toThrow(/Duplicate filter id "a"/);
  });

  it('rejects a default naming a non-existent configured filter', () => {
    expect(() =>
      readFilterConfig(
        configFor({
          defaultFilter: 'nope',
          filters: [{ id: 'a', name: 'A', jql: 'x = 1' }],
        }),
      ),
    ).toThrow(/"nope".*known filter ids: a/s);
  });
});
