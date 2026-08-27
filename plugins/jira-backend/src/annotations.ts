/** Annotation holding the Jira project key an entity belongs to. */
export const JIRA_PROJECT_KEY_ANNOTATION = 'jira/project-key';

/** Optional annotation narrowing issues to a Jira component. */
export const JIRA_COMPONENT_ANNOTATION = 'jira/component';

/** Optional annotation selecting a Jira connection host. */
export const JIRA_INSTANCE_ANNOTATION = 'jira/instance';

/**
 * Optional annotation on User entities overriding the email used to find
 * the user's Jira account.
 */
export const JIRA_USER_EMAIL_ANNOTATION = 'jira/user-email';

/** Optional annotation naming the Jira board whose active sprint to show. */
export const JIRA_BOARD_ID_ANNOTATION = 'jira/board-id';
