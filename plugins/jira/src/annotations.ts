import { Entity } from '@backstage/catalog-model';

/** Annotation holding the Jira project key an entity belongs to. */
export const JIRA_PROJECT_KEY_ANNOTATION = 'jira/project-key';

/** Whether the Jira tab should be shown for the given entity. */
export function isJiraAvailable(entity: Entity): boolean {
  return Boolean(entity.metadata.annotations?.[JIRA_PROJECT_KEY_ANNOTATION]);
}
