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
  filters: JiraFilterInfo[];
  appliedFilter: string;
  project: { key: string; url: string };
}
