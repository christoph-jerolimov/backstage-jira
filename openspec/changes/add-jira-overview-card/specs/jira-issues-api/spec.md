## ADDED Requirements

### Requirement: Status-count lookup by entity ref

The Jira backend SHALL expose an HTTP endpoint that accepts an entity ref and responds with the entity's issue counts per Jira status category ("To Do", "In Progress", "Done") and their sum. Counts SHALL be computed with Jira count queries constrained by the entity's `jira/project-key` (single or comma-separated) and optional `jira/component` annotations — never by paging through issues — so they are exact for projects of any size. The endpoint SHALL apply the same caller authentication, catalog-based entity resolution, connection selection (`jira/instance`), and error mapping as the issue lookup endpoint, and SHALL NOT leak credentials in errors.

#### Scenario: Counts returned

- **WHEN** an authenticated request arrives for an annotated entity whose project has 12 To Do, 5 In Progress, and 130 Done issues
- **THEN** the response is `200` with the three labeled category counts and a total of 147

#### Scenario: Constraints match the issues endpoint

- **WHEN** the entity has `jira/project-key: PROJ1,PROJ2` and `jira/component: backend`
- **THEN** each category count is scoped to those projects and that component

#### Scenario: Shared error mapping

- **WHEN** the request is unauthenticated, the entity is missing or unannotated, no Jira connection is configured, or Jira is unreachable
- **THEN** the endpoint responds with `401`, `404`, `500`, or `502` respectively, matching the issue lookup endpoint's behavior
