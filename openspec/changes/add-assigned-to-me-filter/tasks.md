## 1. Backend: user resolution

- [ ] 1.1 Add `findUser` to `JiraClient` (`GET /rest/api/2/user/search?query=<email>` with `?username=` fallback on 400/404/empty, returning `accountId ?? name`, `JiraApiError` on transport failures) and verify with mocked-fetch unit tests covering Cloud response, DC fallback, no match, and error mapping
- [ ] 1.2 Implement a `JiraUserResolver` service (catalog User entity lookup with on-behalf-of credentials, `jira/user-email` annotation override, profile email fallback, per-host+email TTL cache of successful resolutions, distinct errors for non-user principal / missing entity or email / unknown Jira account) and verify with unit tests for each path including cache hits skipping Jira

## 2. Backend: filter integration

- [ ] 2.1 Reserve the `assigned-to-me` id in `readFilterConfig` (startup error on configured use, accept it as `defaultFilter`) and verify with unit tests
- [ ] 2.2 Wire the router: append `assigned-to-me` ("Assigned to me") to the reported filter list (default only when explicitly configured), branch `filter=assigned-to-me` to the resolver, and pass the escaped `assignee` constraint through `buildJql` (new `assignee` option composing with search/sort/paging); verify with router tests for the filter list, resolved-JQL shape, annotation override, 400 service caller, 404 missing email, and 404 unknown Jira account

## 3. Docs and verification

- [ ] 3.1 Update both READMEs (`assigned-to-me` filter, `jira/user-email` User-entity annotation, Browse-users permission note, guest-user behavior) and verify samples match the implementation
- [ ] 3.2 Full verification: `yarn tsc`, `yarn lint:all`, both plugins' test suites green
- [ ] 3.3 End-to-end smoke: extend the mock Jira with a `/rest/api/2/user/search` endpoint, add an email to the guest User entity (or annotation) in `examples/org.yaml`, then confirm via API and Playwright that selecting "Assigned to me" in the tab issues JQL with the resolved assignee and renders that user's issues
