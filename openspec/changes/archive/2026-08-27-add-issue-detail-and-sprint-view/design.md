# Design: Add Issue Detail Popover and Sprint View

## Context

Builds on the four merged Jira changes. Relevant current state:

- The router centralizes auth + entity/annotation/connection resolution in `resolveTarget` and Jira-error mapping in `callJira`; both new routes plug into these unchanged.
- `JiraClient` wraps `/rest/api/2/search` and `/rest/api/2/user/search`; issue detail uses `GET /rest/api/2/issue/{key}` (v2 returns description and comment bodies as plain wiki-markup strings on Cloud and Data Center — unlike v3's ADF — which suits literal text rendering). Sprint data comes from the Agile API: `GET /rest/agile/1.0/board/{id}/sprint?state=active`, then `GET /rest/agile/1.0/sprint/{id}/issue` whose issues carry the same `fields` shape as search, so the existing issue mapper is reused.
- The frontend table already has `rowConfig` support in `@backstage/ui` (`onClick` per row); `Dialog`/`DialogBody`/`DialogTrigger` and `ToggleButtonGroup`/`ToggleButton` exist in `@backstage/ui` 0.17.
- `Tabs` exist too, but the tab already lives inside an entity-page tab; a small toggle reads better than nested tabs.

## Goals / Non-Goals

**Goals:**

- Quick, safe (text-only) issue triage without leaving Backstage; sprint visibility for Scrum teams via one optional annotation.
- Reuse resolveTarget/callJira and the issue mapper; no new invariant surfaces.

**Non-Goals:**

- Rendering Jira wiki markup or ADF as rich text (a renderer is a large, security-sensitive dependency; plain text first).
- Backlog/future sprints, sprint switching, or board columns; writing comments; pagination inside the sprint view (capped at the standard 50 with `total` reported — sprints are almost always smaller).
- Caching (tracked separately).

## Decisions

### D1: Detail endpoint is entity-scoped: `GET /v1/issues/:issueKey?entityRef=…`

The entityRef is required even though the key alone would identify the issue: it selects the connection (multi-host) and authorizes the request — the key's project prefix (`ABC` of `ABC-123`, compared case-insensitively) must be one of the entity's annotated project keys, rejected with 404 *before* any Jira call otherwise. This keeps the endpoint from becoming a generic Jira proxy readable with any entity the caller can see. Key shape is validated with a strict regex (`/^[A-Za-z][A-Za-z0-9_]*-\d+$/`); anything else is a 400.

Jira call: `GET /rest/api/2/issue/{key}?fields=summary,description,status,priority,issuetype,reporter,assignee,labels,created,updated,comment`. Comments arrive newest-last under `fields.comment.comments` with a `total`; the endpoint returns the last `MAX_COMMENTS = 5` reversed to newest-first plus the total. Jira's 404 is mapped to our 404 (not 502) since a stale key is a client-visible condition.

**Alternative** (reuse the search endpoint with `key = X` JQL): cannot fetch description/comments without widening the search field list for every row; rejected.

### D2: Plain-text rendering end to end

The API passes description/comment bodies through untouched; the dialog renders them inside text nodes with `white-space: pre-wrap`. React's default escaping guarantees markup is displayed literally — no `dangerouslySetInnerHTML` anywhere. This is the spec's "markup is not interpreted" requirement and the reason no sanitizer dependency is needed.

### D3: Sprint endpoint resolves board → active sprint → issues

`GET /v1/sprint?entityRef=…` reads the new `jira/board-id` annotation (positive integer; missing/invalid → 404 naming the annotation — consistent with how a missing `jira/project-key` behaves). `JiraClient.getActiveSprint` calls the board's `sprint?state=active` endpoint and takes the first sprint (Jira allows parallel sprints only with a setting; first is the standard case), then `getSprintIssues` fetches its issues with the standard field list and 50-cap, mapped by the existing issue mapper. No active sprint → `200 { sprint: null, issues: [], total: 0 }` so the frontend renders an empty state, not an error branch.

**Alternative** (infer the board from the project via board search): boards-per-project is many-to-many in Jira and the heuristics are wrong often enough that an explicit annotation is kinder; rejected.

### D4: Frontend composition

- **Detail dialog**: `JiraContent` gets `rowConfig={{ onClick }}` storing the clicked issue key in state; a controlled `Dialog` fetches via `jiraApi.getIssueDetail` (`useAsync` keyed on the open key), with skeleton/error states inside the dialog. The row's key-link keeps its existing open-in-Jira behavior (`event.stopPropagation` not needed — the anchor click doesn't trigger row `onClick` in react-aria tables; verified in implementation tests).
- **Sprint view**: a `ToggleButtonGroup` ("Issues" | "Sprint") rendered only when the entity has `jira/board-id`. Sprint mode swaps the filter/search/pagination controls for a sprint header (name, dates, goal, state `Tag`) and reuses the same `columnConfig` in a second `Table` fed by `jiraApi.getSprint`. The issue table's query state is preserved while toggled away, so switching back is instant and non-destructive.
- Both dialogs' issue rows also open the detail popover in sprint mode (same handler).

### D5: Types and API client

`JiraIssueDetail` (issue fields + `description`, `labels`, `reporter`, `comments: [{author, created, body}]`, `commentTotal`) and `JiraSprintResponse` (`sprint: {...} | null`, `issues`, `total`) added to the backend `types.ts` and mirrored in the frontend as before. `JiraApi` gains `getIssueDetail({entityRef, issueKey})` and `getSprint({entityRef})`.

## Risks / Trade-offs

- **[Agile API availability]** → `/rest/agile/1.0` exists on Jira Cloud and Data Center with Jira Software; a Jira without it returns 404 which surfaces via the 502/404 mapping with a clear message. Documented in the README.
- **[Row click vs. text selection / link clicks]** → react-aria row actions ignore anchor clicks and text drags; covered by a component test asserting the key link still navigates and row click opens the dialog.
- **[Comment volume]** → hard cap of 5 with `commentTotal` surfaced ("5 of 23"); no pagination in the dialog by design.
- **[Parallel sprints]** → first active sprint only; the response includes the sprint name so ambiguity is visible. Documented.

## Migration Plan

Additive endpoints, annotation, and UI. Deploy by merging; entities without `jira/board-id` see only the new row-click dialog. Rollback by reverting.
