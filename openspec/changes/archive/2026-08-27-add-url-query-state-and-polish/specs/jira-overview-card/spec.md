## MODIFIED Requirements

### Requirement: Counts by status category

The card SHALL display the entity's total issue counts for Jira's three status categories — "To Do", "In Progress", and "Done" — and their sum, fetched through the Jira backend. Counts SHALL cover all issues of the entity's annotated projects (and component, when annotated), independent of the Jira tab's filters and pagination.

#### Scenario: Counts render

- **WHEN** the card loads and the backend reports To Do: 12, In Progress: 5, Done: 130
- **THEN** the card shows the three labeled counts 12, 5, and 130 and a labeled total of 147

#### Scenario: Counts are page-independent

- **WHEN** the entity's projects contain more issues than one Jira tab page
- **THEN** the card's counts still reflect the full totals
