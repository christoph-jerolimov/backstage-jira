# Design: Enhance Jira Issue Querying

## Context

Builds directly on the merged `add-jira-plugin` change (see `openspec/changes/archive/2026-08-26-add-jira-plugin/`). Relevant current state:

- `buildJql` in `plugins/jira-backend/src/services/JiraClient.ts` produces `project = "KEY" [AND component = "..."] [AND (filter)] ORDER BY updated DESC`, with `toJqlString` handling quoted-string escaping.
- `JiraClient.searchIssues` posts to `/rest/api/2/search` with a hardcoded `maxResults: 50` and already reads `total` from the response; `startAt` is not sent.
- The router validates `entityRef`/`filter` and maps errors; the response type `JiraIssuesResponse` carries `issues`, `total`, `filters`, `appliedFilter`, `project`.
- The frontend `JiraContent` renders `@backstage/ui` `Table` with `pagination: { type: 'none' }`; `useTable`, `TablePagination`, `SearchField`, and `ColumnConfig.isSortable` + `TableProps.sort` (a `SortState`) exist in `@backstage/ui` 0.17.
- `project.key`/`project.url` in the response assume a single project.

## Goals / Non-Goals

**Goals:**

- Offset pagination, whitelisted server-side sorting, and summary `~` search on the existing endpoint, backward compatibly.
- Multi-project `jira/project-key` (comma-separated) via `project IN (...)`.
- Keep the no-caller-JQL invariant: every new parameter is an enum, a number, or an escaped literal.

**Non-Goals:**

- Cursor pagination, searching fields other than summary, per-user saved sort/search preferences, and the overview-card/caching ideas (separate changes).
- New config keys.

## Decisions

### D1: Extend the existing endpoint, not a new one

`GET /v1/issues` gains optional `startAt`, `limit`, `sortBy`, `order`, `search`. Omitted parameters reproduce today's behavior exactly (offset 0, limit 50, `updated`/`desc`, no search), so the old client keeps working during rollout. The response adds `startAt` and `pageSize` next to the existing `total`.

**Alternative** (`/v2/issues`): rejected — the change is additive; versioning would duplicate the router for no compatibility gain.

### D2: Sort whitelist as a shared constant

`SORT_FIELDS = ['updated', 'created', 'key', 'priority', 'status', 'summary']` and `order ∈ {asc, desc}` validated in the router; `buildJql` receives the validated pair and emits `ORDER BY <field> <ASC|DESC>`. The whitelist lives in the backend's `types.ts` (mirrored in the frontend copy) so the table's sortable columns and the validator cannot drift apart. JQL sorts `priority`/`status` by their Jira rank order, which is what users expect from those columns.

**Alternative** (accept any Jira field name): rejected — arbitrary field names are a JQL injection surface and fail unpredictably per Jira instance.

### D3: Search via `summary ~` with existing escaping

`search` is trimmed; when non-empty, `buildJql` appends `AND summary ~ ${toJqlString(text)}`. `toJqlString` already escapes `"` and `\`, so metacharacters are matched literally (Jira's `~` still applies its own word matching to the *content*, which is the desired "contains" semantics). Empty/whitespace-only search is treated as absent. The frontend debounces input (~300 ms) before updating the query state.

### D4: Multi-project annotation parsing

The router splits `jira/project-key` on commas, trims entries, and drops empties; one key yields `project = "KEY"` (unchanged), several yield `project IN ("A", "B")` with each key escaped individually. The response's `project` field stays for compatibility but is derived from the *first* key, and a new `projects: [{ key, url }]` array carries all of them; the frontend ignores `project` already except for nothing — it doesn't use it — so no UI change is required beyond types. The frontend `isJiraAvailable` predicate is unchanged (non-empty string).

### D5: Frontend state and table wiring

`JiraContent` keeps one query-state object `{ filterId, sortBy, order, search, startAt }`; any change to filter/sort/search resets `startAt` to 0. The `@backstage/ui` `Table` gets `pagination: { type: 'page', ... }` fed from `total`/`pageSize`/`startAt` (page size stays the server default of 50), `sort` + sortable columns mapped to the whitelist, and a `SearchField` above the table next to the filter `Select`. Sorting and paging both come from the server, so the table never sorts client-side (`isStale` covers in-flight refreshes, as today).

## Risks / Trade-offs

- **[Offset pagination can skip/duplicate rows if issues change between page fetches]** → Accepted for a read-only view; `ORDER BY` keys are stable enough in practice and a refresh reconciles. Cursor pagination is not offered by Jira's v2 search API anyway.
- **[Jira Cloud is deprecating unbounded offset search in `/rest/api/3/search/jql` (cursor-based)]** → We stay on `/rest/api/2/search`, which Data Center keeps and Cloud still serves; the client isolates the call so a future cursor migration touches one method.
- **[`summary ~` word-matching may surprise users expecting substring match]** → Documented in the README; acceptable because it is Jira's native search behavior for text fields.
- **[Sorting by `status`/`priority` uses Jira rank order, not alphabetical]** → Intentional and documented; matches Jira's own UI.

## Migration Plan

Additive change to already-merged plugins: implement, test, merge. No config or annotation migrations — existing single-key annotations and existing API calls behave identically. Rollback is reverting the PR.
