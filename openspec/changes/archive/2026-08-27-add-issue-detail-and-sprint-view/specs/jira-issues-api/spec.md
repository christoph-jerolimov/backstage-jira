## ADDED Requirements

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
