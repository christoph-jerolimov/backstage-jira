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
 * Reads `jira.filters` and `jira.defaultFilter` from configuration, falling
 * back to the built-in unresolved/all filters when none are configured.
 */
export function readFilterConfig(config: RootConfigService): JiraFilterConfig {
  const filterConfigs = config.getOptionalConfigArray('jira.filters');
  const defaultFilterId = config.getOptionalString('jira.defaultFilter');

  if (!filterConfigs || filterConfigs.length === 0) {
    if (defaultFilterId && !BUILT_IN_FILTERS.some(f => f.id === defaultFilterId)) {
      throw new InputError(
        `jira.defaultFilter is "${defaultFilterId}" but no jira.filters are ` +
          `configured; known built-in filter ids: ${BUILT_IN_FILTERS.map(f => f.id).join(', ')}`,
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
    if (seen.has(id)) {
      throw new InputError(`Duplicate filter id "${id}" in jira.filters`);
    }
    seen.add(id);
    filters.push({ id, name, jql: jql.trim() });
  }

  const resolvedDefault = defaultFilterId ?? filters[0].id;
  if (!seen.has(resolvedDefault)) {
    throw new InputError(
      `jira.defaultFilter is "${resolvedDefault}" but no filter with that id ` +
        `exists; known filter ids: ${[...seen].join(', ')}`,
    );
  }
  return { filters, defaultFilterId: resolvedDefault };
}
