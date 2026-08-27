# Jira backend plugin

Backend plugin serving Jira issues for catalog entities. The frontend
counterpart in `plugins/jira` renders them as an entity tab; all Jira access
happens here, server-side, so credentials never reach the browser.

## API

`GET /api/jira/v1/issues?entityRef=<ref>` (Backstage user or service
credentials required)

- Resolves the entity via the catalog (with on-behalf-of credentials, so
  catalog permissions apply), reads its Jira annotations, and queries Jira
  with JQL assembled server-side.
- Optional query parameters:
  - `filter`: one of the configured filter ids, or the built-in
    `assigned-to-me` (see below); the default filter applies when omitted.
  - `startAt`, `limit`: offset pagination; `limit` is capped at 50.
  - `sortBy` (`updated`, `created`, `key`, `priority`, `status`, `summary`)
    and `order` (`asc`/`desc`): JQL `ORDER BY` sorting. Default is `updated`
    descending. Note that Jira sorts `priority` and `status` by their rank
    order, matching Jira's own UI, not alphabetically.
  - `search`: matched against issue summaries with the JQL `~` operator
    (Jira's word-based "contains" matching, not a strict substring match);
    the text is escaped and can never extend the query.
- Responds with `{ issues, total, startAt, pageSize, filters,
appliedFilter, project, projects }` (`project` is the first annotated
  project, kept for compatibility).
- Errors: `400` invalid entityRef/filter/sort/pagination values, `401`
  unauthenticated, `404` unknown entity or missing annotation, `500`
  missing/invalid Jira connection config, `502` Jira unreachable or
  rejecting the query.

`GET /api/jira/v1/issues/<issueKey>?entityRef=<ref>` (same auth)

- Full detail of one issue: fields, labels, reporter, raw description text,
  and the five most recent comments (raw text, newest first) with the total
  comment count. Description and comments are passed through as text — the
  frontend renders them literally.
- Only keys belonging to the entity's annotated projects are served
  (case-insensitive prefix match); other keys get a `404` without any Jira
  call, malformed keys a `400`.

`GET /api/jira/v1/sprint?entityRef=<ref>` (same auth)

- The active sprint of the board named by the entity's `jira/board-id`
  annotation (Jira Software's Agile API), with the sprint's issues (capped
  at 50, `total` reported): `{ sprint, issues, total }`; `sprint` is `null`
  when the board has no active sprint. With parallel sprints enabled, the
  first active sprint is used.
- Missing or non-numeric `jira/board-id` yields a `404` naming the
  annotation. Requires Jira Software (the `/rest/agile/1.0` API).

`GET /api/jira/v1/status-counts?entityRef=<ref>` (same auth)

- Returns exact issue counts per Jira status category for the entity's
  annotated projects (and component), computed with Jira count queries —
  independent of the issues endpoint's filters and pagination:
  `{ categories: [{ id: todo|inprogress|done, name, count }], total }`.
- Same annotation handling and error mapping as the issues endpoint
  (`400`/`401`/`404`/`500`/`502`).

## Entity annotations

| Annotation         | Meaning                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `jira/project-key` | Jira project key, or a comma-separated list (`PROJ1,PROJ2`) queried together; required for the Jira tab to appear. |
| `jira/component`   | Optional Jira component to narrow issues.                                                                          |
| `jira/instance`    | Optional connection host when several Jira hosts are configured.                                                   |
| `jira/board-id`    | Optional numeric Jira board id; enables the Sprint view in the Jira tab.                                           |
| `jira/user-email`  | On **User** entities: overrides the email used to find the user's Jira account for the "Assigned to me" filter.    |

## Configuration

### Connection

The Jira host and credentials are read from the top-level `connections`
array, following the shapes of the Backstage connections framework
([BEP-0014](https://github.com/backstage/backstage/tree/master/beps)):

```yaml
connections:
  - type: jira
    title: My Jira
    host: example.atlassian.net
    # apiBaseUrl: https://example.atlassian.net # optional override
    auth:
      # Jira Cloud: account email + API token
      - method: basic
        email: ${JIRA_EMAIL}
        apiToken: ${JIRA_API_TOKEN}
      # Jira Data Center / Server: personal access token (bearer)
      # - method: token
      #   token: ${JIRA_PAT}
```

Multiple `type: jira` entries are supported; entities pick one with the
`jira/instance` annotation. Invalid entries fail backend startup with an
error naming the connection (secret values are never echoed).

**Connections framework caveat:** as of `@backstage/connections` 0.3.0 the
framework's connection type registry is closed and has no `jira` type, and
its backend service is not publicly exported. This plugin therefore parses
the `type: jira` entries itself (see `JiraConnectionsReader`), mirroring the
framework's config shapes and `find()` semantics. If some other feature
instantiates the framework's own connections service, that service rejects
unknown connection types at startup; nothing in this app does so today. Once
upstream supports custom connection types, the reader can be replaced by the
framework service with no app-config changes.

### Filters

```yaml
jira:
  defaultFilter: unresolved # optional; defaults to the first filter
  filters:
    - id: unresolved
      name: Unresolved
      jql: resolution = Unresolved
    - id: all
      name: All issues # omitting jql means "no extra constraint"
```

Without a `jira.filters` section, built-in `unresolved` (default) and `all`
filters apply. Filter JQL is trusted operator config; API callers can only
select filters by id and can never submit JQL.

### "Assigned to me" filter

A built-in `assigned-to-me` ("Assigned to me") filter is always offered
after the configured filters. When selected, the backend maps the signed-in
Backstage user to a Jira account and constrains the query to
`assignee = <account>`:

1. The caller's User entity is looked up in the catalog (with the caller's
   credentials). The email comes from a `jira/user-email` annotation on the
   User entity when present, otherwise from `spec.profile.email`.
2. The email is resolved to a Jira account via Jira's user search API
   (Cloud `?query=` with a Data Center `?username=` fallback); successful
   resolutions are cached in-memory for ten minutes.

Notes:

- The filter id `assigned-to-me` is reserved — configuring a filter with
  that id fails startup. `jira.defaultFilter: assigned-to-me` is allowed.
- The Jira service account needs the **Browse users** permission for the
  user search; without it, the filter fails with a 502.
- Callers without a user identity (service tokens, guest sign-in without a
  User entity) get a clear 400/404 explaining what is missing; other
  filters keep working.

## Development

`yarn start` in this package runs a standalone dev backend with a mock
catalog entity `component:default/sample` annotated with `PROJ`; try:

```sh
curl 'http://localhost:7007/api/jira/v1/issues?entityRef=component:default/sample' \
  -H 'Authorization: Bearer mock-service-token'
```
