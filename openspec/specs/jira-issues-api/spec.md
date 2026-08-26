# jira-issues-api Specification

## Purpose
Backend REST API that resolves a catalog entity's Jira annotations and returns its Jira issues, so that all Jira access happens server-side with centrally managed credentials.

## Requirements

### Requirement: Issue lookup by entity ref

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and an optional filter identifier, and responds with the Jira issues for that entity. The backend SHALL resolve the entity via the catalog, read its `jira/project-key` annotation (and optional `jira/component` annotation), and query Jira for issues in that project constrained by the resolved filter.

#### Scenario: Successful lookup

- **WHEN** a request arrives for entity ref `component:default/my-service` whose entity has annotation `jira/project-key: PROJ` and filter `unresolved`
- **THEN** the response is `200` with a JSON body containing the list of issues in project `PROJ` matching the `unresolved` filter, plus the list of available filters and the applied filter id

#### Scenario: Component annotation narrows results

- **WHEN** the resolved entity additionally has annotation `jira/component: backend`
- **THEN** the returned issues are limited to those in the given Jira component

#### Scenario: Issue fields

- **WHEN** issues are returned
- **THEN** each issue includes at least: key, a browse URL, summary, issue type (name and icon URL when available), status name and category, priority (name and icon URL when available), assignee display name (when assigned), created time, and updated time

### Requirement: Request validation and error mapping

The endpoint SHALL validate its inputs and map failures to distinct, human-readable errors: `400` for a malformed entity ref or unknown filter id, `404` when the entity does not exist in the catalog or has no `jira/project-key` annotation, `502` when Jira itself cannot be reached or rejects the query, and `500` when Jira connection configuration is missing or invalid. Error responses SHALL NOT leak Jira credentials or raw connection configuration.

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

### Requirement: Caller authentication

The endpoint SHALL require an authenticated Backstage caller (user or service credentials) and SHALL reject unauthenticated requests. The catalog lookup SHALL be performed with credentials issued for the backend on behalf of the caller, so catalog permission rules still apply.

#### Scenario: Unauthenticated request

- **WHEN** a request arrives without valid Backstage credentials
- **THEN** the response is `401`

#### Scenario: Entity hidden from caller

- **WHEN** the catalog denies the caller access to the requested entity
- **THEN** the endpoint responds as if the entity does not exist (`404`)
