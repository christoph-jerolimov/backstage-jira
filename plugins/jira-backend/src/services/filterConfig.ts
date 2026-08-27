import { RootConfigService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';

/** A named issue filter offered to the frontend. */
export interface JiraFilter {
  id: string;
  name: string;
  /** JQL fragment ANDed onto the project constraint; empty means no constraint. */
  jql: string;
}

export interface JiraFilterConfig {
  filters: JiraFilter[];
  defaultFilterId: string;
}

const BUILT_IN_FILTERS: JiraFilter[] = [
  { id: 'unresolved', name: 'Unresolved', jql: 'resolution = Unresolved' },
  { id: 'all', name: 'All issues', jql: '' },
];

/**
 * Id of the dynamic built-in filter scoping issues to the caller's Jira
 * account. Always offered in addition to the configured filters; its JQL is
 * built per request rather than from configuration.
 */
export const ASSIGNED_TO_ME_FILTER_ID = 'assigned-to-me';

/** Display name of the assigned-to-me filter. */
export const ASSIGNED_TO_ME_FILTER_NAME = 'Assigned to me';

/**
 * Reads `jira.filters` and `jira.defaultFilter` from configuration, falling
 * back to the built-in unresolved/all filters when none are configured.
 */
export function readFilterConfig(config: RootConfigService): JiraFilterConfig {
  const filterConfigs = config.getOptionalConfigArray('jira.filters');
  const defaultFilterId = config.getOptionalString('jira.defaultFilter');

  if (!filterConfigs || filterConfigs.length === 0) {
    if (
      defaultFilterId &&
      defaultFilterId !== ASSIGNED_TO_ME_FILTER_ID &&
      !BUILT_IN_FILTERS.some(f => f.id === defaultFilterId)
    ) {
      throw new InputError(
        `jira.defaultFilter is "${defaultFilterId}" but no jira.filters are ` +
          `configured; known built-in filter ids: ${[
            ...BUILT_IN_FILTERS.map(f => f.id),
            ASSIGNED_TO_ME_FILTER_ID,
          ].join(', ')}`,
      );
    }
    return {
      filters: BUILT_IN_FILTERS,
      defaultFilterId: defaultFilterId ?? 'unresolved',
    };
  }

  const filters: JiraFilter[] = [];
  const seen = new Set<string>();
  for (const filterConfig of filterConfigs) {
    const id = filterConfig.getString('id');
    const name = filterConfig.getString('name');
    // Omitting jql declares an unconstrained "all issues" filter; an empty
    // string is rejected by the config layer itself.
    const jql = filterConfig.getOptionalString('jql') ?? '';
    if (id === ASSIGNED_TO_ME_FILTER_ID) {
      throw new InputError(
        `Filter id "${ASSIGNED_TO_ME_FILTER_ID}" in jira.filters is reserved ` +
          'for the built-in user-scoped filter',
      );
    }
    if (seen.has(id)) {
      throw new InputError(`Duplicate filter id "${id}" in jira.filters`);
    }
    seen.add(id);
    filters.push({ id, name, jql: jql.trim() });
  }

  const resolvedDefault = defaultFilterId ?? filters[0].id;
  if (
    resolvedDefault !== ASSIGNED_TO_ME_FILTER_ID &&
    !seen.has(resolvedDefault)
  ) {
    throw new InputError(
      `jira.defaultFilter is "${resolvedDefault}" but no filter with that id ` +
        `exists; known filter ids: ${[...seen].join(', ')}`,
    );
  }
  return { filters, defaultFilterId: resolvedDefault };
}
