import { useCallback, useEffect, useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Flex,
  SearchField,
  Select,
  Table,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import type { SortDescriptor } from '@backstage/ui';
import { jiraApiRef } from '../../api';
import {
  JiraFilterInfo,
  SORT_FIELDS,
  SortField,
  SortOrder,
} from '../../types';
import { issueColumnConfig, toIssueRows } from './issueColumns';
import { IssueDetailDialog } from './IssueDetailDialog';
import { SprintView } from './SprintView';

const SEARCH_DEBOUNCE_MS = 300;

const JIRA_BOARD_ID_ANNOTATION = 'jira/board-id';

interface IssueQuery {
  filterId?: string;
  sortBy?: SortField;
  order?: SortOrder;
  search?: string;
  startAt: number;
}

const IssuesView = (props: {
  entityRef: string;
  onIssueClick: (issueKey: string) => void;
}) => {
  const { entityRef, onIssueClick } = props;
  const jiraApi = useApi(jiraApiRef);

  // filterId/sortBy/order stay undefined until the user picks them, letting
  // the backend apply its defaults. Any non-paging change resets startAt.
  const [query, setQuery] = useState<IssueQuery>({ startAt: 0 });
  const [searchInput, setSearchInput] = useState('');
  // The last seen filter list, so the control stays rendered while reloading.
  const [filters, setFilters] = useState<JiraFilterInfo[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(prev => {
        const search = searchInput.trim() || undefined;
        return search === prev.search ? prev : { ...prev, search, startAt: 0 };
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { value, loading, error, retry } = useAsyncRetry(async () => {
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
  }, [jiraApi, entityRef, query]);

  const selectedFilter =
    query.filterId ?? value?.appliedFilter ?? filters.find(f => f.default)?.id;

  const filterOptions = useMemo(
    () => filters.map(f => ({ id: f.id, label: f.name })),
    [filters],
  );

  const onFilterChange = useCallback((key: string | number | null) => {
    if (typeof key === 'string') {
      setQuery(prev => ({ ...prev, filterId: key, startAt: 0 }));
    }
  }, []);

  const sortDescriptor: SortDescriptor | null = query.sortBy
    ? {
        column: query.sortBy,
        direction: query.order === 'asc' ? 'ascending' : 'descending',
      }
    : { column: 'updated', direction: 'descending' };

  const onSortChange = useCallback((descriptor: SortDescriptor) => {
    const column = String(descriptor.column) as SortField;
    if (!SORT_FIELDS.includes(column)) {
      return;
    }
    setQuery(prev => ({
      ...prev,
      sortBy: column,
      order: descriptor.direction === 'ascending' ? 'asc' : 'desc',
      startAt: 0,
    }));
  }, []);

  const total = value?.total ?? 0;
  const pageSize = value?.pageSize ?? 50;
  const startAt = value?.startAt ?? query.startAt;

  const onNextPage = useCallback(() => {
    setQuery(prev => ({ ...prev, startAt: prev.startAt + pageSize }));
  }, [pageSize]);

  const onPreviousPage = useCallback(() => {
    setQuery(prev => ({
      ...prev,
      startAt: Math.max(0, prev.startAt - pageSize),
    }));
  }, [pageSize]);

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

  const [view, setView] = useState<'issues' | 'sprint'>('issues');
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
              setView(next);
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
        <IssuesView entityRef={entityRef} onIssueClick={setDetailKey} />
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
