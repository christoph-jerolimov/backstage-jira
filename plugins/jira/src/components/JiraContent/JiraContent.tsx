import { useCallback, useEffect, useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Cell,
  CellText,
  Flex,
  Link,
  SearchField,
  Select,
  Table,
  Text,
} from '@backstage/ui';
import type { ColumnConfig, SortDescriptor } from '@backstage/ui';
import { jiraApiRef } from '../../api';
import {
  JiraFilterInfo,
  JiraIssue,
  SORT_FIELDS,
  SortField,
  SortOrder,
} from '../../types';

type IssueRow = JiraIssue & { id: string };

const SEARCH_DEBOUNCE_MS = 300;

const sortable = (id: string) =>
  SORT_FIELDS.includes(id as SortField) ? { isSortable: true } : {};

const columnConfig: readonly ColumnConfig<IssueRow>[] = [
  {
    id: 'key',
    label: 'Key',
    isRowHeader: true,
    ...sortable('key'),
    cell: issue => (
      <Cell>
        <Link href={issue.url} target="_blank" rel="noopener">
          {issue.key}
        </Link>
      </Cell>
    ),
  },
  {
    id: 'summary',
    label: 'Summary',
    ...sortable('summary'),
    cell: issue => <CellText title={issue.summary} />,
  },
  {
    id: 'type',
    label: 'Type',
    cell: issue => <CellText title={issue.type.name ?? '—'} />,
  },
  {
    id: 'status',
    label: 'Status',
    ...sortable('status'),
    cell: issue => <CellText title={issue.status.name ?? '—'} />,
  },
  {
    id: 'priority',
    label: 'Priority',
    ...sortable('priority'),
    cell: issue => <CellText title={issue.priority.name ?? '—'} />,
  },
  {
    id: 'assignee',
    label: 'Assignee',
    cell: issue => (
      <CellText title={issue.assignee?.displayName ?? 'Unassigned'} />
    ),
  },
  {
    id: 'updated',
    label: 'Updated',
    ...sortable('updated'),
    cell: issue => (
      <CellText
        title={issue.updated ? new Date(issue.updated).toLocaleString() : '—'}
      />
    ),
  },
];

interface IssueQuery {
  filterId?: string;
  sortBy?: SortField;
  order?: SortOrder;
  search?: string;
  startAt: number;
}

export const JiraContent = () => {
  const { entity } = useEntity();
  const jiraApi = useApi(jiraApiRef);
  const entityRef = stringifyEntityRef(entity);

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

  const rows: IssueRow[] | undefined = value?.issues.map(issue => ({
    ...issue,
    id: issue.key,
  }));

  if (error && !loading) {
    return (
      <Flex direction="column" align="start" gap="4" p="4">
        <Text>Failed to load Jira issues: {error.message}</Text>
        <Button onPress={retry}>Retry</Button>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" p="4">
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
      <Table<IssueRow>
        columnConfig={columnConfig}
        data={rows}
        isPending={loading && !rows}
        isStale={loading && !!rows}
        sort={{ descriptor: sortDescriptor, onSortChange }}
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
