// Response types of the jira-backend issues API. Kept in sync manually with
// plugins/jira-backend/src/types.ts; extract a shared package if this grows.

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
  filters: JiraFilterInfo[];
  appliedFilter: string;
  project: { key: string; url: string };
}
