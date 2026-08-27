// Response types of the jira-backend issues API. Kept in sync manually with
// plugins/jira-backend/src/types.ts; extract a shared package if this grows.

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

/** Stable id of a Jira status category. */
export type StatusCategoryId = 'todo' | 'inprogress' | 'done';

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

/** A comment on a Jira issue, body passed through as raw text. */
export interface JiraComment {
  author?: string;
  created?: string;
  body: string;
}

/** Full detail of a single issue as returned by `GET /v1/issues/:key`. */
export interface JiraIssueDetail extends JiraIssue {
  /** Raw description text, rendered literally. */
  description: string;
  labels: string[];
  reporter?: { displayName: string };
  /** Most recent comments, newest first, capped server-side. */
  comments: JiraComment[];
  /** Total number of comments on the issue. */
  commentTotal: number;
}

/** An active sprint as returned by `GET /v1/sprint`. */
export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

/** Response shape of `GET /v1/sprint`. */
export interface JiraSprintResponse {
  /** The board's active sprint, or null when there is none. */
  sprint: JiraSprint | null;
  issues: JiraIssue[];
  total: number;
}

/** A filter as reported by the issues API. */
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
