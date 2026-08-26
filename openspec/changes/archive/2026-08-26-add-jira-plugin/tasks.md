## 1. Scaffolding

- [x] 1.1 Scaffold `plugins/jira-backend` with `yarn new` (backend-plugin, id `jira`) and verify `yarn tsc` passes with the empty plugin registered in `packages/backend/src/index.ts`
- [x] 1.2 Scaffold `plugins/jira` with `yarn new` (frontend plugin for the new frontend system, id `jira`); add it to the `features` array in `packages/app/src/App.tsx` and verify `yarn tsc` passes

## 2. Backend: connection + filter config

- [x] 2.1 Implement `JiraConnectionsReader` in `plugins/jira-backend` (zod-validated parsing of top-level `connections` entries with `type: jira`, auth methods `basic`/`token`, `find({ host? })` with single/annotated/ambiguous-host semantics per the `jira-connection` spec) and verify with unit tests covering valid entries, missing entry, invalid auth, and multi-host disambiguation
- [x] 2.2 Implement filter config loading (`jira.filters`, `jira.defaultFilter`, built-in `unresolved`/`all` fallback, fail-fast on duplicate ids / unknown default per the `jira-filter-config` spec) and verify with unit tests for each scenario
- [x] 2.3 Add `config.d.ts` to `plugins/jira-backend` declaring the `jira.filters`/`jira.defaultFilter` keys and the `type: jira` connection fields with `@visibility secret` on `apiToken`/`token`, and verify `yarn backstage-cli config:check` (or repo equivalent) accepts the example app-config

## 3. Backend: Jira client + API

- [x] 3.1 Implement the Jira REST client (POST `/rest/api/2/search` with JQL built from project/component/filter, quoted-string escaping of annotation values, basic/bearer auth headers, field selection, response mapping to the API issue shape) and verify with unit tests using mocked fetch, including an escaping test and an auth-header test per method
- [x] 3.2 Implement the router: `GET /v1/issues?entityRef&filter` with `httpAuth` caller enforcement, catalog entity resolution via `catalogServiceRef` with on-behalf-of credentials, annotation extraction, and the 400/401/404/500/502 error mapping from the `jira-issues-api` spec; verify with router tests (supertest + mock services) covering success, missing annotation, unknown filter, unauthenticated, and Jira-down cases
- [x] 3.3 Assert no-secret-leak behavior: add a test that a failing Jira call produces a response body and log output free of configured secret values

## 4. Frontend: Jira tab

- [x] 4.1 Implement `JiraApi` client (`ApiBlueprint`, `discoveryApi`/`fetchApi`, typed response) plus the `isJiraAvailable` annotation predicate, and verify with a unit test of the URL construction and predicate
- [x] 4.2 Implement `IssuesTable` and `JiraContent` with `@backstage/ui` components (table columns key/summary/type/status/priority/assignee/updated, key links opening in new tab, filter `Select` seeded from the response's `filters` with default pre-selected, `Skeleton` loading, empty and error-with-retry states) and verify with component tests for the loading/empty/error/filter-change scenarios from the `jira-entity-issues` spec
- [x] 4.3 Register the entity tab via `EntityContentBlueprint` (path `jira`, title `Jira`, filter `isJiraAvailable`) and verify with a test that the tab renders for an annotated entity and is absent otherwise

## 5. Wiring, config, and docs

- [x] 5.1 Add example configuration to `app-config.yaml` (`connections` entry with env-var secrets, `jira.filters` with `unresolved` default) and a `jira/project-key` annotation to an example entity in `examples/entities.yaml`; verify the backend starts cleanly with `yarn start` and unconfigured secrets only degrade the Jira tab
- [x] 5.2 Write READMEs for both plugins (annotation reference, config reference, the connections-framework caveat and migration note from design.md D1/D2) and verify links/config samples match the implemented schema
- [x] 5.3 Run full verification: `yarn tsc`, `yarn lint:all`, `yarn test` for both plugins and touched packages, all green
- [x] 5.4 Manual smoke test with the run skill or `yarn start`: open the annotated example entity, confirm the Jira tab appears, the default "Unresolved" filter is selected, and switching filters re-fetches (against a mock/unconfigured backend this verifies the error/empty states render as specified)
