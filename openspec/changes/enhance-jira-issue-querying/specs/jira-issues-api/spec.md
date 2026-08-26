## MODIFIED Requirements

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
