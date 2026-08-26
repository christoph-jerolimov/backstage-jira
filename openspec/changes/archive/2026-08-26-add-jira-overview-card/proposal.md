# Add Jira Overview Card

## Why

The Jira tab is one click away and shows detail, but the entity Overview page — the first thing developers see — says nothing about the state of a service's Jira work. A compact count-by-status card gives that signal at a glance and funnels users into the Jira tab.

## What Changes

- New **Jira card on the entity Overview tab** (`EntityCardBlueprint`, shown only for entities with the `jira/project-key` annotation): issue counts for Jira's three status categories — To Do, In Progress, Done — plus a link that opens the entity's Jira tab.
- New lightweight backend endpoint `GET /api/jira/v1/status-counts?entityRef=<ref>` returning per-category counts. Counts are computed server-side with Jira count queries (`maxResults: 0`, reading `total`), so they are correct regardless of project size — the paginated issues endpoint cannot provide this.
- The endpoint honors the same annotations as the issues endpoint (`jira/project-key` incl. comma-separated lists, `jira/component`, `jira/instance`) and the same auth and error mapping.

## Capabilities

### New Capabilities

- `jira-overview-card`: the Overview-tab card — visibility gating, count display by status category, link to the Jira tab, loading/error behavior.

### Modified Capabilities

- `jira-issues-api`: adds a status-counts lookup requirement (new endpoint, count semantics, validation/auth reuse). Existing requirements are unchanged.

## Impact

- **Modified code**: `plugins/jira-backend` (count query in `JiraClient`, new route), `plugins/jira` (new card component + `EntityCardBlueprint` extension, API client method, types in both packages).
- **No config changes, no new annotations, no new dependencies.**
