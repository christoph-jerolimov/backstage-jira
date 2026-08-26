# Design: Add "Assigned to me" Filter

## Context

Builds on the three merged Jira changes. Relevant current state:

- The backend authenticates to Jira with service credentials from the `connections` config; `currentUser()` in JQL would be the bot. Filters are static `{id, name, jql}` values resolved in `readFilterConfig` and interpolated by `buildJql`; the frontend renders whatever `filters` the response reports and sends back an id.
- `httpAuth.credentials(req, { allow: ['user', 'service'] })` in `resolveTarget` yields a principal; for users it carries `userEntityRef`. The catalog service is already a router dependency, and lookups run with on-behalf-of credentials.
- Jira's user search: Cloud `GET /rest/api/2/user/search?query=<email>` returns `accountId`; Data Center uses `?username=<text>` and returns `name`. JQL accepts `assignee = "<accountId>"` on Cloud and `assignee = "<name>"` on DC.
- `toJqlString` provides escaped literal interpolation.

## Goals / Non-Goals

**Goals:**

- An always-offered `assigned-to-me` filter whose JQL is built from the resolved caller — zero frontend changes, zero new config.
- Robust email → Jira account resolution on both Cloud and Data Center, cached.

**Non-Goals:**

- OAuth user-delegated Jira auth (queries still run as the service account; only the `assignee` constraint is user-scoped).
- A general `{{currentUser}}` placeholder in configured filter JQL (may build on this later).
- Applying the filter to the overview card's counts.

## Decisions

### D1: Model as a dynamic built-in filter, not a config filter

`readFilterConfig` gains the reserved-id check and the API layer appends `{ id: 'assigned-to-me', name: 'Assigned to me' }` to the reported filter list. In the router, `filter=assigned-to-me` short-circuits the static filter lookup: instead of `filter.jql`, the handler resolves the caller and passes `assigneeJql = assignee = ${toJqlString(account)}` into `buildJql` (new optional `assignee` option, escaped like every other clause). Everything downstream (search, paging, sorting, summary search) composes unchanged.

**Alternative** (synthesize a JiraFilter with user-specific jql into the config list): rejected — filter config is startup-static and shared across callers; a per-request filter entry would leak one user's account into another's cache of "known filters".

### D2: Two-step identity resolution with an override annotation

1. `credentials.principal` must be a user principal (else `InputError` → 400). Its `userEntityRef` is fetched from the catalog **with the caller's on-behalf-of credentials** (users can read their own entity under default permission policies). Email = `jira/user-email` annotation if present, else `spec.profile.email`. Missing entity or email → `NotFoundError` with guidance to set the annotation.
2. `JiraClient.findUser({ connection, email })` calls `GET <apiBaseUrl>/rest/api/2/user/search?query=<email>`; if the response is a 400/404 or an empty array, it retries with `?username=<email>` (covers Data Center). The first result's `accountId ?? name` is the account identifier. No match → `NotFoundError`.

**Alternative** (skip resolution, JQL `assignee = "<email>"` directly): works on Cloud but is unreliable on Data Center (username ≠ email) and gives a confusing empty result instead of a clear "no Jira account found" error. Rejected.

### D3: In-memory TTL cache for resolutions

A small `Map<string, {account, expires}>` keyed by `host + email` inside the resolver, TTL ~10 minutes, consulted before calling Jira. Negative results are not cached (a user might be provisioned in Jira mid-session). This is per-backend-instance state, acceptable exactly like the design's earlier caching stance.

### D4: Filter list placement and default rules

`assigned-to-me` is appended after configured/built-in filters (personal filters read naturally at the end) and is marked default only when `jira.defaultFilter: assigned-to-me` is set explicitly — the existing "first configured filter is default" rule ignores it. `readFilterConfig` accepts `assigned-to-me` as a valid `defaultFilter` value.

### D5: Status-counts endpoint unaffected

Counts stay whole-project. The card and tab tell different stories (project health vs. my work); mixing a user scope into counts would make the card inconsistent between viewers.

## Risks / Trade-offs

- **[Email privacy: the backend queries Jira with user emails]** → Emails already live in the catalog and Jira; the query goes only to the operator's own configured Jira host over the authenticated connection. Emails never appear in error messages beyond naming the failed lookup (spec requires no credential leakage; the email itself is shown to its owner only).
- **[Jira permission of the service account]** → User search requires "Browse users" permission; if denied, the filter fails with the 502 mapping and a log line. Documented in the README.
- **[Cloud/DC API divergence]** → Handled by the query→username fallback; both paths covered by unit tests with mocked responses.
- **[Guest users have no User entity]** → They get the clear 404 guidance; documented. The filter still appears in the list — hiding it per-caller would make the filter list credential-dependent and cache-hostile.

## Migration Plan

Additive. Deploy by merging; the new filter appears automatically. Rollback by reverting. No config or catalog migrations; the `jira/user-email` annotation is optional.
