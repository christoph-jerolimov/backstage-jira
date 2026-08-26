import { Entity } from '@backstage/catalog-model';
import { coreExtensionData } from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  entityJiraContent,
  entityJiraOverviewCard,
  jiraPlugin,
} from './plugin';

describe('jiraPlugin', () => {
  it('exports the plugin', () => {
    expect(jiraPlugin).toBeDefined();
  });

  it('registers an entity content tab at /jira titled "Jira"', () => {
    const tester = createExtensionTester(entityJiraContent);
    expect(tester.get(coreExtensionData.routePath)).toBe('jira');
    expect(tester.get(EntityContentBlueprint.dataRefs.title)).toBe('Jira');
  });

  it('offers the tab only for entities with the project-key annotation', () => {
    const tester = createExtensionTester(entityJiraContent);
    const filter = tester.get(EntityContentBlueprint.dataRefs.filterFunction);
    const entity = (annotations?: Record<string, string>): Entity => ({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'x', annotations },
    });
    expect(filter?.(entity({ 'jira/project-key': 'PROJ' }))).toBe(true);
    expect(filter?.(entity())).toBe(false);
  });

  it('offers the overview card only for entities with the project-key annotation', () => {
    const tester = createExtensionTester(entityJiraOverviewCard);
    const filter = tester.get(EntityCardBlueprint.dataRefs.filterFunction);
    const entity = (annotations?: Record<string, string>): Entity => ({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'x', annotations },
    });
    expect(filter?.(entity({ 'jira/project-key': 'PROJ' }))).toBe(true);
    expect(filter?.(entity())).toBe(false);
  });
});
