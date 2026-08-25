## Purpose

Lets operators define the set of Jira issue filters offered in the entity tab — including which one is the default — through app-config, with safe built-in behavior when nothing is configured.

## ADDED Requirements

### Requirement: Named filters configurable in app-config

The app-config SHALL accept a `jira.filters` section defining an ordered list of named filters, each with a unique `id`, a display `name`, and a `jql` fragment that is combined with the entity's project (and optional component) constraint. A `jira.defaultFilter` value SHALL select the default filter by id. Filter JQL SHALL be defined only in backend-read configuration — the frontend selects filters by id and never submits raw JQL.

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

A `jira.filters` list containing duplicate ids, an empty `jql` for a filter other than an explicit "all"-style filter, or a `jira.defaultFilter` that names a non-existent id SHALL be rejected when the backend starts, with an error naming the offending entry.

#### Scenario: Default references unknown id

- **WHEN** `jira.defaultFilter: nope` is set and no filter with id `nope` exists
- **THEN** backend startup fails with an error naming `nope` and listing the known filter ids
