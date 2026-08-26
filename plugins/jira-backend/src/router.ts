import {
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { parseEntityRef } from '@backstage/catalog-model';
import express from 'express';
import Router from 'express-promise-router';
import {
  JIRA_COMPONENT_ANNOTATION,
  JIRA_INSTANCE_ANNOTATION,
  JIRA_PROJECT_KEY_ANNOTATION,
} from './annotations';
import { buildJql, JiraApiError, JiraClient } from './services/JiraClient';
import { JiraConnectionsReader } from './services/JiraConnectionsReader';
import { JiraFilterConfig } from './services/filterConfig';
import { JiraIssuesResponse } from './types';

export async function createRouter({
  logger,
  httpAuth,
  catalog,
  connections,
  filterConfig,
  jiraClient,
}: {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  catalog: CatalogService;
  connections: JiraConnectionsReader;
  filterConfig: JiraFilterConfig;
  jiraClient: JiraClient;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const filterInfos = filterConfig.filters.map(f => ({
    id: f.id,
    name: f.name,
    default: f.id === filterConfig.defaultFilterId,
  }));

  router.get('/v1/issues', async (req, res) => {
    const credentials = await httpAuth.credentials(req, {
      allow: ['user', 'service'],
    });

    const entityRef = req.query.entityRef;
    if (typeof entityRef !== 'string' || entityRef.length === 0) {
      throw new InputError('Missing required query parameter "entityRef"');
    }
    let parsedRef;
    try {
      parsedRef = parseEntityRef(entityRef);
    } catch {
      throw new InputError(`Invalid entity ref "${entityRef}"`);
    }

    const filterParam = req.query.filter;
    if (filterParam !== undefined && typeof filterParam !== 'string') {
      throw new InputError('Query parameter "filter" must be a single string');
    }
    const filterId = filterParam ?? filterConfig.defaultFilterId;
    const filter = filterConfig.filters.find(f => f.id === filterId);
    if (!filter) {
      throw new InputError(
        `Unknown filter "${filterId}"; known filters: ${filterConfig.filters
          .map(f => f.id)
          .join(', ')}`,
      );
    }

    const entity = await catalog.getEntityByRef(parsedRef, { credentials });
    if (!entity) {
      throw new NotFoundError(`Entity "${entityRef}" not found`);
    }
    const annotations = entity.metadata.annotations ?? {};
    const projectKey = annotations[JIRA_PROJECT_KEY_ANNOTATION];
    if (!projectKey) {
      throw new NotFoundError(
        `Entity "${entityRef}" has no "${JIRA_PROJECT_KEY_ANNOTATION}" annotation`,
      );
    }
    const component = annotations[JIRA_COMPONENT_ANNOTATION];
    const instanceHost = annotations[JIRA_INSTANCE_ANNOTATION];

    // Connection problems are configuration errors (500), not client errors:
    // rethrow them without the InputError/NotFoundError marker types that the
    // error middleware maps to 4xx.
    let connection;
    try {
      connection = connections.find(
        instanceHost ? { host: instanceHost } : {},
      );
    } catch (e) {
      throw new Error(`Jira connection configuration error: ${(e as Error).message}`);
    }

    const jql = buildJql({
      projectKey,
      component,
      filterJql: filter.jql || undefined,
    });

    let searchResult;
    try {
      searchResult = await jiraClient.searchIssues({ connection, jql });
    } catch (e) {
      if (e instanceof JiraApiError) {
        logger.warn(`Jira request failed: ${e.message}`);
        res.status(502).json({
          error: { name: 'JiraApiError', message: e.message },
        });
        return;
      }
      throw e;
    }

    const response: JiraIssuesResponse = {
      issues: searchResult.issues,
      total: searchResult.total,
      filters: filterInfos,
      appliedFilter: filter.id,
      project: {
        key: projectKey,
        url: `${connection.baseUrl}/browse/${encodeURIComponent(projectKey)}`,
      },
    };
    res.json(response);
  });

  return router;
}
