# jira-issues-api Specification

## Purpose
Backend REST API that resolves a catalog entity's Jira annotations and returns its Jira issues, so that all Jira access happens server-side with centrally managed credentials.

## Requirements

### Requirement: Issue lookup by entity ref

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and optional filter, pagination (`startAt`, `limit`), sorting (`sortBy`, `order`), and summary search (`search`) parameters, and responds with the Jira issues for that entity. The backend SHALL resolve the entity via the catalog, read its `jira/project-key` annotation — a single project key or a comma-separated list of keys — and optional `jira/component` annotation, and query Jira for issues in those projects constrained by the resolved filter, sort order, and search text. All query construction SHALL happen server-side: sorting uses JQL `ORDER BY` restricted to a fixed whitelist of fields, and search text is matched against the issue summary with the JQL `~` operator, escaped as a quoted JQL string.

#### Scenario: Successful lookup

- **WHEN** a request arrives for entity ref `component:default/my-service` whose entity has annotation `jira/project-key: PROJ` and filter `unresolved`
- **THEN** the response is `200` with a JSON body containing the list of issues in project `PROJ` matching the `unresolved` filter, plus the list of available filters and the applied filter id

#### Scenario: Component annotation narrows results

- **WHEN** the resolved entity additionally has annotation `jira/component: backend`
- **THEN** the returned issues are limited to those in the given Jira component

#### Scenario: Issue fields

- **WHEN** issues are returned
- **THEN** each issue includes at least: key, a browse URL, summary, issue type (name and icon URL when available), status name and category, priority (name and icon URL when available), assignee display name (when assigned), created time, and updated time

#### Scenario: Multiple projects in one annotation

- **WHEN** the resolved entity has annotation `jira/project-key: PROJ1,PROJ2` (whitespace around commas tolerated)
- **THEN** the returned issues span both projects, queried as a single JQL `project IN (...)` constraint

#### Scenario: Paged lookup

- **WHEN** a request carries `startAt=50&limit=25`
- **THEN** the response contains at most 25 issues starting at offset 50, and reports `total`, `startAt`, and `pageSize` so the caller can render pagination

#### Scenario: Sorted lookup

- **WHEN** a request carries `sortBy=priority&order=asc`
- **THEN** the issues are ordered by priority ascending via JQL `ORDER BY`, and the default ordering (`updated` descending) applies when no sort is given

#### Scenario: Summary search

- **WHEN** a request carries `search=flux capacitor`
- **THEN** only issues whose summary matches `summary ~ "flux capacitor"` are returned, combined with the active filter constraint

#### Scenario: Search text cannot extend the query

- **WHEN** the search text contains JQL metacharacters such as `" OR project != "`
- **THEN** the text is escaped and matched literally against summaries, and no additional JQL clauses take effect

### Requirement: Request validation and error mapping

The endpoint SHALL validate its inputs and map failures to distinct, human-readable errors: `400` for a malformed entity ref, unknown filter id, non-whitelisted `sortBy` field, invalid `order` value, or non-numeric/negative `startAt`/`limit`, `404` when the entity does not exist in the catalog or has no `jira/project-key` annotation, `502` when Jira itself cannot be reached or rejects the query, and `500` when Jira connection configuration is missing or invalid. `limit` SHALL be capped at a server-side maximum page size. Error responses SHALL NOT leak Jira credentials or raw connection configuration.

#### Scenario: Malformed entity ref

- **WHEN** a request carries an entity ref that cannot be parsed
- **THEN** the response is `400` with a message identifying the entity ref as invalid

#### Scenario: Entity not annotated

- **WHEN** the resolved entity has no `jira/project-key` annotation
- **THEN** the response is `404` with a message explaining the missing annotation

#### Scenario: Jira unreachable

- **WHEN** the request to the Jira API fails or times out
- **THEN** the response is `502` with a human-readable message that does not include credentials

#### Scenario: No Jira connection configured

- **WHEN** no Jira connection is configured for the requested project's Jira host
- **THEN** the response is `500` with a message pointing at the missing `connections` configuration

#### Scenario: Non-whitelisted sort field

- **WHEN** a request carries `sortBy=duedate, resolution` or any value outside the whitelist
- **THEN** the response is `400` naming the allowed sort fields and no Jira query is executed

#### Scenario: Invalid pagination values

- **WHEN** a request carries a negative or non-numeric `startAt` or `limit`
- **THEN** the response is `400`, and a `limit` above the server maximum is reduced to the maximum rather than rejected

### Requirement: Caller authentication

The endpoint SHALL require an authenticated Backstage caller (user or service credentials) and SHALL reject unauthenticated requests. The catalog lookup SHALL be performed with credentials issued for the backend on behalf of the caller, so catalog permission rules still apply.

#### Scenario: Unauthenticated request

- **WHEN** a request arrives without valid Backstage credentials
- **THEN** the response is `401`

#### Scenario: Entity hidden from caller

- **WHEN** the catalog denies the caller access to the requested entity
- **THEN** the endpoint responds as if the entity does not exist (`404`)

### Requirement: Status-count lookup by entity ref

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and responds with the entity's issue counts per Jira status category ("To Do", "In Progress", "Done") and their sum. Counts SHALL be computed with Jira count queries constrained by the entity's `jira/project-key` (single or comma-separated) and optional `jira/component` annotations — never by paging through issues — so they are exact for projects of any size. The endpoint SHALL apply the same caller authentication, catalog-based entity resolution, connection selection (`jira/instance`), and error mapping as the issue lookup endpoint, and SHALL NOT leak credentials in errors.

#### Scenario: Counts returned

- **WHEN** an authenticated request arrives for an annotated entity whose project has 12 To Do, 5 In Progress, and 130 Done issues
- **THEN** the response is `200` with the three labeled category counts and a total of 147

#### Scenario: Constraints match the issues endpoint

- **WHEN** the entity has `jira/project-key: PROJ1,PROJ2` and `jira/component: backend`
- **THEN** each category count is scoped to those projects and that component

#### Scenario: Shared error mapping

- **WHEN** the request is unauthenticated, the entity is missing or unannotated, no Jira connection is configured, or Jira is unreachable
- **THEN** the endpoint responds with `401`, `404`, `500`, or `502` respectively, matching the issue lookup endpoint's behavior

### Requirement: User-scoped filter resolution

When the `assigned-to-me` filter is requested, the Jira backend SHALL resolve the caller to a Jira account in two steps: (1) the authenticated Backstage user's email, taken from the `jira/user-email` annotation on their User entity when present, otherwise from the User entity's profile email; (2) that email resolved to a Jira account identifier via Jira's user search API, with successful resolutions cached in-memory. The resulting JQL constraint SHALL reference the resolved account as an escaped literal — the caller can never influence the JQL beyond selecting the filter id. Failures SHALL be distinct and human-readable: `400` when the caller has no user identity (service credentials), `404` when the User entity is missing or has no email, and `404` when Jira knows no account for the email; none of these SHALL leak credentials.

#### Scenario: Issues scoped to the resolved account

- **WHEN** an authenticated user whose User entity has email `dana@example.com`, known to Jira, requests issues with `filter=assigned-to-me`
- **THEN** the executed JQL constrains `assignee` to the Jira account resolved for `dana@example.com`, combined with the entity's project (and component) constraints

#### Scenario: Annotation overrides profile email

- **WHEN** the caller's User entity has annotation `jira/user-email: dana.b@corp.example.com` and a different profile email
- **THEN** the annotation email is used for the Jira account lookup

#### Scenario: Service caller

- **WHEN** a service (non-user) principal requests `filter=assigned-to-me`
- **THEN** the response is `400` explaining the filter requires a signed-in user

#### Scenario: No Jira account for the user

- **WHEN** the caller's email is not known to Jira
- **THEN** the response is `404` with a message naming the email lookup failure (not the credentials), and no issue query is executed

### Requirement: Issue detail lookup

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and an issue key and returns that issue's detail: key, browse URL, summary, description (as raw text), status, priority, type, reporter and assignee display names, labels, created and updated times, and the most recent comments (bounded to a fixed maximum, each with author display name, created time, and raw text body). The endpoint SHALL serve only issue keys whose project prefix matches one of the entity's annotated project keys (case-insensitive), rejecting other keys with `404` before any Jira call; malformed keys are rejected with `400`. Caller authentication, entity resolution, connection selection, and the 401/404/500/502 error mapping SHALL match the issue lookup endpoint. Description and comment bodies SHALL be passed through as text for the frontend to render literally — the API SHALL NOT convert them to HTML.

#### Scenario: Detail returned

- **WHEN** an authenticated request asks for issue `PROJ-7` of an entity annotated with `jira/project-key: PROJ`
- **THEN** the response is `200` with the issue's fields, description text, and its most recent comments

#### Scenario: Key outside the entity's projects

- **WHEN** the request asks for issue `OTHER-1` and the entity's annotation is `jira/project-key: PROJ`
- **THEN** the response is `404` and no Jira request is made

#### Scenario: Unknown issue

- **WHEN** Jira reports the issue key as not found
- **THEN** the response is `404` with a human-readable message

#### Scenario: Comment bound

- **WHEN** the issue has more comments than the fixed maximum
- **THEN** only the most recent ones up to the maximum are returned, with the total comment count

### Requirement: Active sprint lookup

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and returns the active sprint of the board named by the entity's `jira/board-id` annotation, using Jira's Agile API: sprint id, name, state, start and end dates, goal when present, and the sprint's issues (same issue shape and page-size cap as the issue lookup endpoint, with the total). When the board has no active sprint the endpoint SHALL respond `200` with a null sprint rather than an error. A missing or non-numeric `jira/board-id` annotation SHALL yield `404` naming the annotation. Caller authentication, connection selection, and error mapping SHALL match the issue lookup endpoint.

#### Scenario: Active sprint returned

- **WHEN** an authenticated request arrives for an entity annotated with `jira/board-id: 42` and board 42 has an active sprint
- **THEN** the response is `200` with the sprint's metadata and its issues

#### Scenario: No active sprint

- **WHEN** board 42 has no active sprint
- **THEN** the response is `200` with a null sprint and no issues

#### Scenario: Missing board annotation

- **WHEN** the entity has no `jira/board-id` annotation
- **THEN** the response is `404` naming the `jira/board-id` annotation

#### Scenario: Invalid board annotation

- **WHEN** the annotation value is not a positive integer
- **THEN** the response is `404` with a message naming the invalid value
