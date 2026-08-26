/** Fields the issues API accepts for server-side sorting. */
export const SORT_FIELDS = [
  'updated',
  'created',
  'key',
  'priority',
  'status',
  'summary',
] as const;

/** A whitelisted sort field. */
export type SortField = (typeof SORT_FIELDS)[number];

/** Sort direction. */
export type SortOrder = 'asc' | 'desc';

/** Maximum (and default) page size served by the issues API. */
export const MAX_PAGE_SIZE = 50;

/** Jira's three fixed status categories, in display order. */
export const STATUS_CATEGORIES = [
  { id: 'todo', name: 'To Do' },
  { id: 'inprogress', name: 'In Progress' },
  { id: 'done', name: 'Done' },
] as const;

/** Stable id of a Jira status category. */
export type StatusCategoryId = (typeof STATUS_CATEGORIES)[number]['id'];

/** Response shape of `GET /v1/status-counts`. */
export interface JiraStatusCountsResponse {
  /** Counts per status category, ordered To Do, In Progress, Done. */
  categories: Array<{ id: StatusCategoryId; name: string; count: number }>;
  total: number;
}

/** A single Jira issue as returned by the issues API. */
export interface JiraIssue {
  key: string;
  /** Browse URL of the issue on the Jira instance. */
  url: string;
  summary: string;
  type: { name?: string; iconUrl?: string };
  status: { name?: string; category?: string };
  priority: { name?: string; iconUrl?: string };
  assignee?: { displayName: string };
  created?: string;
  updated?: string;
}

/** A filter as reported to the frontend. */
export interface JiraFilterInfo {
  id: string;
  name: string;
  default: boolean;
}

/** Response shape of `GET /v1/issues`. */
export interface JiraIssuesResponse {
  issues: JiraIssue[];
  total: number;
  /** Offset of the first returned issue. */
  startAt: number;
  /** Maximum number of issues per page. */
  pageSize: number;
  filters: JiraFilterInfo[];
  appliedFilter: string;
  /** First annotated project, kept for backward compatibility. */
  project: { key: string; url: string };
  /** All annotated projects. */
  projects: Array<{ key: string; url: string }>;
}
