import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Flex,
  Link,
  SearchField,
  Select,
  Table,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import type { SortDescriptor } from '@backstage/ui';
import { jiraApiRef } from '../../api';
import { JiraFilterInfo, SORT_FIELDS, SortField } from '../../types';
import { issueColumnConfig, toIssueRows } from './issueColumns';
import { IssueDetailDialog } from './IssueDetailDialog';
import { SprintView } from './SprintView';
import { IssueQuery, parseQueryState, queryStateToParams } from './queryState';

const SEARCH_DEBOUNCE_MS = 300;

const JIRA_BOARD_ID_ANNOTATION = 'jira/board-id';

const IssuesView = (props: {
  entityRef: string;
  query: IssueQuery;
  onQueryChange: (next: IssueQuery) => void;
  onIssueClick: (issueKey: string) => void;
}) => {
  const { entityRef, query, onQueryChange, onIssueClick } = props;
  const jiraApi = useApi(jiraApiRef);

  // The un-debounced text field value; it flushes into the URL-backed query
  // state through the debounce below.
  const [searchInput, setSearchInput] = useState(query.search ?? '');
  // The last seen filter list, so the control stays rendered while reloading.
  const [filters, setFilters] = useState<JiraFilterInfo[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const search = searchInput.trim() || undefined;
      if (search !== query.search) {
        onQueryChange({ ...query, search, startAt: 0 });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, query, onQueryChange]);

  const { value, loading, error, retry } = useAsyncRetry(
    async () => {
      const response = await jiraApi.getIssues({
        entityRef,
        filter: query.filterId,
        sortBy: query.sortBy,
        order: query.order,
        search: query.search,
        startAt: query.startAt,
      });
      setFilters(response.filters);
      return response;
    },
    // Primitive deps: the query object is re-derived from the URL on every
    // render, so unrelated URL changes (like the view toggle) must not
    // re-trigger the fetch.
    [
      jiraApi,
      entityRef,
      query.filterId,
      query.sortBy,
      query.order,
      query.search,
      query.startAt,
    ],
  );

  const selectedFilter =
    query.filterId ?? value?.appliedFilter ?? filters.find(f => f.default)?.id;

  const filterOptions = useMemo(
    () => filters.map(f => ({ id: f.id, label: f.name })),
    [filters],
  );

  const onFilterChange = useCallback(
    (key: string | number | null) => {
      if (typeof key === 'string') {
        onQueryChange({ ...query, filterId: key, startAt: 0 });
      }
    },
    [query, onQueryChange],
  );

  const sortDescriptor: SortDescriptor | null = query.sortBy
    ? {
        column: query.sortBy,
        direction: query.order === 'asc' ? 'ascending' : 'descending',
      }
    : { column: 'updated', direction: 'descending' };

  const onSortChange = useCallback(
    (descriptor: SortDescriptor) => {
      const column = String(descriptor.column) as SortField;
      if (!SORT_FIELDS.includes(column)) {
        return;
      }
      onQueryChange({
        ...query,
        sortBy: column,
        order: descriptor.direction === 'ascending' ? 'asc' : 'desc',
        startAt: 0,
      });
    },
    [query, onQueryChange],
  );

  const total = value?.total ?? 0;
  const pageSize = value?.pageSize ?? 50;
  const startAt = value?.startAt ?? query.startAt;

  const onNextPage = useCallback(() => {
    onQueryChange({ ...query, startAt: query.startAt + pageSize });
  }, [query, onQueryChange, pageSize]);

  const onPreviousPage = useCallback(() => {
    onQueryChange({ ...query, startAt: Math.max(0, query.startAt - pageSize) });
  }, [query, onQueryChange, pageSize]);

  const rows = toIssueRows(value?.issues);

  if (error && !loading) {
    return (
      <Flex direction="column" align="start" gap="4">
        <Text>Failed to load Jira issues: {error.message}</Text>
        <Button onPress={retry}>Retry</Button>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {value && value.projects.length > 0 && (
        <Flex align="center" gap="2">
          <Text color="secondary" variant="body-small">
            {value.projects.length === 1 ? 'Project:' : 'Projects:'}
          </Text>
          {value.projects.map(project => (
            <Link
              key={project.key}
              href={project.url}
              target="_blank"
              rel="noopener"
            >
              {project.key}
            </Link>
          ))}
        </Flex>
      )}
      <Flex align="end" gap="2">
        {filterOptions.length > 0 && (
          <div style={{ minWidth: 220 }}>
            <Select
              name="jira-filter"
              label="Filter"
              options={filterOptions}
              selectedKey={selectedFilter ?? null}
              onSelectionChange={onFilterChange}
            />
          </div>
        )}
        <div style={{ minWidth: 260 }}>
          <SearchField
            name="jira-search"
            label="Search"
            placeholder="Search summaries"
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => setSearchInput('')}
          />
        </div>
      </Flex>
      <Table
        columnConfig={issueColumnConfig}
        data={rows}
        isPending={loading && !rows}
        isStale={loading && !!rows}
        sort={{ descriptor: sortDescriptor, onSortChange }}
        rowConfig={{ onClick: row => onIssueClick(row.key) }}
        pagination={{
          type: 'page',
          pageSize,
          offset: startAt,
          totalCount: total,
          hasPreviousPage: startAt > 0,
          hasNextPage: startAt + pageSize < total,
          onNextPage,
          onPreviousPage,
          showPageSizeOptions: false,
        }}
        emptyState={
          <Text>
            {query.search
              ? 'No issues match the current filter and search.'
              : 'No issues match the current filter.'}
          </Text>
        }
      />
    </Flex>
  );
};

export const JiraContent = () => {
  const { entity } = useEntity();
  const entityRef = stringifyEntityRef(entity);
  const hasBoard = Boolean(
    entity.metadata.annotations?.[JIRA_BOARD_ID_ANNOTATION],
  );

  // The URL is the single source of truth for the query state; every state
  // change rewrites the search params in place (no history entries).
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, view } = useMemo(
    () => parseQueryState(searchParams, { hasBoard }),
    [searchParams, hasBoard],
  );
  const onQueryChange = useCallback(
    (next: IssueQuery) => {
      setSearchParams(queryStateToParams(next, view), { replace: true });
    },
    [setSearchParams, view],
  );
  const onViewChange = useCallback(
    (next: 'issues' | 'sprint') => {
      setSearchParams(queryStateToParams(query, next), { replace: true });
    },
    [setSearchParams, query],
  );

  const [detailKey, setDetailKey] = useState<string | undefined>(undefined);

  return (
    <Flex direction="column" gap="4" p="4">
      {hasBoard && (
        <ToggleButtonGroup
          aria-label="View"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[view]}
          onSelectionChange={keys => {
            const next = [...keys][0];
            if (next === 'issues' || next === 'sprint') {
              onViewChange(next);
            }
          }}
        >
          <ToggleButton id="issues">Issues</ToggleButton>
          <ToggleButton id="sprint">Sprint</ToggleButton>
        </ToggleButtonGroup>
      )}
      {/* Both views stay mounted so the issues view keeps its query state
          while the sprint view is shown. */}
      <div style={{ display: view === 'issues' ? undefined : 'none' }}>
        <IssuesView
          entityRef={entityRef}
          query={query}
          onQueryChange={onQueryChange}
          onIssueClick={setDetailKey}
        />
      </div>
      {hasBoard && view === 'sprint' && (
        <SprintView entityRef={entityRef} onIssueClick={setDetailKey} />
      )}
      <IssueDetailDialog
        entityRef={entityRef}
        issueKey={detailKey}
        onClose={() => setDetailKey(undefined)}
      />
    </Flex>
  );
};
