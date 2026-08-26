# Enhance Jira Issue Querying

## Why

The Jira entity tab shipped with a fixed first page of 50 issues, no sorting, and no way to search — busy projects silently truncate, and users cannot find a specific issue. Entities owning several Jira projects also cannot be represented, since `jira/project-key` accepts a single key.

## What Changes

- **Pagination**: the issues API accepts an offset and page size; the table gains a pagination control driven by the response's `total`, so all issues of a project are reachable.
- **Server-side sorting**: sortable table columns (updated, created, key, priority, status, summary) mapped to JQL `ORDER BY` in the backend against a fixed whitelist of sort fields; callers can never inject arbitrary JQL.
- **Summary text search**: a search box in the tab, executed server-side with the JQL `~` (contains) operator on the summary field, with the search text escaped as a quoted JQL string.
- **Multiple projects per entity**: `jira/project-key` accepts a comma-separated list (`PROJ1,PROJ2`), queried via JQL `project IN (...)`.
- API response is extended with paging metadata (`startAt`, `pageSize`, kept alongside the existing `total`); existing response fields are unchanged, so this is backward compatible.

## Capabilities

### New Capabilities

_None — all changes extend existing capabilities._

### Modified Capabilities

- `jira-issues-api`: the lookup endpoint gains pagination (`startAt`, `limit`), whitelisted sorting (`sortBy`, `order`), summary search (`search`) parameters, and multi-project resolution from a comma-separated `jira/project-key`; validation/error mapping covers the new parameters.
- `jira-entity-issues`: the table gains a pagination control, sortable columns, and a summary search box, all executed via the backend.

## Impact

- **Modified code**: `plugins/jira-backend` (router validation, `buildJql`, `JiraClient.searchIssues` paging), `plugins/jira` (`JiraApi` client params, `JiraContent` table pagination/sort/search state), shared `types.ts` in both packages.
- **No config changes**: no new app-config keys; the `jira/project-key` annotation format is extended compatibly (single keys keep working).
- **No new dependencies**: `@backstage/ui` already ships `TablePagination` and `SearchField`.
