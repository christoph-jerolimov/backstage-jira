# jira-overview-card Specification

## Purpose
Shows a compact Jira summary card on the entity Overview page — issue counts by status category with a link into the Jira tab — so the state of a service's Jira work is visible at first glance.

## Requirements

### Requirement: Card appears only for annotated entities

The entity Overview page SHALL show a Jira summary card if and only if the entity carries the `jira/project-key` annotation with a non-empty value — the same gating as the Jira tab.

#### Scenario: Annotated entity

- **WHEN** a user opens the Overview page of an entity annotated with `jira/project-key`
- **THEN** the Jira summary card is present

#### Scenario: Unannotated entity

- **WHEN** the entity has no `jira/project-key` annotation
- **THEN** no Jira summary card is shown

### Requirement: Counts by status category

The card SHALL display the entity's total issue counts for Jira's three status categories — "To Do", "In Progress", and "Done" — and their sum, fetched through the Jira backend. Counts SHALL cover all issues of the entity's annotated projects (and component, when annotated), independent of the Jira tab's filters and pagination.

#### Scenario: Counts render

- **WHEN** the card loads and the backend reports To Do: 12, In Progress: 5, Done: 130
- **THEN** the card shows the three labeled counts 12, 5, and 130 and a labeled total of 147

#### Scenario: Counts are page-independent

- **WHEN** the entity's projects contain more issues than one Jira tab page
- **THEN** the card's counts still reflect the full totals

### Requirement: Link to the Jira tab

The card SHALL link to the entity's Jira tab, navigating within Backstage (no full page reload, not to the external Jira instance).

#### Scenario: Following the link

- **WHEN** the user activates the card's link
- **THEN** the entity page navigates to its Jira tab

### Requirement: Card loading and error states

The card SHALL show a loading indicator while counts are being fetched and a compact, human-readable error message when the fetch fails; a failing card SHALL NOT break the rest of the Overview page.

#### Scenario: Backend failure

- **WHEN** the status-counts request fails
- **THEN** the card shows a short error message and the remaining Overview cards render normally
