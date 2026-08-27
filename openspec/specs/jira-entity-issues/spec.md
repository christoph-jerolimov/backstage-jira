# jira-entity-issues Specification

## Purpose
Surfaces a catalog entity's Jira issues directly on the entity page as a filterable table, so developers can see open work for a service without leaving Backstage.

## Requirements

### Requirement: Jira tab appears only for annotated entities

The catalog entity page SHALL show a "Jira" tab if and only if the entity carries the `jira/project-key` annotation with a non-empty value.

#### Scenario: Entity with annotation

- **WHEN** a user opens the entity page of an entity whose `metadata.annotations` include `jira/project-key: PROJ`
- **THEN** a "Jira" tab is available on the entity page

#### Scenario: Entity without annotation

- **WHEN** a user opens the entity page of an entity without the `jira/project-key` annotation
- **THEN** no "Jira" tab is shown

### Requirement: Issues are shown as a table

The Jira tab SHALL render the entity's Jira issues as a table using Backstage UI components. Each row SHALL show at least the issue key, summary, type, status, priority, assignee, and last-updated time. The issue key SHALL link to the issue in Jira, opening in a new tab. Columns for key, summary, status, priority, and updated SHALL be sortable; activating a column sort re-fetches from the backend with the corresponding sort parameters, defaulting to updated descending.

#### Scenario: Issues render in the table

- **WHEN** the Jira tab loads and the backend returns issues for the entity
- **THEN** each issue appears as a table row showing key, summary, type, status, priority, assignee, and updated time
- **AND** clicking the issue key opens the issue in Jira in a new browser tab

#### Scenario: Unassigned issue

- **WHEN** a returned issue has no assignee
- **THEN** the assignee cell shows a neutral placeholder (e.g. "—" or "Unassigned") rather than an empty cell or an error

#### Scenario: Sorting by column

- **WHEN** the user activates the sort control on the priority column
- **THEN** the issue list is re-fetched sorted by priority server-side and the column indicates the active sort direction
- **AND** activating it again toggles the direction

### Requirement: Issues are fetched only through the Jira backend

The frontend SHALL request issues exclusively from the Jira backend plugin's API, identifying the entity by its entity ref. The frontend SHALL NOT call Jira directly and SHALL NOT receive or hold Jira credentials.

#### Scenario: Fetch on tab load

- **WHEN** the Jira tab is displayed for entity `component:default/my-service`
- **THEN** the frontend issues a request to the Jira backend carrying the entity ref `component:default/my-service` and the selected filter
- **AND** no request from the browser goes to the Jira host

### Requirement: Filter selection

The Jira tab SHALL offer a filter control listing the configured named filters. Selecting a filter SHALL re-fetch and re-render the issue list according to that filter. On first load the configured default filter SHALL be pre-selected; when no filters are configured, a built-in "Unresolved" filter (unresolved issues only) SHALL be pre-selected and offered alongside a built-in "All issues" filter.

#### Scenario: Default filter applied on load

- **WHEN** the Jira tab loads
- **THEN** the filter control shows the default filter as selected
- **AND** the table shows only issues matching that filter

#### Scenario: User changes filter

- **WHEN** the user selects a different filter from the filter control
- **THEN** the issue list is re-fetched with the newly selected filter and the table updates

### Requirement: Loading, empty, and error states

The Jira tab SHALL show a loading indicator while a request is in flight, a clear empty state when the request succeeds with zero issues, and a human-readable error state (including a retry affordance) when the request fails. A missing or invalid Jira configuration reported by the backend SHALL be presented as guidance, not as a raw error.

#### Scenario: Loading

- **WHEN** an issues request is in flight
- **THEN** the tab shows a loading indicator instead of stale or empty content

#### Scenario: No matching issues

- **WHEN** the backend responds with an empty issue list
- **THEN** the tab shows an empty state stating that no issues match the current filter

#### Scenario: Backend request fails

- **WHEN** the issues request fails
- **THEN** the tab shows an error state with a human-readable message and a way to retry

### Requirement: Table pagination

The Jira tab SHALL paginate the issue table using the backend's paging metadata (`total`, `startAt`, `pageSize`). Moving between pages SHALL fetch the corresponding offset from the backend. Changing the filter, sort order, or search text SHALL reset to the first page.

#### Scenario: Navigating pages

- **WHEN** the entity's project has more issues than one page and the user moves to the next page
- **THEN** the next page of issues is fetched from the backend and the control reflects the current position and total

#### Scenario: Query change resets paging

- **WHEN** the user is on page 3 and changes the filter, sort, or search text
- **THEN** the table returns to the first page of the new result set

### Requirement: Summary text search

The Jira tab SHALL provide a search input that filters issues by summary text via the backend (JQL `~` matching). The search SHALL combine with the active filter, SHALL be debounced so a request is not sent per keystroke, and clearing it SHALL restore the unsearched list.

#### Scenario: Searching summaries

- **WHEN** the user types `capacitor` into the search input
- **THEN** the table shows only issues whose summary matches, fetched from the backend with the search parameter

#### Scenario: Clearing the search

- **WHEN** the user clears the search input
- **THEN** the table shows the full (filtered) issue list again

#### Scenario: No matches

- **WHEN** the search yields zero issues
- **THEN** the empty state indicates that no issues match the current filter and search

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
