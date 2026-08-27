import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { parseEntityRef } from '@backstage/catalog-model';
import express from 'express';
import Router from 'express-promise-router';
import {
  JIRA_BOARD_ID_ANNOTATION,
  JIRA_COMPONENT_ANNOTATION,
  JIRA_INSTANCE_ANNOTATION,
  JIRA_PROJECT_KEY_ANNOTATION,
} from './annotations';
import { buildJql, JiraApiError, JiraClient } from './services/JiraClient';
import { JiraConnectionsReader } from './services/JiraConnectionsReader';
import { JiraUserResolver } from './services/JiraUserResolver';
import {
  ASSIGNED_TO_ME_FILTER_ID,
  ASSIGNED_TO_ME_FILTER_NAME,
  JiraFilterConfig,
} from './services/filterConfig';
import {
  JiraIssuesResponse,
  JiraSprintResponse,
  JiraStatusCountsResponse,
  MAX_PAGE_SIZE,
  SORT_FIELDS,
  STATUS_CATEGORIES,
  SortField,
  SortOrder,
} from './types';
import { JiraConnection } from './services/JiraConnectionsReader';

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

/** The Jira query target an entity's annotations resolve to. */
interface JiraTarget {
  projectKeys: string[];
  component?: string;
  connection: JiraConnection;
  credentials: Awaited<ReturnType<HttpAuthService['credentials']>>;
  annotations: Record<string, string>;
}

const ISSUE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

export async function createRouter({
  logger,
  httpAuth,
  catalog,
  connections,
  filterConfig,
  jiraClient,
  userResolver,
}: {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  catalog: CatalogService;
  connections: JiraConnectionsReader;
  filterConfig: JiraFilterConfig;
  jiraClient: JiraClient;
  userResolver: JiraUserResolver;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const filterInfos = [
    ...filterConfig.filters.map(f => ({
      id: f.id,
      name: f.name,
      default: f.id === filterConfig.defaultFilterId,
    })),
    {
      id: ASSIGNED_TO_ME_FILTER_ID,
      name: ASSIGNED_TO_ME_FILTER_NAME,
      default: filterConfig.defaultFilterId === ASSIGNED_TO_ME_FILTER_ID,
    },
  ];

  // Authenticates the caller and resolves an entityRef query parameter to the
  // Jira projects, component, and connection its annotations select.
  async function resolveTarget(req: express.Request): Promise<JiraTarget> {
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
      connection = connections.find(instanceHost ? { host: instanceHost } : {});
    } catch (e) {
      throw new Error(
        `Jira connection configuration error: ${(e as Error).message}`,
      );
    }

    return { projectKeys, component, connection, credentials, annotations };
  }

  // Runs a Jira call, mapping Jira-side failures to a 502 response. Returns
  // undefined when the response has already been sent.
  async function callJira<T>(
    res: express.Response,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof JiraApiError) {
        logger.warn(`Jira request failed: ${e.message}`);
        res.status(502).json({
          error: { name: 'JiraApiError', message: e.message },
        });
        return undefined;
      }
      throw e;
    }
  }

  router.get('/v1/issues', async (req, res) => {
    const { projectKeys, component, connection, credentials } =
      await resolveTarget(req);

    const filterParam = singleParam(req.query.filter, 'filter');
    const filterId = filterParam ?? filterConfig.defaultFilterId;
    let filterJql: string | undefined;
    let assignee: string | undefined;
    if (filterId === ASSIGNED_TO_ME_FILTER_ID) {
      assignee = await userResolver.resolveAssignee({
        credentials,
        connection,
      });
    } else {
      const filter = filterConfig.filters.find(f => f.id === filterId);
      if (!filter) {
        throw new InputError(
          `Unknown filter "${filterId}"; known filters: ${filterInfos
            .map(f => f.id)
            .join(', ')}`,
        );
      }
      filterJql = filter.jql || undefined;
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
        `Unknown sort field "${sortByParam}"; allowed fields: ${SORT_FIELDS.join(
          ', ',
        )}`,
      );
    }
    const sortBy = (sortByParam as SortField | undefined) ?? 'updated';
    const orderParam = singleParam(req.query.order, 'order');
    if (
      orderParam !== undefined &&
      orderParam !== 'asc' &&
      orderParam !== 'desc'
    ) {
      throw new InputError(
        `Invalid order "${orderParam}"; allowed values: asc, desc`,
      );
    }
    const order: SortOrder =
      orderParam ?? (sortByParam === undefined ? 'desc' : 'asc');
    const search = singleParam(req.query.search, 'search')?.trim() || undefined;

    const jql = buildJql({
      projectKeys,
      component,
      filterJql,
      assignee,
      search,
      sortBy,
      order,
    });

    const searchResult = await callJira(res, () =>
      jiraClient.searchIssues({ connection, jql, startAt, maxResults: limit }),
    );
    if (!searchResult) {
      return;
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
      appliedFilter: filterId,
      project: projects[0],
      projects,
    };
    res.json(response);
  });

  router.get('/v1/issues/:issueKey', async (req, res) => {
    const { projectKeys, connection } = await resolveTarget(req);

    const issueKey = req.params.issueKey;
    if (!ISSUE_KEY_PATTERN.test(issueKey)) {
      throw new InputError(`Invalid issue key "${issueKey}"`);
    }
    // Only serve issues of the entity's own projects; this endpoint must not
    // become a generic Jira proxy.
    const keyProject = issueKey.slice(0, issueKey.lastIndexOf('-'));
    if (
      !projectKeys.some(
        project => project.toLowerCase() === keyProject.toLowerCase(),
      )
    ) {
      throw new NotFoundError(
        `Issue "${issueKey}" is not part of this entity's Jira projects`,
      );
    }

    const detail = await callJira(res, () =>
      jiraClient.getIssue({ connection, issueKey }),
    );
    if (detail === undefined) {
      if (!res.headersSent) {
        throw new NotFoundError(`Issue "${issueKey}" not found in Jira`);
      }
      return;
    }
    res.json(detail);
  });

  router.get('/v1/sprint', async (req, res) => {
    const { connection, annotations } = await resolveTarget(req);

    const rawBoardId = annotations[JIRA_BOARD_ID_ANNOTATION];
    if (!rawBoardId) {
      throw new NotFoundError(
        `Entity has no "${JIRA_BOARD_ID_ANNOTATION}" annotation`,
      );
    }
    const boardId = Number(rawBoardId);
    if (!Number.isInteger(boardId) || boardId <= 0) {
      throw new NotFoundError(
        `Annotation "${JIRA_BOARD_ID_ANNOTATION}" value "${rawBoardId}" is not a positive integer`,
      );
    }

    const result = await callJira(res, async () => {
      const sprint = await jiraClient.getActiveSprint({ connection, boardId });
      if (!sprint) {
        return { sprint: null, issues: [], total: 0 } as JiraSprintResponse;
      }
      const sprintIssues = await jiraClient.getSprintIssues({
        connection,
        sprintId: sprint.id,
      });
      return {
        sprint,
        issues: sprintIssues.issues,
        total: sprintIssues.total,
      } as JiraSprintResponse;
    });
    if (!result) {
      return;
    }
    res.json(result);
  });

  router.get('/v1/status-counts', async (req, res) => {
    const { projectKeys, component, connection } = await resolveTarget(req);

    const counts = await callJira(res, () =>
      Promise.all(
        STATUS_CATEGORIES.map(category =>
          jiraClient.countIssues({
            connection,
            jql: buildJql({
              projectKeys,
              component,
              statusCategory: category.name,
            }),
          }),
        ),
      ),
    );
    if (!counts) {
      return;
    }

    const response: JiraStatusCountsResponse = {
      categories: STATUS_CATEGORIES.map((category, index) => ({
        id: category.id,
        name: category.name,
        count: counts[index],
      })),
      total: counts.reduce((sum, count) => sum + count, 0),
    };
    res.json(response);
  });

  return router;
}
