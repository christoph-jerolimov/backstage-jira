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
import {
  JiraIssuesResponse,
  MAX_PAGE_SIZE,
  SORT_FIELDS,
  SortField,
  SortOrder,
} from './types';

function singleParam(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`Query parameter "${name}" must be a single string`);
  }
  return value;
}

function numberParam(value: unknown, name: string): number | undefined {
  const raw = singleParam(value, name);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InputError(
      `Query parameter "${name}" must be a non-negative integer`,
    );
  }
  return parsed;
}

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

    const filterParam = singleParam(req.query.filter, 'filter');
    const filterId = filterParam ?? filterConfig.defaultFilterId;
    const filter = filterConfig.filters.find(f => f.id === filterId);
    if (!filter) {
      throw new InputError(
        `Unknown filter "${filterId}"; known filters: ${filterConfig.filters
          .map(f => f.id)
          .join(', ')}`,
      );
    }

    const startAt = numberParam(req.query.startAt, 'startAt') ?? 0;
    const limit = Math.min(
      numberParam(req.query.limit, 'limit') ?? MAX_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const sortByParam = singleParam(req.query.sortBy, 'sortBy');
    if (
      sortByParam !== undefined &&
      !SORT_FIELDS.includes(sortByParam as SortField)
    ) {
      throw new InputError(
        `Unknown sort field "${sortByParam}"; allowed fields: ${SORT_FIELDS.join(', ')}`,
      );
    }
    const sortBy = (sortByParam as SortField | undefined) ?? 'updated';
    const orderParam = singleParam(req.query.order, 'order');
    if (orderParam !== undefined && orderParam !== 'asc' && orderParam !== 'desc') {
      throw new InputError(
        `Invalid order "${orderParam}"; allowed values: asc, desc`,
      );
    }
    const order: SortOrder =
      orderParam ?? (sortByParam === undefined ? 'desc' : 'asc');
    const search = singleParam(req.query.search, 'search')?.trim() || undefined;

    const entity = await catalog.getEntityByRef(parsedRef, { credentials });
    if (!entity) {
      throw new NotFoundError(`Entity "${entityRef}" not found`);
    }
    const annotations = entity.metadata.annotations ?? {};
    const projectKeys = (annotations[JIRA_PROJECT_KEY_ANNOTATION] ?? '')
      .split(',')
      .map(key => key.trim())
      .filter(Boolean);
    if (projectKeys.length === 0) {
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
      projectKeys,
      component,
      filterJql: filter.jql || undefined,
      search,
      sortBy,
      order,
    });

    let searchResult;
    try {
      searchResult = await jiraClient.searchIssues({
        connection,
        jql,
        startAt,
        maxResults: limit,
      });
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

    const projects = projectKeys.map(key => ({
      key,
      url: `${connection.baseUrl}/browse/${encodeURIComponent(key)}`,
    }));
    const response: JiraIssuesResponse = {
      issues: searchResult.issues,
      total: searchResult.total,
      startAt: searchResult.startAt,
      pageSize: searchResult.pageSize,
      filters: filterInfos,
      appliedFilter: filter.id,
      project: projects[0],
      projects,
    };
    res.json(response);
  });

  return router;
}
