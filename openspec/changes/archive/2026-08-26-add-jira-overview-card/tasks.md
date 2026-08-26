## 1. Backend

- [x] 1.1 Add `countIssues` to `JiraClient` (search with `maxResults: 0`, returns `total`) and status-category JQL support in `buildJql` (or a dedicated clause helper), plus `JiraStatusCountsResponse` types with stable category ids; verify with mocked-fetch unit tests asserting the request body and count extraction
- [x] 1.2 Extract the shared entity-resolution/annotation/connection logic from the `/v1/issues` handler and add `GET /v1/status-counts` running the three category counts in parallel with the shared error mapping; verify with router tests covering success (correct totals and ordering), multi-project + component scoping, and the 401/404/500/502 cases

## 2. Frontend

- [x] 2.1 Add `getStatusCounts` to the `JiraApi` client and mirror the response types; verify with a URL-construction unit test
- [x] 2.2 Implement the `JiraOverviewCard` component (`@backstage/ui` Card: three labeled counts, "View issues" link to the relative `jira` path, `Skeleton` loading, compact error state) and register it via `EntityCardBlueprint` with the `isJiraAvailable` filter; verify with component tests for counts rendering, loading, error, and link target, plus an extension test that the card is gated by the annotation

## 3. Docs and verification

- [x] 3.1 Update both READMEs (card description, `status-counts` endpoint reference, custom-overview-layout note); verify samples match the implementation
- [x] 3.2 Full verification: `yarn tsc`, `yarn lint:all`, both plugins' test suites green
- [x] 3.3 End-to-end smoke: extend the mock Jira to answer `statusCategory` count queries, then confirm via API (curl) and Playwright that the Overview page shows the card with correct counts for the annotated entity (and no card for an unannotated one), and that the link lands on the Jira tab
