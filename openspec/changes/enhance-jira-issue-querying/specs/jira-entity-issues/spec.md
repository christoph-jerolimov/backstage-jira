## MODIFIED Requirements

### Requirement: Issues are shown as a table

The Jira tab SHALL render the entity's Jira issues as a table using Backstage UI components. Each row SHALL show at least the issue key, summary, type, status, priority, assignee, and last-updated time. The issue key SHALL link to the issue in Jira, opening in a new tab. Columns for key, summary, status, priority, created, and updated SHALL be sortable; activating a column sort re-fetches from the backend with the corresponding sort parameters, defaulting to updated descending.

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

## ADDED Requirements

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
