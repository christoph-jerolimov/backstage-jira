# Add URL Query State and UI Polish

## Why

A filtered, sorted, or searched view of the Jira tab lives only in component state today — copying the browser URL and sending it to a teammate loses everything, and a page refresh resets the view. Two smaller gaps ride along: the tab never shows *which* Jira projects it is aggregating (the API already reports them), and the overview card shows three category counts but not their total.

## What Changes

- **URL-persisted query state**: the Jira tab's filter, sort column and direction, summary search, page offset, and Issues/Sprint view selection are reflected in the page URL's query parameters and restored from them on load — making every view shareable, refresh-safe, and deep-linkable. Invalid or unknown parameter values are ignored gracefully. Frontend-only; the existing whitelist validation in the backend is unchanged.
- **Project links in the tab**: a small header line shows the entity's Jira project keys (from the response's `projects`) as links to Jira — most useful for multi-project entities.
- **Total on the overview card**: the card shows the summed total alongside the three category counts.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `jira-entity-issues`: ADDED requirements for URL-persisted query state and the project links header.
- `jira-overview-card`: MODIFIED counts requirement to include the total.

## Impact

- **Modified code**: `plugins/jira` only (`JiraContent`/`IssuesView` query-state wiring via `useSearchParams`, small header addition, `JiraOverviewCard` total). No backend, config, annotation, or dependency changes.
