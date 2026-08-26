## ADDED Requirements

### Requirement: User-scoped filter resolution

When the `assigned-to-me` filter is requested, the Jira backend SHALL resolve the caller to a Jira account in two steps: (1) the authenticated Backstage user's email, taken from the `jira/user-email` annotation on their User entity when present, otherwise from the User entity's profile email; (2) that email resolved to a Jira account identifier via Jira's user search API, with successful resolutions cached in-memory. The resulting JQL constraint SHALL reference the resolved account as an escaped literal — the caller can never influence the JQL beyond selecting the filter id. Failures SHALL be distinct and human-readable: `400` when the caller has no user identity (service credentials), `404` when the User entity is missing or has no email, and `404` when Jira knows no account for the email; none of these SHALL leak credentials.

#### Scenario: Issues scoped to the resolved account

- **WHEN** an authenticated user whose User entity has email `dana@example.com`, known to Jira, requests issues with `filter=assigned-to-me`
- **THEN** the executed JQL constrains `assignee` to the Jira account resolved for `dana@example.com`, combined with the entity's project (and component) constraints

#### Scenario: Annotation overrides profile email

- **WHEN** the caller's User entity has annotation `jira/user-email: dana.b@corp.example.com` and a different profile email
- **THEN** the annotation email is used for the Jira account lookup

#### Scenario: Service caller

- **WHEN** a service (non-user) principal requests `filter=assigned-to-me`
- **THEN** the response is `400` explaining the filter requires a signed-in user

#### Scenario: No Jira account for the user

- **WHEN** the caller's email is not known to Jira
- **THEN** the response is `404` with a message naming the email lookup failure (not the credentials), and no issue query is executed
