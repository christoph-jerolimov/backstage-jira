## ADDED Requirements

### Requirement: Built-in "Assigned to me" filter

The system SHALL always offer a built-in filter with id `assigned-to-me` and name "Assigned to me", appended after the configured (or built-in) filters, that limits issues to those assigned to the requesting user's Jira account. This filter SHALL be offered regardless of `jira.filters` configuration, SHALL never be the implicit default (only an explicit `jira.defaultFilter: assigned-to-me` makes it the default), and its JQL SHALL be constructed entirely server-side from the resolved user. A configured filter using the reserved id `assigned-to-me` SHALL be rejected at backend startup.

#### Scenario: Always offered

- **WHEN** app-config defines filters `[unresolved, all]` (or none at all)
- **THEN** the issues API reports those filters followed by `assigned-to-me` ("Assigned to me")

#### Scenario: Selecting the filter scopes to the caller

- **WHEN** a signed-in user selects "Assigned to me" in the Jira tab
- **THEN** the issue list shows only issues of the entity's projects assigned to that user's Jira account

#### Scenario: Reserved id in configuration

- **WHEN** `jira.filters` contains an entry with id `assigned-to-me`
- **THEN** backend startup fails with an error naming the reserved id
