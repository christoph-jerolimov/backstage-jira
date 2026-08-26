# jira-filter-config Specification

## Purpose
Lets operators define the set of Jira issue filters offered in the entity tab — including which one is the default — through app-config, with safe built-in behavior when nothing is configured.

## Requirements

### Requirement: Named filters configurable in app-config

The app-config SHALL accept a `jira.filters` section defining an ordered list of named filters, each with a unique `id`, a display `name`, and an optional `jql` fragment that is combined with the entity's project (and optional component) constraint; omitting `jql` declares an unconstrained ("all issues") filter. (Backstage config rejects empty-string values at the config layer, so an accidentally empty `jql` fails at startup with a config type error.) A `jira.defaultFilter` value SHALL select the default filter by id. Filter JQL SHALL be defined only in backend-read configuration — the frontend selects filters by id and never submits raw JQL.

#### Scenario: Configured filters are offered

- **WHEN** app-config defines filters `unresolved` ("Unresolved", `resolution = Unresolved`) and `recent` ("Updated last 7 days", `updated >= -7d`)
- **THEN** the issues API reports exactly these filters as available, in configuration order, and accepts either id as the filter parameter

#### Scenario: Configured default filter

- **WHEN** app-config sets `jira.defaultFilter: recent`
- **THEN** requests that do not name a filter use the `recent` filter, and the API marks `recent` as the default in its filter list

#### Scenario: Frontend cannot inject JQL

- **WHEN** a request carries a filter value that is not a configured filter id
- **THEN** the request is rejected with a validation error and no Jira query is executed with caller-supplied JQL

### Requirement: Built-in default when not configured

When no `jira.filters` are configured the system SHALL behave as if two filters were configured: `unresolved` ("Unresolved", limiting to unresolved issues) and `all` ("All issues", no additional constraint), with `unresolved` as the default. When filters are configured but `jira.defaultFilter` is absent, the first configured filter SHALL be the default.

#### Scenario: Zero configuration

- **WHEN** app-config contains no `jira` section
- **THEN** the available filters are `unresolved` (default) and `all`, and issue lookups without a filter return only unresolved issues

#### Scenario: Filters without explicit default

- **WHEN** app-config defines filters `[mine, unresolved]` and no `jira.defaultFilter`
- **THEN** `mine` is the default filter

### Requirement: Invalid filter configuration fails fast

A `jira.filters` list containing duplicate ids, or a `jira.defaultFilter` that names a non-existent id, SHALL be rejected when the backend starts, with an error naming the offending entry.

#### Scenario: Omitted jql is an unconstrained filter

- **WHEN** a configured filter has no `jql` value
- **THEN** the filter matches all issues of the entity's project (and component, when annotated)

#### Scenario: Default references unknown id

- **WHEN** `jira.defaultFilter: nope` is set and no filter with id `nope` exists
- **THEN** backend startup fails with an error naming `nope` and listing the known filter ids

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
