## 1. Backend: query construction

- [x] 1.1 Extend `buildJql` for multi-project (`project IN (...)` with per-key escaping), whitelisted `ORDER BY` (field + direction), and `summary ~` search using `toJqlString`; add the `SORT_FIELDS` whitelist to `plugins/jira-backend/src/types.ts` and verify with unit tests covering single/multi project, each sort field, direction toggle, search escaping of `"`/`\`, and combinations
- [x] 1.2 Extend `JiraClient.searchIssues` to accept `startAt`/`maxResults` and return `startAt`/`pageSize` alongside `total`; verify with mocked-fetch tests asserting the request body paging fields and response mapping

## 2. Backend: router

- [x] 2.1 Parse and validate the new query parameters (`startAt`, `limit` numeric ≥ 0 with limit capped at 50, `sortBy` against `SORT_FIELDS`, `order` asc/desc, `search` trimmed) returning 400 with allowed values on violations; split `jira/project-key` on commas; extend the response with `startAt`, `pageSize`, and `projects` while keeping `project`; verify with router tests for each 400 case, the multi-project JQL, paging passthrough, and default behavior when no new params are sent (unchanged JQL and response fields)

## 3. Frontend

- [x] 3.1 Extend the `JiraApi` client and `types.ts` mirror with the new parameters and response fields; verify with URL-construction unit tests (params present only when set)
- [x] 3.2 Rework `JiraContent` query state (`filterId`, `sortBy`, `order`, `search`, `startAt`; filter/sort/search changes reset `startAt`), wire `Table` `pagination: { type: 'page' }` from `total`/`pageSize`/`startAt`, sortable columns mapped to the whitelist with server-side re-fetch, and a debounced `SearchField`; verify with component tests for page navigation, sort toggle re-fetch (asserting request params), debounced search, search-clear, and page reset on filter change
- [x] 3.3 Update the empty state to mention search when a search is active, and verify via component test

## 4. Docs and verification

- [x] 4.1 Update both plugin READMEs (multi-key annotation, sort whitelist and Jira rank-order note, `~` word-match note, pagination) and the `jira/project-key` example comment in `examples/entities.yaml`; verify samples match the implementation
- [x] 4.2 Full verification: `yarn tsc`, `yarn lint:all`, and both plugins' test suites green
- [x] 4.3 End-to-end smoke against the mock Jira (extend the mock to honor `startAt`/`maxResults` and echo JQL): confirm paging through >50 issues, a sorted request's `ORDER BY`, a search request's `summary ~` clause, and a multi-project entity's `project IN` clause; UI pass with Playwright covering pagination control, column sort, and search box
