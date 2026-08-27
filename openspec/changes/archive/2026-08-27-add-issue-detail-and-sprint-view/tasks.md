## 1. Backend: Jira client

- [x] 1.1 Add `getIssue` to `JiraClient` (`GET /rest/api/2/issue/{key}` with the detail field list, mapping to `JiraIssueDetail` with last-5-newest-first comments and `commentTotal`, Jira 404 surfaced distinctly from other failures) plus the `JiraIssueDetail` type; verify with mocked-fetch unit tests covering field mapping, comment capping/ordering, 404, and error mapping
- [x] 1.2 Add `getActiveSprint` and `getSprintIssues` to `JiraClient` (Agile API board active-sprint lookup returning the first active sprint or undefined, sprint issues via the existing issue mapper with the 50-cap) plus the `JiraSprintResponse` type; verify with mocked-fetch unit tests for active sprint, no sprint, and issue mapping

## 2. Backend: routes

- [x] 2.1 Add `GET /v1/issues/:issueKey` — strict key-shape validation (400), case-insensitive project-prefix authorization against the entity's annotated keys rejecting foreign keys with 404 before any Jira call, `resolveTarget`/`callJira` reuse; verify with router tests for success, foreign key, malformed key, unknown issue (Jira 404), and auth
- [x] 2.2 Add `GET /v1/sprint` — `jira/board-id` annotation parsing (missing/non-numeric → 404 naming the annotation), active sprint + issues response with null-sprint 200 case; verify with router tests for success, no active sprint, missing annotation, and invalid annotation

## 3. Frontend

- [x] 3.1 Extend `JiraApi` with `getIssueDetail` and `getSprint`, mirror the new types, and verify with URL-construction unit tests
- [x] 3.2 Implement the `IssueDetailDialog` (fields, labels, plain-text description and comments with `pre-wrap`, "Open in Jira" link, loading/error states) wired to row clicks via `rowConfig.onClick` in `JiraContent`; verify with component tests for open-on-row-click, literal rendering of markup-like text, dismiss, error state, and the key link still navigating to Jira
- [x] 3.3 Implement the sprint view — `ToggleButtonGroup` shown only with a `jira/board-id` annotation, sprint header (name, state tag, dates, goal), sprint issue table reusing the column config, empty state for no active sprint, preserved issue-view state when toggling; verify with component tests for toggle gating, sprint rendering, no-sprint empty state, and state preservation

## 4. Docs and verification

- [x] 4.1 Update both READMEs (row-click detail dialog, `jira/board-id` annotation, Agile API note, comment cap) and add `jira/board-id` to the example entity comments in `examples/entities.yaml`; verify samples match the implementation
- [x] 4.2 Full verification: `yarn tsc`, `yarn lint:all`, both plugins' test suites green
- [x] 4.3 End-to-end smoke: extend the mock Jira with `/rest/api/2/issue/{key}` and Agile board/sprint endpoints, annotate the example entity with a board id, then verify via API (curl) and Playwright: row click opens the dialog with description and comments rendered literally, the sprint toggle appears and shows the active sprint's issues, and an entity without the board annotation shows no toggle
