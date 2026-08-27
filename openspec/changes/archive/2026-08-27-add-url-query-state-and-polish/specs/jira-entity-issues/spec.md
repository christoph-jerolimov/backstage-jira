## ADDED Requirements

### Requirement: URL-persisted query state

The Jira tab SHALL reflect its query state — selected filter, sort column and direction, summary search text, page offset, and (when the sprint view exists) the selected view — in the page URL's query parameters, and SHALL restore that state from the URL when the tab loads. Opening a copied URL SHALL reproduce the same view, including fetching with the same parameters. State updates SHALL happen in place (no page reload) and SHALL NOT flood the browser history — using the URL only as state, with at most the navigation entries a user would expect. Query parameters with unknown or invalid values (a non-whitelisted sort field, a non-numeric offset, an unknown view) SHALL be ignored in favor of the defaults rather than producing an error.

#### Scenario: Shared link reproduces the view

- **WHEN** a user selects the `all` filter, sorts by priority ascending, searches `flux`, and sends the resulting URL to a teammate
- **THEN** opening that URL shows the Jira tab with the same filter, sort, and search applied, fetched with those parameters

#### Scenario: Refresh keeps the view

- **WHEN** the user reloads the page while on page 2 of a sorted view
- **THEN** the tab returns to the same page and sort after the reload

#### Scenario: Sprint view is linkable

- **WHEN** an entity with a board annotation is opened via a URL selecting the sprint view
- **THEN** the tab opens directly on the Sprint view

#### Scenario: Invalid parameters are ignored

- **WHEN** the URL carries `sortBy=bogus` or a negative page offset
- **THEN** the tab loads with its defaults and no error is shown

#### Scenario: Defaults keep the URL clean

- **WHEN** the tab is in its default state (default filter, default sort, no search, first page, issues view)
- **THEN** the URL carries none of the query-state parameters

### Requirement: Project links in the tab

The Jira tab SHALL show the entity's Jira project keys, as reported by the issues API, as links opening each project in Jira in a new tab.

#### Scenario: Multi-project entity

- **WHEN** the entity's annotation names `PROJ1,PROJ2` and the issues response reports both projects
- **THEN** the tab shows `PROJ1` and `PROJ2` as links to their Jira project pages
