# Add Issue Detail Popover and Sprint View

## Why

Two gaps push users out of Backstage today: clicking an issue in the Jira tab jumps straight to Jira even when the reader only wants a quick look at the description or latest comments, and Scrum teams who live in sprint boards cannot see their active sprint at all. Closing both keeps day-to-day triage inside the entity page.

## What Changes

- **Issue detail popover**: clicking a row in the issue table opens an in-page dialog with the issue's description, labels, reporter, assignee, status, priority, timestamps, and the most recent comments — rendered as plain text — plus an "Open in Jira" link. Backed by a new `GET /v1/issues/:issueKey?entityRef=<ref>` endpoint that only serves keys belonging to the entity's annotated projects.
- **Sprint view**: entities annotated with a new `jira/board-id` annotation get a view toggle in the Jira tab switching between the existing issue table and an "Active sprint" view — sprint name, state, dates, and goal, plus the sprint's issues in the same table layout. Backed by a new `GET /v1/sprint?entityRef=<ref>` endpoint using Jira's Agile API (active sprint of the board, then its issues).
- Both endpoints reuse the existing caller auth, entity/annotation resolution, connection selection, and error mapping.

## Capabilities

### New Capabilities

_None — both features extend the existing entity-page and API capabilities._

### Modified Capabilities

- `jira-entity-issues`: ADDED requirements for the detail popover (open/close, content, plain-text rendering, link out) and the sprint view (annotation-gated toggle, sprint header, sprint issue table, empty/error behavior).
- `jira-issues-api`: ADDED requirements for the issue detail lookup (project-scoped key authorization, field set, comment cap, plain-text safety) and the active sprint lookup (Agile API, sprint metadata + issues, no-active-sprint case).

## Impact

- **Modified code**: `plugins/jira-backend` (`JiraClient` issue/agile calls, two new routes), `plugins/jira` (detail dialog component, sprint view + toggle in `JiraContent`, API client methods, mirrored types).
- **New annotation**: `jira/board-id` (optional, numeric board id). No new config keys, no new dependencies (`@backstage/ui` ships `Dialog` and `ToggleButtonGroup`).
