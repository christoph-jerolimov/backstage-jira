# Add "Assigned to me" Filter

## Why

Every filter today is entity-scoped; developers keep asking the more personal question — "which of this service's issues are mine?". The backend authenticates to Jira with service credentials, so JQL `assignee = currentUser()` would resolve to the bot account, not the viewer; a real user-scoped filter needs to map the signed-in Backstage user to their Jira account.

## What Changes

- A built-in **"Assigned to me"** filter (id `assigned-to-me`) is always offered in the Jira tab's filter list, alongside configured or built-in filters. No frontend changes are needed for the control itself — the tab already renders whatever filters the backend reports.
- When selected, the backend resolves the caller's Backstage user identity to an email (User entity `spec.profile.email`, overridable with a `jira/user-email` annotation on the User entity), resolves that email to a Jira account via Jira's user search API (result cached in-memory), and constrains the query with `assignee = <account>` — combined with the entity's project/component constraints as usual.
- Clear failure modes: selecting the filter without a user identity (service callers), with a Backstage user that has no email, or with an email unknown to Jira each produce a distinct, human-readable error.
- Configured filters may not use the reserved id `assigned-to-me`; that misconfiguration fails at startup.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `jira-filter-config`: adds the always-offered built-in "Assigned to me" filter and the reserved-id rule (ADDED requirement; existing requirements unchanged).
- `jira-issues-api`: adds the user-scoped filter execution requirement — identity → email → Jira account resolution and its error cases (ADDED requirement; existing requirements unchanged).

## Impact

- **Modified code**: `plugins/jira-backend` (user resolution service, `JiraClient` user-search call, filter config + router integration), no frontend code changes beyond none — the filter list is server-driven. Types unchanged.
- **No new config keys, no new dependencies.** New optional annotation `jira/user-email` on User entities, documented in the README.
