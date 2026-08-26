# Add Jira Plugin

## Why

Teams using this Backstage instance track work in Jira, but there is no way to see the Jira issues that belong to a catalog entity without leaving Backstage. A Jira integration that surfaces open issues directly on the entity page shortens the feedback loop and makes the catalog the single pane of glass for a service.

## What Changes

- New frontend plugin `jira` (`plugins/jira`) that adds a **"Jira" tab** to entity pages in the software catalog, rendered only for entities carrying a `jira/project-key` annotation. The tab shows the entity's Jira issues as a table built with Backstage UI (`@backstage/ui`) components, integrated via the new frontend system (`EntityContentBlueprint`).
- The tab provides a **filter control**. Named filters (label + JQL fragment) are configurable in `app-config.yaml`, including which filter is the default. Out of the box the default filter shows **unresolved issues only**.
- New backend plugin `jira-backend` (`plugins/jira-backend`) exposing a REST API that takes an **`entityRef`**, resolves the entity's Jira annotations via the catalog, and fetches matching issues from Jira. The frontend never talks to Jira directly.
- The backend reads the Jira host and credentials from the **new Backstage connections configuration** (`connections` in app-config, BEP-0014 shape): a `type: jira` connection entry with `host` and `auth` methods. Legacy proxy-based or plugin-private credential config is explicitly not used.
- Wire-up of both plugins into `packages/backend` and `packages/app`, plus example configuration in `app-config.yaml` and an annotated example entity.

## Capabilities

### New Capabilities

- `jira-entity-issues`: Entity page Jira tab — annotation-driven visibility, issue table rendering, filter selection UX, loading/empty/error states.
- `jira-issues-api`: Backend REST API — entityRef-based issue lookup, annotation resolution via catalog, JQL construction from configured filters, auth of incoming requests, error mapping.
- `jira-connection`: Jira connectivity — reading the `connections` config for `type: jira` entries, supported auth methods, host lookup, request authentication against Jira Cloud / Data Center.
- `jira-filter-config`: Filter configuration — app-config schema for named filters and the default filter, fallback behavior when nothing is configured.

### Modified Capabilities

_None — this is a greenfield addition; no existing specs are affected._

## Impact

- **New packages**: `plugins/jira` (frontend), `plugins/jira-backend` (backend). Optionally a small shared `plugins/jira-common` for the API types if we keep types duplicated to two packages minimal.
- **Modified**: `packages/backend/src/index.ts` (register jira-backend), `packages/app/src/App.tsx` (register jira frontend plugin), `app-config.yaml` (`connections` entry + `jira.filters`), `examples/entities.yaml` (annotation example).
- **Dependencies**: `@backstage/ui` (frontend table/filters), `@backstage/backend-plugin-api`, `@backstage/catalog-client` (entity lookup), `zod` (config/connection validation). No new infrastructure.
- **Constraint discovered during research**: `@backstage/connections` 0.3.0 ships a *closed* set of connection types (no `jira`), and the framework's `connectionsServiceRef` is not yet publicly exported. The backend therefore parses the `connections` config itself for `type: jira` entries, mirroring the BEP-0014 shapes, with a documented migration path to the framework service once upstream supports custom types. See design.md for the trade-offs, including the interaction with the framework's own validation of the `connections` array.
