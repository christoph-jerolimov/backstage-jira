import { SORT_FIELDS, SortField, SortOrder } from '../../types';

/** Query state of the issues view, driven by the page URL. */
export interface IssueQuery {
  filterId?: string;
  sortBy?: SortField;
  order?: SortOrder;
  search?: string;
  startAt: number;
}

/** Which view of the Jira tab is shown. */
export type JiraView = 'issues' | 'sprint';

export interface JiraQueryState {
  query: IssueQuery;
  view: JiraView;
}

/**
 * Reads the tab's query state from URL search parameters. Unknown or invalid
 * values are dropped in favor of the defaults - a shared URL must never
 * produce an error.
 */
export function parseQueryState(
  params: URLSearchParams,
  options: { hasBoard: boolean },
): JiraQueryState {
  const sortByParam = params.get('sortBy');
  const sortBy = SORT_FIELDS.includes(sortByParam as SortField)
    ? (sortByParam as SortField)
    : undefined;
  const orderParam = params.get('order');
  const order =
    sortBy && (orderParam === 'asc' || orderParam === 'desc')
      ? orderParam
      : undefined;
  const startAtParam = Number(params.get('startAt'));
  const startAt =
    Number.isInteger(startAtParam) && startAtParam > 0 ? startAtParam : 0;

  return {
    query: {
      filterId: params.get('filter') || undefined,
      sortBy,
      order,
      search: params.get('search') || undefined,
      startAt,
    },
    view:
      options.hasBoard && params.get('view') === 'sprint' ? 'sprint' : 'issues',
  };
}

/**
 * Serializes the tab's query state into URL search parameters, omitting
 * every default so the URL stays clean in the default state.
 */
export function queryStateToParams(
  query: IssueQuery,
  view: JiraView,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.filterId) {
    params.set('filter', query.filterId);
  }
  if (query.sortBy) {
    params.set('sortBy', query.sortBy);
    if (query.order) {
      params.set('order', query.order);
    }
  }
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.startAt > 0) {
    params.set('startAt', String(query.startAt));
  }
  if (view === 'sprint') {
    params.set('view', 'sprint');
  }
  return params;
}
