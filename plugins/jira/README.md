# Jira frontend plugin

Adds a **Jira** tab to catalog entity pages, showing the entity's Jira
issues as a paginated, sortable, and searchable table built with Backstage
UI (`@backstage/ui`), integrated via the new frontend system.

The tab appears only for entities annotated with a Jira project key (a
single key or a comma-separated list):

```yaml
metadata:
  annotations:
    jira/project-key: PROJ # or several projects: PROJ1,PROJ2
    # jira/component: backend # optional: narrow to a Jira component
    # jira/instance: example.atlassian.net # optional: pick a Jira host
```

A compact **Jira summary card** on the entity Overview page shows issue
counts by status category (To Do / In Progress / Done) with a link into
the Jira tab. The card registers itself for annotated entities in the
default overview layout; apps using a custom entity content layout place
it like any other entity card. Counts come from the backend's
`status-counts` endpoint and are exact regardless of project size.

The key, summary, status, priority, and updated columns sort server-side
(Jira orders priority/status by rank, as in Jira's own UI), the search box
matches issue summaries with Jira's `~` word matching, and the pagination
control pages through the full result set — all queries are executed by the
backend.

Issues are fetched exclusively through the `jira` backend plugin
(`plugins/jira-backend`) by entity ref — the browser never talks to Jira
and never sees Jira credentials. The filter control is populated from the
backend's configured filters (`jira.filters` / `jira.defaultFilter` in
app-config; built-in "Unresolved" and "All issues" otherwise), with the
default filter pre-selected. A built-in **"Assigned to me"** filter is
always offered as well: the backend maps the signed-in user to their Jira
account (via the User entity's profile email, or a `jira/user-email`
annotation on the User entity) and shows only issues assigned to them. See
[`plugins/jira-backend/README.md`](../jira-backend/README.md) for the
connection (`connections` array, BEP-0014 shape) and filter configuration,
including the connections-framework caveat and migration note.

## Installation

Already wired in this app: registered in `packages/app/src/App.tsx`
(`features` array) with the backend registered in
`packages/backend/src/index.ts`.
