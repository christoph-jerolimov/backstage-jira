## ADDED Requirements

### Requirement: Issue detail popover

Clicking an issue row in the table (other than the issue-key link itself) SHALL open an in-page dialog for that issue showing at least: key, summary, status, priority, type, reporter, assignee, labels, created and updated times, the issue description, and its most recent comments (author and time per comment). Description and comments SHALL be rendered as plain text — never as HTML or interpreted markup — preserving line breaks. The dialog SHALL contain a link opening the issue in Jira in a new tab, SHALL be dismissible, and SHALL show loading and error states of its own without disturbing the table behind it.

#### Scenario: Opening the detail

- **WHEN** the user clicks an issue row
- **THEN** a dialog opens showing that issue's fields, description, and recent comments fetched from the backend

#### Scenario: Markup is not interpreted

- **WHEN** an issue description contains HTML or script-like text
- **THEN** the dialog shows it as literal text

#### Scenario: Dismiss and link out

- **WHEN** the user dismisses the dialog or clicks its "Open in Jira" link
- **THEN** the dialog closes, or the issue opens in Jira in a new tab, respectively

#### Scenario: Detail fetch fails

- **WHEN** the backend request for the issue detail fails
- **THEN** the dialog shows a human-readable error and the table remains usable

### Requirement: Sprint view

For entities additionally annotated with `jira/board-id`, the Jira tab SHALL offer a view toggle between "Issues" (the existing filterable table) and "Sprint". The Sprint view SHALL show the board's active sprint — name, state, start and end dates, and goal when present — and the sprint's issues in the same table column layout (without the filter/search/pagination controls of the Issues view). Entities without the annotation SHALL see the Issues view only, with no toggle.

#### Scenario: Toggle appears only with a board annotation

- **WHEN** the entity has annotations `jira/project-key` and `jira/board-id`
- **THEN** the Jira tab shows the Issues/Sprint toggle, defaulting to Issues

#### Scenario: Active sprint shown

- **WHEN** the user switches to the Sprint view and the board has an active sprint
- **THEN** the sprint's name, dates, and goal are shown with its issues in the issue table layout

#### Scenario: No active sprint

- **WHEN** the board has no active sprint
- **THEN** the Sprint view shows an empty state saying so, not an error

#### Scenario: No board annotation

- **WHEN** the entity has no `jira/board-id` annotation
- **THEN** the tab renders exactly as before, with no toggle
