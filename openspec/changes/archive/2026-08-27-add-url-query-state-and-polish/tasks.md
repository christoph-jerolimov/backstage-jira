## 1. Query state module

- [x] 1.1 Implement `queryState.ts` in `plugins/jira` (`parseQueryState` validating filter/sortBy/order/startAt/search/view with invalid values dropped, `queryStateToParams` omitting all defaults) and verify with unit tests covering round-trips, each invalid-value case, the clean default URL, and view gating on `hasBoard`

## 2. Wiring

- [x] 2.1 Rewire `JiraContent`/`IssuesView` to derive `query` and `view` from `useSearchParams` and write changes back with `replace: true` (search input stays local until the debounce flushes); verify with component tests: initial URL state is applied to the fetch (filter/sort/search/page/view), interactions update the URL, invalid URL values fall back to defaults, and the default state leaves the URL clean
- [x] 2.2 Add the projects header line (links from the response's `projects`, opening in Jira in a new tab) and verify with a component test for a multi-project response
- [x] 2.3 Add the "Total" block to `JiraOverviewCard` and update its tests

## 3. Docs and verification

- [x] 3.1 Update the frontend README (shareable URLs, projects header, card total); verify wording matches behavior
- [x] 3.2 Full verification: `yarn tsc`, `yarn lint:all`, both plugins' test suites green
- [x] 3.3 End-to-end smoke with the mock Jira and Playwright: apply filter+sort+search, copy the URL into a fresh page and confirm the identical view (including the fetch parameters in the mock log), reload on page 2 and confirm restoration, open a `view=sprint` URL directly, confirm the projects links and the card total, and confirm switching to another entity tab drops the params
