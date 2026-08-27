# Design: Add URL Query State and UI Polish

## Context

Frontend-only change on top of the five merged Jira rounds. Relevant current state:

- `IssuesView` (in `plugins/jira/src/components/JiraContent/JiraContent.tsx`) holds one `IssueQuery` object (`filterId`, `sortBy`, `order`, `search`, `startAt`) plus a debounced `searchInput`; `JiraContent` holds the `view` ('issues' | 'sprint') and detail-dialog state. All state changes already funnel through `setQuery`/`setView`.
- The plugin ships `SORT_FIELDS` in `types.ts` for validation; the backend re-validates everything, so URL values are convenience input, not a trust boundary.
- `react-router-dom` v6 is the app's router (via the entity page); `useSearchParams` is available to plugin components. The issues response carries `projects: [{key, url}]`, currently unused by the UI.
- The overview card renders three `Flex` count blocks from `value.categories`; `value.total` is unused.

## Goals / Non-Goals

**Goals:**

- Shareable, refresh-safe URLs for the tab's full query state with graceful handling of garbage parameters, and a clean URL in the default state.
- Surface `projects` in the tab; surface `total` on the card.

**Non-Goals:**

- Persisting the open detail dialog's issue key in the URL (a deep link to an issue is better served by Jira itself via the existing links; keeps the param surface small).
- Backend changes of any kind; URL state for the overview card (it has none).

## Decisions

### D1: URL is the single source of truth for the query state

Rather than mirroring URL ↔ component state (two sources, sync bugs), `IssuesView`'s `query` and `JiraContent`'s `view` are *derived from* `useSearchParams` on every render, and their setters write to the URL. A small module `queryState.ts` owns the mapping:

- `parseQueryState(params, {hasBoard}) → {query, view}` — validates each param (`filter` any string, backend validates; `sortBy` against `SORT_FIELDS`; `order` asc/desc; `startAt` non-negative integer; `view` issues/sprint only when `hasBoard`), dropping invalid values silently per spec.
- `queryStateToParams(query, view) → URLSearchParams` — omits every default (`startAt=0`, unset filter/sort/search, `view=issues`) so the default URL stays clean.

Param names are unprefixed (`filter`, `sortBy`, `order`, `search`, `startAt`, `view`) — they match the API's vocabulary, the entity page uses no conflicting params, and prefixes would only make shared URLs uglier.

**Alternative** (keep `useState`, sync with effects): two-way sync effects are a classic source of loops and stale state; deriving from the URL removes the second copy entirely. The one exception is `searchInput` (the un-debounced text field value), which stays local state and flushes into the URL through the existing debounce.

### D2: `setSearchParams(..., { replace: true })`

Every query-state write uses `replace`, so browsing within the tab does not stack history entries — Back leaves the tab rather than un-typing a search. This is the "no history flooding" spec behavior; view/filter changes could arguably be `push`, but a single consistent `replace` is predictable and matches how most Backstage tables behave.

### D3: Projects header from response data

`IssuesView` already receives the response; a small line next to the controls renders `value.projects` as external `Link`s (new tab, like issue keys). No extra fetch, hidden while nothing is loaded. This also implicitly covers single-project entities (one link) without a special case.

### D4: Card total as a fourth block

`JiraOverviewCard` appends a "Total" block styled like the category blocks, reading the existing `value.total`. No API or type change.

## Risks / Trade-offs

- **[Query params survive tab switches within the entity page]** → The entity page's tab navigation links replace the whole search string, so parameters don't leak between tabs; asserted in the smoke test.
- **[URL editing by hand can produce odd combinations]** (e.g. `startAt` beyond the last page) → The backend clamps/handles these already; the table shows an empty page with working pagination controls — acceptable.
- **[`useSearchParams` re-renders on any param change]** → The tab is the only param consumer on the page; negligible.

## Migration Plan

Frontend-only, additive. Old URLs (no params) behave exactly as before. Rollback by reverting.
