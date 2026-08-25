# Design: Add Jira Plugin

## Context

- This repo is a Backstage **1.54** app using the **new frontend system** (`packages/app/src/App.tsx` uses `createApp` from `@backstage/frontend-defaults` with `@backstage/plugin-catalog/alpha`) and the **new backend system** (`packages/backend/src/index.ts` uses `createBackend`). New plugins must integrate via `createFrontendPlugin` / `createBackendPlugin`, not the legacy plugin APIs.
- The connections framework (BEP-0014) status, verified against the published packages (Aug 2026):
  - `@backstage/connections@0.3.0` publicly exports the `ConnectionsService` **interface**, the built-in `connectionTypes`, and `buildConnectionsFromConfig`. Config shape: top-level `connections` is an **array** of `{ type, title?, match?, ...typeFields, auth: [{ method, title?, match?, ...methodFields }] }`.
  - The built-in connection type set is **closed** — there is **no `jira` type** — and `buildConnectionsFromConfig` throws `InputError: Unrecognised connection type` for unknown types.
  - The Node service (`DefaultConnectionsService`, `connectionsServiceRef`, id `core.connections`) lives **internal** to `@backstage/backend-app-api`; `connectionsServiceRef` / `declareConnection` are not publicly exported yet (only the `ConnectionRegistration` type and the runtime `registerConnection` hook exist in `@backstage/backend-plugin-api`).
- `@backstage/ui` (0.17.x) provides `Table`/`TableRoot`/`TableHeader`/`TableBody`/`Column`/`Row`/`Cell`/`CellText`/`TablePagination`/`useTable`, plus `Select`, `SearchField`, `Skeleton`, `Tag` — enough for the issue table and filter bar without MUI.

## Goals / Non-Goals

**Goals:**

- Entity tab ("Jira") via `EntityContentBlueprint` from `@backstage/plugin-catalog-react/alpha`, gated on the `jira/project-key` annotation.
- All Jira traffic server-side in `jira-backend`; frontend talks only to it, identified by `entityRef` + filter id.
- Jira host + credentials configured in the BEP-0014 `connections` array; filters (incl. default) configured under `jira.filters` / `jira.defaultFilter`.
- Clean migration path to the framework's connections service once custom connection types and a public `connectionsServiceRef` land upstream.

**Non-Goals:**

- Writing to Jira (creating/transitioning issues), Jira webhooks, or caching layers beyond simple in-memory response caching.
- OAuth 2.0 / user-delegated Jira auth — service credentials only for now.
- Supporting the legacy frontend/backend systems or the proxy-based Jira setup used by community plugins.

## Decisions

### D1: Parse `connections` config in the plugin, shaped exactly like a future upstream `jira` connection type

**Choice:** `jira-backend` ships a small `JiraConnectionsReader` that reads the top-level `connections` array, picks entries with `type: 'jira'`, and validates them with a zod schema mirroring the framework conventions: `host` (required, hostname), `apiBaseUrl?`, `title?`, `auth: [{ method: 'basic', email, apiToken } | { method: 'token', token }]` (non-empty). It exposes a `find({ host? })` API modeled on the public `ConnectionsService.find` contract.

**Why:** The user requirement is to configure Jira "in the new backstage connection configuration". The framework cannot serve `jira` today: the type registry is closed and the service ref is private. Mirroring the config shape and the `find` semantics means that when upstream ships a `jira` connection type (or opens custom types), the reader is replaced by a `connectionsServiceRef` dependency with **no app-config change**.

**Alternatives considered:**

- *Plugin-private config (`jira.host`, `jira.token`)* — rejected: contradicts the explicit requirement and duplicates credential management.
- *Legacy `proxy` endpoint* — rejected: no typed config, credentials shared with every frontend caller, deprecated pattern.
- *Depend on the internal `connectionsServiceRef`* — rejected: importing internals of `@backstage/backend-app-api` breaks on any minor release, and the framework would still reject the `type: jira` config entry.

### D2: Accept the known interaction with the framework validator

Adding `- type: jira` to `connections` is invisible to the framework **until** some feature instantiates its `DefaultConnectionsService` (lazy service factory); at that point `buildConnectionsFromConfig` would throw on the unknown type and fail backend startup. Nothing in this repo consumes that service today. We accept this and record it as a risk (below) with mitigations, rather than inventing a non-standard config key — the whole point of the change is to standardize on `connections`.

### D3: API shape — one endpoint, backend-resolved entity and filters

`GET /api/jira/v1/issues?entityRef=<ref>&filter=<id>` (credentials required) returns:

```json
{
  "issues": [ { "key": "PROJ-1", "url": "...", "summary": "...", "type": {...}, "status": {...}, "priority": {...}, "assignee": {...}, "created": "...", "updated": "..." } ],
  "filters": [ { "id": "unresolved", "name": "Unresolved", "default": true }, ... ],
  "appliedFilter": "unresolved",
  "project": { "key": "PROJ", "url": "https://<host>/browse/PROJ" }
}
```

- Backend resolves the entity via `catalogServiceRef` (`@backstage/plugin-catalog-node`) using on-behalf-of credentials, reads `jira/project-key`, `jira/component?`, `jira/instance?`.
- JQL is assembled server-side: `project = <key> [AND component = <component>] [AND <filter.jql>] ORDER BY updated DESC`, with project/component values escaped as quoted JQL strings. Filter ids come from validated config only — callers can never submit JQL (see `jira-filter-config` spec).
- Returning `filters` in the same payload lets the frontend render the filter control without a second endpoint or duplicated config in the frontend.
- Jira search uses `POST <apiBaseUrl>/rest/api/2/search` (works on Cloud and Data Center; `/rest/api/3` is Cloud-only), requesting only the fields listed above, page size 50, surfacing `total` for future pagination.

**Alternative:** exposing config to the frontend via `app-config` visibility — rejected: filter JQL stays backend-only by design (injection surface), and the default must hold even with zero frontend config.

### D4: Package layout

- `plugins/jira` — frontend (`createFrontendPlugin`, `EntityContentBlueprint`, `ApiBlueprint` for a typed `JiraApi` client using `discoveryApi`/`fetchApi`).
- `plugins/jira-backend` — backend (`createBackendPlugin`, router on `coreServices.httpRouter` + `httpAuth`, `rootConfig`, `logger`, `catalogServiceRef`).
- Shared response types are duplicated as a small `types.ts` in each package rather than a third `jira-common` package — the surface is one response type; a common package can be extracted later if it grows. (Keeps the change to two new workspaces.)

### D5: Frontend composition

- `EntityContentBlueprint.make({ params: { path: 'jira', title: 'Jira', filter: isJiraAvailable } })` where `isJiraAvailable = (entity) => Boolean(entity.metadata.annotations?.['jira/project-key'])`.
- Component tree: `JiraContent` → filter `Select` (from `@backstage/ui`) + `IssuesTable` (`TableRoot`/`useTable`) with `Skeleton` loading rows, empty state, and error panel with retry. Data fetching via `useAsync`-style hook keyed on `(entityRef, filterId)`.
- The plugin is registered in `packages/app/src/App.tsx` `features` array (this app does not use feature discovery).

## Risks / Trade-offs

- **[Framework rejects `type: jira` once `DefaultConnectionsService` is instantiated]** → Nothing in the app consumes `core.connections` today, so startup is unaffected. Documented prominently in both plugin READMEs; the failure mode is a clear startup `InputError` naming the type, not silent misbehavior. If it bites before upstream supports custom types, the documented workaround is `match: { plugins: [] }`-style scoping is *not* enough — instead move the entry temporarily to a `jira.connections` mirror key supported by the same reader (one-line config move).
- **[Upstream API drift: connections shapes are experimental]** → The reader owns its zod schema and semantics; upstream changes cannot break us at runtime since we never call framework code for lookup. Migration is an isolated refactor of `JiraConnectionsReader`.
- **[JQL injection via config]** → Filter JQL is operator-supplied config (trusted), entity annotation values are quoted/escaped before interpolation; caller input is restricted to enum-validated filter ids.
- **[Jira API variance Cloud vs Data Center]** → Use `/rest/api/2/search` + fields common to both; auth method choice (`basic` vs `token`) is per-connection, so mixed fleets work.
- **[Rate limits / latency on popular entities]** → Small in-memory TTL cache (per host+JQL, ~60s) in the backend; acceptable staleness for a read-only view. Cache is an implementation detail, not spec'd.

## Migration Plan

New, additive plugins — no data migration. Deploy = merge + set `connections` entry + optional `jira.filters`. Rollback = remove the two `backend.add`/`features` lines; config keys are inert without the plugins. When upstream ships a public connections service with custom types: replace `JiraConnectionsReader` with the service dependency, delete the reader, keep config unchanged.

## Open Questions

- Whether to also surface a summary card (issue counts by status) on the entity overview page — deferred; the API response already carries enough data to add it later without API changes.
- Pagination UX beyond the first 50 issues (the API returns `total`; the table can grow a "load more" later without breaking the response shape).
