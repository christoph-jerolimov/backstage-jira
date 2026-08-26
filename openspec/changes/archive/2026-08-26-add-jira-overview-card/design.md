# Design: Add Jira Overview Card

## Context

Builds on the merged `add-jira-plugin` and `enhance-jira-issue-querying` changes. Relevant current state:

- The issues endpoint is paginated (max 50/page), so summing a page cannot produce correct counts; Jira's search API returns `total` even with `maxResults: 0`, which is the standard cheap count query.
- JQL supports `statusCategory = "To Do" | "In Progress" | "Done"` (fixed, locale-independent category constants; every Jira status maps to exactly one).
- The router already centralizes entity resolution, annotation parsing (multi-project split), connection selection, and error mapping for `/v1/issues` — the counts route reuses those pieces.
- `EntityCardBlueprint` is exported from `@backstage/plugin-catalog-react/alpha` (verified in the installed 3.2.x d.ts alongside `EntityContentBlueprint`); cards attach to the Overview page and accept the same `filter` predicate as the tab.
- `@backstage/ui` provides `Card`/`CardHeader`/`CardBody`, `Text`, `Skeleton`, `Link` for a compact card.

## Goals / Non-Goals

**Goals:**

- Exact, page-independent counts for the three Jira status categories on the Overview page, gated like the Jira tab, linking into it.
- Reuse the existing auth, annotation, connection, and error-mapping paths — no new invariants.

**Non-Goals:**

- Counts per filter or per status (only the three categories); charts/sparklines; caching (still a separate concern); write actions.

## Decisions

### D1: Dedicated `GET /v1/status-counts` endpoint with three count queries

The route resolves the entity exactly like `/v1/issues` (shared helper extracted from the current handler), then issues one count query per category: `project… [AND component…] AND statusCategory = "<cat>"` with `maxResults: 0`, reading `total`. A `countIssues` method on `JiraClient` wraps the existing search call. Three parallel requests (`Promise.all`) keep latency at one round trip.

**Alternatives:**

- *One search grouped client-side*: Jira's REST search cannot group/aggregate; paging everything to count is unbounded work. Rejected.
- *Extend `/v1/issues` with a `countsOnly` flag*: muddies one endpoint with two response shapes; a card and a table also load independently. Rejected.

Response shape: `{ categories: [{ id: 'todo'|'inprogress'|'done', name: 'To Do'|'In Progress'|'Done', count }], total }` — ordered To Do → In Progress → Done. Stable ids keep the frontend independent of display names.

### D2: Card via `EntityCardBlueprint` with the existing predicate

`EntityCardBlueprint.make({ name: 'overview-card', params: { filter: isJiraAvailable, loader } })`, registered in the plugin's `extensions` next to the tab. The card renders a `@backstage/ui` `Card` with a "Jira" header, the three counts in a row (label + number), and a "View issues" `Link`.

### D3: Link to the tab via relative navigation

The card links to the relative path `jira` (the tab's `path` param), which resolves against the current entity page route — no route-ref plumbing across plugins and no hardcoded `/catalog/...` prefix. React Router handles it as an in-app navigation.

**Alternative** (route ref binding to the tab's `routeRef`): the tab was registered without a route ref; adding one only for this link is more machinery for the same URL. Can be revisited if the tab path ever becomes configurable.

### D4: Frontend API surface

`JiraApi` gains `getStatusCounts({ entityRef })`; types are mirrored into the frontend `types.ts` as before. The card fetches with the same `useAsyncRetry` pattern as the tab (retry affordance in the error state is a bonus over the spec's minimum).

## Risks / Trade-offs

- **[3 extra Jira requests per Overview view]** → `maxResults: 0` count queries are the cheapest Jira search form; acceptable now, and the previously-noted TTL-cache idea would slot into `JiraClient` later without API changes.
- **[`statusCategory` JQL constants vs. renamed/translated categories]** → The three category constants are fixed Jira system values (ids 2/4/3) and locale-independent in JQL; display names on our card are our own strings.
- **[Overview page layout varies by app]** → The card only registers itself; the default overview layout picks it up. Apps with custom layouts place it explicitly — documented in the README.

## Migration Plan

Additive: new endpoint and new card, nothing existing changes shape. Deploy by merging; rollback by reverting. Entities without the annotation see nothing new.
